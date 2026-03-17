import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { getEquipmentStatus, STAGE_LABELS } from '../domain/kitchen.js';

function _fmtSec(s) {
  s = Math.round(s);
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}м ${r}с` : `${m}м`;
}

export class BottleneckModal extends BaseComponent {
  static properties = {
    _visible: { state: true },
    _issue: { state: true },
    kitchen: { type: Object },
    simNow: { type: Object },
  };

  constructor() {
    super();
    this._visible = false;
    this._issue = null;
    this.kitchen = null;
    this.simNow = null;
  }

  open(issue, kitchen, simNow) {
    this._issue = issue;
    this.kitchen = kitchen;
    this.simNow = simNow;
    this._visible = true;
  }

  close() { this._visible = false; this._issue = null; }
  _onOverlayClick(e) { if (e.target === e.currentTarget) this.close(); }

  render() {
    if (!this._visible || !this._issue || !this.kitchen) return nothing;
    const issue = this._issue;
    const cls = issue.severity >= 3 ? 'bn-crit' : issue.severity >= 2 ? 'bn-warn' : 'bn-info';

    return html`
      <div class="modal-overlay" style="display:flex" @click=${this._onOverlayClick}>
        <div class="modal-content bottleneck-modal">
          <button class="modal-close" @click=${() => this.close()}>✕</button>
          <div class="modal-body">
            <div class="bnm-header ${cls}">
              <span class="bnm-icon">${issue.icon}</span>
              <div><h3>${issue.title}</h3><div class="bnm-sub">${issue.detail}</div></div>
            </div>
            ${this._renderDetail(issue)}
          </div>
        </div>
      </div>`;
  }

  _renderDetail(issue) {
    switch (issue.type) {
      case 'station': return this._buildStationDetail(issue);
      case 'cooks_busy': return this._buildCooksBusyDetail();
      case 'cooks_idle': return this._buildCooksIdleDetail();
      case 'equipment': return this._buildEquipmentDetail(issue);
      case 'late_orders': return this._buildLateOrdersDetail();
      case 'client_refusals': return this._buildClientRefusalsDetail();
      case 'client_abandoned': return this._buildClientAbandonedDetail();
      default: return html`<p>${issue.detail}</p>`;
    }
  }

  _buildStationDetail(issue) {
    const k = this.kitchen;
    const station = k.stations.find(s => s.id === issue.data.stationId);
    if (!station) return nothing;

    const queue = k.stationQueues[station.id] || [];
    const cooksOnStation = k.cooks.filter(c => c.status === 'busy' && c.stations?.includes(station.id));
    const idleCooks = k.cooks.filter(c => c.status === 'idle' && c.stations?.includes(station.id));
    const eqStatus = getEquipmentStatus(k);

    return html`
      <div class="bnm-section">
        <h4>📊 Состояние станции</h4>
        <div class="bnm-stats">
          <div class="bnm-stat"><div class="bnm-stat-val">${station.currentLoad}/${station.parallelSlots}</div><div class="bnm-stat-lbl">Загрузка</div></div>
          <div class="bnm-stat"><div class="bnm-stat-val">${queue.length}</div><div class="bnm-stat-lbl">В очереди</div></div>
          <div class="bnm-stat"><div class="bnm-stat-val">${cooksOnStation.length}</div><div class="bnm-stat-lbl">Повара работают</div></div>
          <div class="bnm-stat"><div class="bnm-stat-val">${idleCooks.length}</div><div class="bnm-stat-lbl">Повара свободны</div></div>
        </div>
      </div>
      ${cooksOnStation.length > 0 ? html`
        <div class="bnm-section"><h4>👨‍🍳 Повара на станции</h4><div class="bnm-list">
          ${cooksOnStation.map(cook => {
            const order = k.activeOrders.find(o => o.id === cook.currentOrderId);
            const pos = order?.positions?.[cook.currentPositionIdx];
            const stage = pos?.stages?.[cook.currentStageIdx];
            return html`<div class="bnm-row"><span>👨‍🍳 ${cook.name}</span><span>${pos ? `${pos.dishEmoji} ${pos.dishName} [${stage ? (STAGE_LABELS[stage.type] || stage.type) : ''}]` : '—'}</span><span>${stage ? `${Math.ceil(stage.remainingSec)}с` : '—'}</span></div>`;
          })}
        </div></div>` : nothing}
      ${this._renderStationEquipment(station, eqStatus, k)}
      ${queue.length > 0 ? html`
        <div class="bnm-section"><h4>📥 Очередь (${queue.length})</h4><div class="bnm-list">
          ${queue.slice(0, 10).map(item => {
            const order = k.activeOrders.find(o => o.id === item.orderId);
            if (!order) return nothing;
            return html`<div class="bnm-row"><span>${order.id}</span><span>${order.positions.map(p => p.dishEmoji).join('')}</span><span>${order.totalPrice}₽</span></div>`;
          })}
          ${queue.length > 10 ? html`<div class="bnm-more">...и ещё ${queue.length - 10}</div>` : nothing}
        </div></div>` : nothing}
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${queue.length >= 5 && idleCooks.length === 0 ? `Критическая очередь. Добавьте ещё повара на станцию "${station.name}".` : queue.length >= 3 && idleCooks.length > 0 ? `Есть свободные повара. Проверьте привязку к "${station.name}".` : `Следите за динамикой — если очередь растёт, потребуются доп. ресурсы.`}</p></div>`;
  }

  _renderStationEquipment(station, eqStatus, k) {
    const stationEqs = Object.entries(eqStatus).filter(([eqId]) => {
      const eq = k.equipment.find(e => e.id === eqId);
      return eq && eq.station === station.id;
    });
    if (stationEqs.length === 0) return nothing;

    return html`
      <div class="bnm-section"><h4>🔧 Оборудование</h4>
        ${stationEqs.map(([, eq]) => html`
          <div class="bnm-eq">
            <strong>${eq.emoji} ${eq.name}</strong>: ${eq.current}/${eq.capacity} занято, ${eq.free} свободно
            ${eq.items?.length > 0 ? html`<div class="bnm-eq-items">${eq.items.map(it => html`<span class="bnm-eq-item">${it.dishEmoji} ${it.dishName} — ${Math.ceil(it.remainingSec)}с</span>`)}</div>` : nothing}
          </div>`)}
      </div>`;
  }

  _buildCooksBusyDetail() {
    const k = this.kitchen;
    return html`
      <div class="bnm-section"><h4>👨‍🍳 Все повара</h4><div class="bnm-list">
        ${k.cooks.map(cook => {
          const order = k.activeOrders.find(o => o.id === cook.currentOrderId);
          const pos = order?.positions?.[cook.currentPositionIdx];
          const stage = pos?.stages?.[cook.currentStageIdx];
          return html`<div class="bnm-row"><span>${cook.emoji} ${cook.name}</span><span>${pos ? `${pos.dishEmoji} ${pos.dishName} [${stage ? (STAGE_LABELS[stage.type] || stage.type) : ''}]` : cook.equipmentId ? '🔧 Оборудование' : '—'}</span><span>${stage ? `${Math.ceil(stage.remainingSec)}с` : '—'}</span></div>`;
        })}
      </div></div>
      ${this._renderQueueBreakdown()}
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>Все повара заняты. Добавьте дополнительных сотрудников на загруженные станции.</p></div>`;
  }

  _buildCooksIdleDetail() {
    const k = this.kitchen;
    return html`
      <div class="bnm-section"><h4>👨‍🍳 Статус поваров</h4><div class="bnm-list">
        ${k.cooks.map(cook => {
          const status = cook.status === 'busy' ? '🔥 Занят' : '💤 Свободен';
          const stNames = (cook.stations || []).map(sId => { const st = k.stations.find(s => s.id === sId); return st ? `${st.emoji} ${st.name}` : sId; }).join(', ');
          return html`<div class="bnm-row"><span>${cook.emoji} ${cook.name} — ${status}</span><span>${stNames}</span></div>`;
        })}
      </div></div>
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>Сотрудники простаивают. Рассмотрите перераспределение на другие станции.</p></div>`;
  }

  _buildEquipmentDetail(issue) {
    const eqStatus = getEquipmentStatus(this.kitchen);
    const eq = eqStatus[issue.data.eqId];
    if (!eq) return nothing;

    const eqObj = this.kitchen.equipment.find(e => e.id === issue.data.eqId);
    const station = eqObj ? this.kitchen.stations.find(s => s.id === eqObj.station) : null;
    const queue = station ? (this.kitchen.stationQueues[station.id] || []) : [];
    const cook = this.kitchen.cooks.find(c => c.equipmentId === issue.data.eqId);

    return html`
      <div class="bnm-section"><h4>📊 Оборудование</h4><div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${eq.current}/${eq.capacity}</div><div class="bnm-stat-lbl">Загрузка</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${eq.free}</div><div class="bnm-stat-lbl">Свободно</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${queue.length}</div><div class="bnm-stat-lbl">В очереди</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${cook?.name || '—'}</div><div class="bnm-stat-lbl">Ответственный</div></div>
      </div></div>
      ${eq.items?.length > 0 ? html`<div class="bnm-section"><h4>🔥 Сейчас в работе</h4><div class="bnm-list">
        ${eq.items.map(it => html`<div class="bnm-row"><span>${it.dishEmoji} ${it.dishName} ×${it.slotsUsed}</span><span><div class="bnm-mini-bar"><div class="bnm-mini-fill" style="width:${it.totalSec > 0 ? Math.round(((it.totalSec - it.remainingSec) / it.totalSec) * 100) : 0}%"></div></div></span><span>${Math.ceil(it.remainingSec)}с</span></div>`)}
      </div></div>` : nothing}
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${eq.free === 0 ? 'Полностью загружено. Добавьте единицы оборудования.' : 'Мощность на пределе. Следите за динамикой.'}</p></div>`;
  }

  _buildLateOrdersDetail() {
    const now = this.simNow ? new Date(this.simNow).getTime() : 0;
    const lateOrders = [];
    for (const order of this.kitchen.activeOrders) {
      const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
      const elapsed = now - baseMs;
      if (elapsed > order.deadlineSec * 1000) lateOrders.push({ order, overSec: (elapsed - order.deadlineSec * 1000) / 1000 });
    }
    lateOrders.sort((a, b) => b.overSec - a.overSec);

    return html`
      <div class="bnm-section"><h4>🔴 Опаздывающие заказы (${lateOrders.length})</h4>
        ${lateOrders.map(({ order, overSec }) => {
          const stages = [];
          for (const pos of order.positions) for (const s of pos.stages) {
            if (s.status === 'active') stages.push(`${pos.dishEmoji} ${STAGE_LABELS[s.type] || s.type} (${Math.ceil(s.remainingSec)}с)`);
            else if (s.status === 'waiting') stages.push(`${pos.dishEmoji} ${STAGE_LABELS[s.type] || s.type} (ожидает)`);
          }
          return html`<div class="bnm-late-order">
            <div class="bnm-row"><span><strong>${order.id}</strong></span><span>${order.positions.map(p => p.dishEmoji).join('')}</span><span class="bnm-over">-${_fmtSec(overSec)}</span></div>
            ${stages.length > 0 ? html`<div class="bnm-stages">${stages.map(s => html`<span class="bnm-stage-chip">${s}</span>`)}</div>` : nothing}
          </div>`;
        })}
      </div>
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>Усильте загруженные станции дополнительными ресурсами.</p></div>`;
  }

  _buildClientRefusalsDetail() {
    const refusals = this.kitchen.failedOrders.filter(o => o.failReason === 'CLIENT_REFUSED');
    const total = this.kitchen.stats.totalOrders || 1;
    const pct = Math.round((refusals.length / total) * 100);
    const lostRevenue = refusals.reduce((s, o) => s + o.totalPrice, 0);

    const buckets = { '0-5м': 0, '5-15м': 0, '15-30м': 0, '30-60м': 0, '60+м': 0 };
    for (const o of refusals) {
      const w = o.waitMinutes || 0;
      if (w <= 5) buckets['0-5м']++; else if (w <= 15) buckets['5-15м']++; else if (w <= 30) buckets['15-30м']++; else if (w <= 60) buckets['30-60м']++; else buckets['60+м']++;
    }

    return html`
      <div class="bnm-section"><h4>📊 Сводка</h4><div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${refusals.length}</div><div class="bnm-stat-lbl">Отказов</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${pct}%</div><div class="bnm-stat-lbl">От всех заказов</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${(lostRevenue / 1000).toFixed(1)}к</div><div class="bnm-stat-lbl">Потеряно ₽</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${refusals.length > 0 ? Math.round(refusals.reduce((s, o) => s + (o.waitMinutes || 0), 0) / refusals.length) : 0}м</div><div class="bnm-stat-lbl">Ср. ожидание</div></div>
      </div></div>
      <div class="bnm-section"><h4>⏱ По времени ожидания</h4><div class="bnm-list">
        ${Object.entries(buckets).filter(([, c]) => c > 0).map(([range, count]) => html`<div class="bnm-row"><span>⏱ ${range}</span><span>${count} отказов</span><span>${Math.round((count / refusals.length) * 100)}%</span></div>`)}
      </div></div>
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${pct >= 15 ? 'Критический уровень. Увеличьте пропускную способность.' : 'Следите за динамикой отказов.'}</p></div>`;
  }

  _buildClientAbandonedDetail() {
    const abandoned = this.kitchen.failedOrders.filter(o => o.failReason === 'CLIENT_ABANDONED');
    const total = this.kitchen.stats.totalOrders || 1;
    const pct = Math.round((abandoned.length / total) * 100);
    const lostRevenue = abandoned.reduce((s, o) => s + o.totalPrice, 0);

    const avgWaitMin = abandoned.length > 0
      ? Math.round(abandoned.reduce((s, o) => {
          const w = o.completedAt && o.createdAt
            ? (new Date(o.completedAt) - new Date(o.createdAt)) / 60000
            : 0;
          return s + w;
        }, 0) / abandoned.length)
      : 0;

    return html`
      <div class="bnm-section"><h4>📊 Сводка</h4><div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${abandoned.length}</div><div class="bnm-stat-lbl">Ушли</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${pct}%</div><div class="bnm-stat-lbl">От всех заказов</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${(lostRevenue / 1000).toFixed(1)}к</div><div class="bnm-stat-lbl">Потеряно ₽</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${avgWaitMin}м</div><div class="bnm-stat-lbl">Ср. ожидание</div></div>
      </div></div>
      <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${
        pct >= 10
          ? 'Критический уровень потерь. Клиенты уходят не дождавшись заказа. Нужно увеличить пропускную способность кухни или снизить нагрузку на слоты.'
          : 'Клиенты начинают уходить. Следите за очередями и временем выполнения.'
      }</p></div>`;
  }

  _renderQueueBreakdown() {
    const k = this.kitchen;
    const entries = Object.entries(k.stationQueues || {}).filter(([, q]) => q.length > 0);
    if (entries.length === 0) return nothing;
    const total = entries.reduce((s, [, q]) => s + q.length, 0);
    return html`
      <div class="bnm-section"><h4>📥 Очереди по станциям (${total})</h4><div class="bnm-list">
        ${entries.map(([stId, q]) => {
          const st = k.stations.find(s => s.id === stId);
          return html`<div class="bnm-row"><span>${st?.emoji || '🔧'} ${st?.name || stId}</span><span>${q.length} в очереди</span></div>`;
        })}
      </div></div>`;
  }
}

customElements.define('bottleneck-modal', BottleneckModal);
