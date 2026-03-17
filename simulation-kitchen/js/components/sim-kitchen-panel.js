import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { STAGE_LABELS, getEquipmentStatus, estimateQueueETAs } from '../domain/kitchen.js';

export class SimKitchenPanel extends BaseComponent {
  static properties = {
    kitchen: { type: Object },
    simNow: { type: Object },
  };

  constructor() {
    super();
    this.kitchen = null;
    this.simNow = null;
  }

  _fmtSec(s) {
    s = Math.ceil(s);
    if (s < 60) return `${s}с`;
    const m = Math.floor(s / 60), r = s % 60;
    return r > 0 ? `${m}м${r}с` : `${m}м`;
  }

  _onOrderClick(orderId) {
    this.dispatchEvent(new CustomEvent('order-click', {
      detail: { orderId }, bubbles: true, composed: true,
    }));
  }

  _renderFatigueBadge(cook) {
    const fm = cook.fatigueMultiplier || 1.0;
    if (fm <= 1.01) return nothing;
    const slowPct = Math.round((fm - 1) * 100);
    const speedPct = Math.round((1 / fm) * 100);
    const workH = Math.round(cook.continuousWorkSec / 3600 * 10) / 10;
    const cls = fm >= 1.3 ? 'fatigue-crit' : fm >= 1.15 ? 'fatigue-warn' : 'fatigue-mild';
    return html`
      <div class="cook-fatigue ${cls}">
        <span class="fatigue-icon">😓</span>
        <span class="fatigue-text">Скорость ${speedPct}% · +${slowPct}% к времени · ${workH}ч работы</span>
      </div>`;
  }

  _renderCook(cook, eqStatus) {
    const k = this.kitchen;

    if (cook.status !== 'busy') {
      return html`
        <div class="cook-card">
          <div class="cook-card-header">
            <span class="cook-emoji">${cook.emoji}</span>
            <span class="cook-name">${cook.name}</span>
            <span class="cook-badge idle">Свободен</span>
          </div>
          ${this._renderFatigueBadge(cook)}
        </div>`;
    }

    if (cook.equipmentId) {
      return this._renderCookWithEquipment(cook, eqStatus);
    }

    return this._renderCookWithOrder(cook);
  }

  _renderCookWithEquipment(cook, eqStatus) {
    const k = this.kitchen;
    const eq = eqStatus[cook.equipmentId];
    if (!eq) {
      return html`
        <div class="cook-card busy">
          <div class="cook-card-header">
            <span class="cook-emoji">${cook.emoji}</span>
            <span class="cook-name">${cook.name}</span>
            <span class="cook-badge working">Работает</span>
          </div>
        </div>`;
    }

    const fillPct = eq.capacity > 0 ? Math.round((eq.current / eq.capacity) * 100) : 0;

    const orderGroups = new Map();
    for (const item of eq.items) {
      if (!orderGroups.has(item.orderId)) {
        orderGroups.set(item.orderId, []);
      }
      orderGroups.get(item.orderId).push(item);
    }

    return html`
      <div class="cook-card busy">
        <div class="cook-card-header">
          <span class="cook-emoji">${cook.emoji}</span>
          <span class="cook-name">${cook.name}</span>
          <span class="cook-badge working">${eq.emoji} ${eq.name}</span>
        </div>

        <div class="cook-eq-bar">
          <div class="cook-eq-bar-track">
            <div class="cook-eq-bar-fill" style="width:${fillPct}%"></div>
          </div>
          <span class="cook-eq-bar-label">
            <span class="eq-fill">${eq.current}</span>/<span>${eq.capacity}</span>
            <span class="eq-free-tag">${eq.free} своб.</span>
          </span>
        </div>

        ${this._renderFatigueBadge(cook)}

        <div class="cook-orders-list">
          ${[...orderGroups.entries()].map(([orderId, items]) =>
            this._renderEquipmentOrderGroup(orderId, items)
          )}
        </div>
      </div>`;
  }

  _renderEquipmentOrderGroup(orderId, items) {
    const dishMap = new Map();
    let maxRemaining = 0;
    let maxTotal = 0;

    for (const item of items) {
      const key = item.dishEmoji + item.dishName;
      if (!dishMap.has(key)) {
        dishMap.set(key, { emoji: item.dishEmoji, name: item.dishName, count: 0, slots: 0 });
      }
      const d = dishMap.get(key);
      d.count++;
      d.slots += item.slotsUsed;
      if (item.remainingSec > maxRemaining) maxRemaining = item.remainingSec;
      if (item.totalTimeSec > maxTotal) maxTotal = item.totalTimeSec;
    }

    const pct = maxTotal > 0 ? Math.round(((maxTotal - maxRemaining) / maxTotal) * 100) : 0;
    const dishes = [...dishMap.values()];

    return html`
      <div class="cook-order-group" @click=${() => this._onOrderClick(orderId)}>
        <div class="cook-order-group-header">
          <span class="cook-order-id">${orderId}</span>
          <span class="cook-order-timer">${this._fmtSec(maxRemaining)}</span>
        </div>
        <div class="cook-order-dishes">
          ${dishes.map(d => html`
            <span class="cook-order-dish">
              ${d.emoji}${d.count > 1 ? html`<span class="dish-qty">×${d.count}</span>` : nothing}
            </span>`)}
        </div>
        <div class="cook-order-progress">
          <div class="cook-order-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  _renderCookWithOrder(cook) {
    const k = this.kitchen;
    const order = k.activeOrders.find(o => o.id === cook.currentOrderId);
    const pos = order?.positions?.[cook.currentPositionIdx];
    const stage = pos?.stages?.[cook.currentStageIdx];

    if (!stage) {
      return html`
        <div class="cook-card busy">
          <div class="cook-card-header">
            <span class="cook-emoji">${cook.emoji}</span>
            <span class="cook-name">${cook.name}</span>
            <span class="cook-badge working">Готовит</span>
          </div>
        </div>`;
    }

    const stageLabel = STAGE_LABELS[stage.type] || stage.type;
    const total = stage.totalTimeSec || 1;
    const done = total - stage.remainingSec;
    const pct = Math.min(total > 0 ? (done / total) * 100 : 0, 100);

    const allDishes = order ? order.positions.map(p => p.dishEmoji).join('') : '';

    return html`
      <div class="cook-card busy">
        <div class="cook-card-header">
          <span class="cook-emoji">${cook.emoji}</span>
          <span class="cook-name">${cook.name}</span>
          <span class="cook-badge working">${stageLabel}</span>
        </div>

        ${this._renderFatigueBadge(cook)}

        <div class="cook-order-group" @click=${() => order && this._onOrderClick(order.id)}>
          <div class="cook-order-group-header">
            <span class="cook-order-id">${order?.id || '?'}</span>
            <span class="cook-order-timer">${this._fmtSec(stage.remainingSec)}</span>
          </div>
          <div class="cook-order-active-dish">
            <span>${pos.dishEmoji} ${pos.dishName}</span>
            ${order && order.positions.length > 1
              ? html`<span class="cook-order-all-dishes">${allDishes}</span>`
              : nothing}
          </div>
          <div class="cook-order-progress">
            <div class="cook-order-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>`;
  }

  _renderStation(st, eqStatus) {
    const k = this.kitchen;
    const queueLen = (k.stationQueues[st.id] || []).length;
    const loadText = `${st.currentLoad}/${st.parallelSlots}` + (queueLen > 0 ? ` (+${queueLen})` : '');

    const stationEqs = Object.entries(eqStatus).filter(([eqId]) => {
      const eq = k.equipment.find(e => e.id === eqId);
      return eq && eq.station === st.id;
    });

    const eqDetail = stationEqs.length > 0
      ? stationEqs.map(([, s]) => `${s.emoji} ${s.current}/${s.capacity}`).join(' · ')
      : null;

    const classes = [
      'station-chip',
      st.currentLoad > 0 ? 'active' : '',
      st.currentLoad >= st.parallelSlots ? 'overloaded' : '',
    ].filter(Boolean).join(' ');

    return html`
      <div class=${classes}>
        <span class="station-emoji">${st.emoji}</span>
        <span class="station-name">${st.name}</span>
        <span class="station-load">${loadText}</span>
        ${eqDetail ? html`<div class="station-eq-detail">${eqDetail}</div>` : nothing}
      </div>`;
  }

  _renderQueue() {
    const k = this.kitchen;
    let totalQueued = 0;
    for (const q of Object.values(k.stationQueues || {})) totalQueued += q.length;

    const waitingOrders = k.activeOrders.filter(o =>
      o.positions.some(p => p.stages.some(s => s.status === 'waiting'))
    );

    const etas = estimateQueueETAs(k);
    const maxShow = 10;
    const items = waitingOrders.slice(0, maxShow);

    return html`
      <div class="kitchen-section">
        <h4>📥 Очередь заказов <span class="badge">${totalQueued}</span></h4>
        <div class="order-queue">
          ${items.map(order => {
            const eta = etas[order.id];
            const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
            const cookingSec = this.simNow
              ? (new Date(this.simNow).getTime() - baseMs) / 1000
              : 0;
            const isOverdue = cookingSec > (order.deadlineSec || 900);
            return html`
              <div class="queue-item ${isOverdue ? 'queue-overdue' : ''}" @click=${() => this._onOrderClick(order.id)}>
                <span class="queue-id">${order.id}</span>
                <span class="queue-dishes">${order.positions.map(p => p.dishEmoji).join('')}</span>
                ${eta ? html`<span class="queue-eta">~${this._fmtSec(eta)}</span>` : nothing}
                <span class="queue-price">${order.totalPrice}₽</span>
              </div>`;
          })}
          ${waitingOrders.length > maxShow
            ? html`<div style="font-size:11px;color:#5a6688;padding:4px">...и ещё ${waitingOrders.length - maxShow}</div>`
            : nothing}
        </div>
      </div>`;
  }

  render() {
    if (!this.kitchen) return html`<h3>🍳 Кухня</h3>`;

    const eqStatus = getEquipmentStatus(this.kitchen);

    return html`
      <h3>🍳 Кухня</h3>

      <div class="kitchen-section">
        <h4>👨‍🍳 Повара</h4>
        <div class="cooks-grid">
          ${this.kitchen.cooks.map(c => this._renderCook(c, eqStatus))}
        </div>
      </div>

      <div class="kitchen-section">
        <h4>🔧 Станции</h4>
        <div class="stations-grid">
          ${this.kitchen.stations.map(st => this._renderStation(st, eqStatus))}
        </div>
      </div>

      ${this._renderQueue()}`;
  }
}

customElements.define('sim-kitchen-panel', SimKitchenPanel);
