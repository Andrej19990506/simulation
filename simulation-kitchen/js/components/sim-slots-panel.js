import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { getBranchSlots } from '../domain/slotModel.js';
import { getOrdersBySlot } from '../domain/kitchen.js';
import { formatTime, formatTimeShort } from '../ui/helpers.js';

const FAIL_REASONS = {
  CLIENT_REFUSED: { icon: '🚫', label: 'Клиент отказался', detail: 'Слишком долго ждать' },
  CLIENT_ABANDONED: { icon: '🚶', label: 'Клиент ушёл', detail: 'Не дождался заказа' },
  NO_AVAILABLE_SLOTS: { icon: '📵', label: 'Нет свободных слотов', detail: 'Все слоты заполнены' },
};

function _fmtSec(sec) {
  if (sec == null || sec < 0) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}м${s > 0 ? s + 'с' : ''}` : `${s}с`;
}

export class SimSlotsPanel extends BaseComponent {
  static properties = {
    slotsByBranch: { type: Object },
    branchId: { type: String },
    simNow: { type: Object },
    kitchen: { type: Object },
    _expandedSlotId: { state: true },
    _hoveredOrderId: { state: true },
  };

  constructor() {
    super();
    this.slotsByBranch = {};
    this.branchId = '';
    this.simNow = null;
    this.kitchen = null;
    this._expandedSlotId = null;
    this._hoveredOrderId = null;
  }

  _toggleSlot(slotId) {
    this._expandedSlotId = this._expandedSlotId === slotId ? null : slotId;
  }

  _onOrderClick(orderId, e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('order-click', { detail: { orderId }, bubbles: true, composed: true }));
  }

  _onOrderEnter(orderId, e) {
    e.stopPropagation();
    this._hoveredOrderId = orderId;
  }

  _onOrderLeave(orderId, e) {
    if (this._hoveredOrderId === orderId) this._hoveredOrderId = null;
  }

  _renderSlotOrders(slot) {
    if (!this.kitchen) return nothing;
    const orders = getOrdersBySlot(this.kitchen, slot.id);
    if (orders.length === 0) return html`<div class="slot-no-orders">Нет заказов</div>`;

    const now = this.simNow ? new Date(this.simNow).getTime() : 0;
    const completed = orders.filter(o => o.status === 'completed');
    const failed = orders.filter(o => o.status === 'failed' || o.status === 'abandoned');
    const active = orders.filter(o => o.status === 'active' || o.status === 'scheduled');
    const late = completed.filter(o => o.isLate);

    return html`
      <div class="so-summary">
        <span class="so-sum-chip done">${completed.length} готово</span>
        ${late.length > 0 ? html`<span class="so-sum-chip late">${late.length} опозд.</span>` : nothing}
        ${failed.length > 0 ? html`<span class="so-sum-chip failed">${failed.length} потеряно</span>` : nothing}
        ${active.length > 0 ? html`<span class="so-sum-chip active">${active.length} в работе</span>` : nothing}
      </div>
      <div class="slot-orders-list">
        ${orders.map(order => this._renderOrderCard(order, now))}
      </div>`;
  }

  _renderOrderCard(order, now) {
    const dishes = order.positions.map(p => html`
      <span class="so-dish" title="${p.dishName} ×${p.quantity}">${p.dishEmoji}</span>
    `);
    const statusCls = order.status === 'completed' ? (order.isLate ? 'row-late' : 'row-done')
      : (order.status === 'failed' || order.status === 'abandoned') ? 'row-failed'
      : order.status === 'scheduled' ? 'row-scheduled' : 'row-active';
    const isHovered = this._hoveredOrderId === order.id;

    return html`
      <div class="slot-order-row ${statusCls} ${isHovered ? 'so-open' : ''}"
           @click=${(e) => this._onOrderClick(order.id, e)}
           @mouseenter=${(e) => this._onOrderEnter(order.id, e)}
           @mouseleave=${(e) => this._onOrderLeave(order.id, e)}>
        <span class="so-id">${order.id.replace('order-', '#')}</span>
        ${order.comboName ? html`<span class="so-combo-tag">📦</span>` : nothing}
        <span class="so-dishes">${dishes}</span>
        ${this._renderOrderBadge(order, now)}
        <span class="so-price">${order.totalPrice}₽</span>
        ${isHovered ? html`<div class="so-tooltip so-visible">${this._renderTooltip(order, now)}</div>` : nothing}
      </div>`;
  }

  _renderTooltip(order, now) {
    const created = formatTimeShort(order.createdAt);
    const lines = [];
    if (order.comboName) {
      lines.push(html`<div class="sot-row sot-combo">📦 ${order.comboName}</div>`);
    }
    lines.push(html`<div class="sot-row"><span class="sot-label">Создан:</span> ${created}</div>`);

    if (order.startedAt) {
      lines.push(html`<div class="sot-row"><span class="sot-label">На кухне:</span> ${formatTimeShort(order.startedAt)}</div>`);
    }

    if (order.status === 'completed') {
      lines.push(html`<div class="sot-row"><span class="sot-label">Готов:</span> ${formatTimeShort(order.completedAt)}</div>`);
      lines.push(html`<div class="sot-row"><span class="sot-label">Готовка:</span> ${_fmtSec(order.execSec)}</div>`);
      if (order.isLate) {
        const overSec = (order.execSec || 0) - order.deadlineSec;
        lines.push(html`<div class="sot-row sot-warn">⏰ Опоздал на ${_fmtSec(overSec)}</div>`);
        if (order.fatigueAffected) {
          const slowPct = Math.round((order.maxFatigue - 1) * 100);
          lines.push(html`<div class="sot-row sot-warn">😓 Усталость повара: +${slowPct}% к времени</div>`);
        }
      }
    }

    if (order.status === 'failed' || order.status === 'abandoned') {
      const reason = FAIL_REASONS[order.failReason] || { icon: '❌', label: order.failReason || 'Неизвестно', detail: '' };
      lines.push(html`<div class="sot-row sot-fail">${reason.icon} ${reason.label}</div>`);
      if (reason.detail) lines.push(html`<div class="sot-row sot-detail">${reason.detail}</div>`);
      if (order.failReason === 'CLIENT_REFUSED') {
        if (order.waitMinutes) {
          lines.push(html`<div class="sot-row sot-detail">Ожидание: ~${Math.round(order.waitMinutes)}мин</div>`);
        }
        if (order.acceptRate != null) {
          const refuseRate = 100 - order.acceptRate;
          lines.push(html`<div class="sot-row sot-detail">Шанс отказа: ${refuseRate}% (согласия: ${order.acceptRate}%)</div>`);
        }
      }
      if (order.failReason === 'CLIENT_ABANDONED') {
        const waitSec = order.completedAt
          ? (new Date(order.completedAt).getTime() - new Date(order.createdAt).getTime()) / 1000
          : now ? (now - new Date(order.createdAt).getTime()) / 1000 : 0;
        if (waitSec > 0) {
          lines.push(html`<div class="sot-row sot-detail">Ждал: ~${_fmtSec(waitSec)}</div>`);
        }
      }
    }

    if (order.status === 'scheduled') {
      const waitSec = now ? (now - new Date(order.createdAt).getTime()) / 1000 : 0;
      lines.push(html`<div class="sot-row sot-detail">Ожидает слот: ${_fmtSec(waitSec)}</div>`);
    }

    if (order.status === 'active') {
      const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
      const cookingSec = now ? (now - baseMs) / 1000 : 0;
      const doneCount = order.positions.filter(p => p.status === 'done').length;
      lines.push(html`<div class="sot-row sot-detail">Готовится: ${_fmtSec(cookingSec)}</div>`);
      lines.push(html`<div class="sot-row sot-detail">Позиции: ${doneCount}/${order.positions.length}</div>`);
    }

    const posDetails = order.positions.map(p => html`
      <div class="sot-dish-row">
        <span>${p.dishEmoji} ${p.dishName}</span>
        <span class="sot-qty">×${p.quantity}</span>
        <span class="sot-dish-price">${p.quantity * (p.price || 0)}₽</span>
      </div>
    `);

    const isFailed = order.status === 'failed' || order.status === 'abandoned';
    const statusTag = isFailed
      ? html`<span class="sot-status-lost">ПОТЕРЯН</span>`
      : order.status === 'completed'
        ? (order.isLate ? html`<span class="sot-status-late">ОПОЗДАЛ</span>` : html`<span class="sot-status-done">ГОТОВ</span>`)
        : nothing;

    return html`
      <div class="sot-header">${order.id} · ${order.totalPrice}₽ ${statusTag}</div>
      ${lines}
      <div class="sot-divider"></div>
      ${posDetails}
    `;
  }

  _renderOrderBadge(order, now) {
    if (order.status === 'completed') {
      if (order.isLate) {
        const overSec = (order.execSec || 0) - order.deadlineSec;
        return html`<span class="so-badge late">⏰ +${_fmtSec(overSec)}</span>`;
      }
      return html`<span class="so-badge done">✅ ${_fmtSec(order.execSec)}</span>`;
    }
    if (order.status === 'failed' || order.status === 'abandoned') {
      const r = FAIL_REASONS[order.failReason];
      return html`<span class="so-badge failed">${r ? r.icon : '❌'} ${r ? r.label.split(' ')[0] : 'Отказ'}</span>`;
    }
    if (order.status === 'scheduled') return html`<span class="so-badge scheduled">⏳ Ожидает</span>`;

    const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
    const elapsedMs = now - baseMs;
    const remainMs = (order.deadlineSec * 1000) - elapsedMs;
    const remainSec = Math.floor(remainMs / 1000);

    if (remainSec > 60) {
      const m = Math.floor(remainSec / 60), s = remainSec % 60;
      return html`<span class="so-badge active timer-green">${m}:${String(s).padStart(2, '0')}</span>`;
    }
    if (remainSec > 0) {
      return html`<span class="so-badge active timer-yellow">0:${String(remainSec).padStart(2, '0')}</span>`;
    }
    const overSec = Math.abs(remainSec);
    const m = Math.floor(overSec / 60), s = overSec % 60;
    return html`<span class="so-badge active timer-red">-${m}:${String(s).padStart(2, '0')}</span>`;
  }

  render() {
    const slots = getBranchSlots(this.slotsByBranch, this.branchId);
    const now = this.simNow ? new Date(this.simNow).getTime() : 0;

    return html`
      <h3>📅 Слоты</h3>
      <div class="slot-timeline">
        ${slots.map(s => this._renderSlot(s, now))}
      </div>`;
  }

  _renderSlot(s, now) {
    const startMs = new Date(s.startsAt).getTime();
    const endMs = new Date(s.endsAt).getTime();
    const isActive = now >= startMs && now < endMs;
    const isExpanded = this._expandedSlotId === s.id;

    const cap = s.capacity || {};
    const used = s.used || {};
    let maxPct = 0, isFull = false;
    for (const [key, capVal] of Object.entries(cap)) {
      if (capVal <= 0) continue;
      const pct = ((used[key] || 0) / capVal) * 100;
      if (pct > maxPct) maxPct = pct;
      if ((used[key] || 0) >= capVal) isFull = true;
    }

    const usedSum = used.sumRub || 0;
    const capSum = cap.sumRub || 0;
    const detailText = capSum > 0
      ? `${usedSum.toLocaleString()}₽ / ${capSum.toLocaleString()}₽`
      : Object.entries(cap).map(([k, v]) => `${k}: ${used[k] || 0}/${v}`).join(' · ');

    const pctCls = maxPct >= 90 ? 'high' : maxPct >= 50 ? 'mid' : 'low';

    const classes = [
      'slot-bar',
      isActive ? 'active' : '',
      isExpanded ? 'expanded' : '',
      s.paused ? 'slot-paused' : '',
      isFull ? 'full' : '',
    ].filter(Boolean).join(' ');

    return html`
      <div class=${classes} @click=${() => this._toggleSlot(s.id)}>
        <div class="slot-bar-fill" style="width:${Math.min(maxPct, 100)}%"></div>
        <div class="slot-bar-content">
          <div class="slot-bar-time">${formatTime(s.startsAt)} — ${formatTime(s.endsAt)}</div>
          <div class="slot-bar-info">
            <span class="slot-bar-detail">${detailText}</span>
            <span class="slot-bar-pct ${pctCls}">${Math.round(maxPct)}%</span>
          </div>
        </div>
        <div class="slot-bar-expand">
          ${isExpanded ? this._renderSlotOrders(s) : nothing}
        </div>
      </div>`;
  }
}

customElements.define('sim-slots-panel', SimSlotsPanel);
