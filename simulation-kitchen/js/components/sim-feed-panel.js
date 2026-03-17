import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { getEquipmentStatus, STAGE_LABELS, getAllOrders } from '../domain/kitchen.js';
import { getBranchSlots } from '../domain/slotModel.js';
import { formatTime, formatTimeShort } from '../ui/helpers.js';

export class SimFeedPanel extends BaseComponent {
  static properties = {
    kitchen: { type: Object },
    simNow: { type: Object },
    stats: { type: Object },
    slotsByBranch: { type: Object },
    branchId: { type: String },
    _feedFilter: { state: true },
    _analyticsCollapsed: { state: true },
    _feedItems: { state: true },
    _logLines: { state: true },
  };

  constructor() {
    super();
    this.kitchen = null;
    this.simNow = null;
    this.stats = {};
    this.slotsByBranch = {};
    this.branchId = '';
    this._feedFilter = 'all';
    this._analyticsCollapsed = false;
    this._feedItems = [];
    this._logLines = [];
  }

  addFeedItem(type, text, simNow, extra = {}) {
    const FEED_CATEGORIES = {
      order_assigned: 'active', order_activated: 'active',
      order_failed: 'failed', order_completed: 'done',
      stage_started: 'active', stage_done: 'active', position_done: 'active',
    };
    const entry = {
      type, text,
      time: new Date(simNow),
      orderId: extra.orderId || null,
      isLate: extra.isLate || false,
      category: FEED_CATEGORIES[type] || 'active',
    };
    this._feedItems = [entry, ...this._feedItems].slice(0, 200);
  }

  appendLog(msg, simNow) {
    this._logLines = [...this._logLines, `[${formatTimeShort(simNow)}] ${msg}`].slice(-100);
  }

  resetFeed() {
    this._feedItems = [];
    this._feedFilter = 'all';
    this._logLines = [];
  }

  _onOrderClick(orderId) {
    this.dispatchEvent(new CustomEvent('order-click', { detail: { orderId }, bubbles: true, composed: true }));
  }

  // ─── Bottlenecks ───

  _analyzeBottlenecks() {
    const k = this.kitchen;
    if (!k) return [];
    const issues = [];
    this._checkStationQueues(k, issues);
    this._checkCookLoad(k, issues);
    this._checkEquipment(k, issues);
    this._checkLateOrders(k, issues);
    this._checkClientRefusals(k, issues);
    issues.sort((a, b) => b.severity - a.severity);
    return issues;
  }

  _checkStationQueues(k, issues) {
    for (const station of k.stations) {
      const queue = k.stationQueues[station.id] || [];
      const load = station.currentLoad || 0;
      const max = station.parallelSlots || 1;
      const pct = Math.round((load / max) * 100);
      if (queue.length >= 3 || pct >= 100) {
        issues.push({
          type: 'station', data: { stationId: station.id },
          icon: station.emoji || '🔧',
          title: `${station.name}: перегрузка`,
          detail: `Загрузка ${load}/${max} · В очереди: ${queue.length} заказ(ов)`,
          severity: queue.length >= 5 ? 3 : queue.length >= 3 ? 2 : 1,
          bar: Math.min(pct, 100),
        });
      }
    }
  }

  _checkCookLoad(k, issues) {
    const total = k.cooks.length;
    const busy = k.cooks.filter(c => c.status === 'busy').length;
    const idle = total - busy;
    const busyPct = total > 0 ? Math.round((busy / total) * 100) : 0;
    if (busyPct === 100 && total > 0) {
      let queued = 0;
      for (const q of Object.values(k.stationQueues || {})) queued += q.length;
      if (queued > 0) {
        issues.push({ type: 'cooks_busy', data: {}, icon: '👨‍🍳', title: 'Все повара заняты',
          detail: `${busy}/${total} заняты · ${queued} в очереди без повара`, severity: 3, bar: 100 });
      }
    } else if (idle > 1 && busy > 0) {
      let queued = 0;
      for (const q of Object.values(k.stationQueues || {})) queued += q.length;
      if (queued === 0) {
        issues.push({ type: 'cooks_idle', data: {}, icon: '💤', title: `${idle} повар(а) простаивают`,
          detail: `Занято: ${busy}/${total} · Нет заказов в очереди`, severity: 1, bar: busyPct });
      }
    }
  }

  _checkEquipment(k, issues) {
    const eqStatus = getEquipmentStatus(k);
    for (const [eqId, eq] of Object.entries(eqStatus)) {
      if (eq.capacity <= 0) continue;
      const fillPct = Math.round((eq.current / eq.capacity) * 100);
      const station = k.stations.find(s => {
        const eqObj = k.equipment.find(e => e.id === eqId);
        return eqObj && eqObj.station === s.id;
      });
      const queue = station ? (k.stationQueues[station.id] || []) : [];
      if (fillPct >= 90 && queue.length > 0) {
        issues.push({ type: 'equipment', data: { eqId }, icon: eq.emoji || '🔥',
          title: `${eq.name}: почти полон`, detail: `${eq.current}/${eq.capacity} занято · ${queue.length} ожидают загрузки`,
          severity: fillPct >= 100 ? 3 : 2, bar: fillPct });
      }
    }
  }

  _checkLateOrders(k, issues) {
    const now = this.simNow ? new Date(this.simNow).getTime() : 0;
    let lateActive = 0, worstOverSec = 0;
    for (const order of k.activeOrders) {
      const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
      const elapsed = now - baseMs;
      const deadline = order.deadlineSec * 1000;
      if (elapsed > deadline) {
        lateActive++;
        const over = (elapsed - deadline) / 1000;
        if (over > worstOverSec) worstOverSec = over;
      }
    }
    if (lateActive > 0) {
      issues.push({ type: 'late_orders', data: {}, icon: '🔴',
        title: `${lateActive} заказ(ов) уже опаздывают`, detail: `Макс. превышение: ${this._fmtSec(worstOverSec)}`,
        severity: lateActive >= 3 ? 3 : 2, bar: null });
    }
  }

  _checkClientRefusals(k, issues) {
    const refusals = k.stats.clientRefusals || 0;
    if (refusals > 0) {
      const total = k.stats.totalOrders || 1;
      const pct = Math.round((refusals / total) * 100);
      issues.push({ type: 'client_refusals', data: {}, icon: '🙅',
        title: `${refusals} клиентов отказались (${pct}%)`, detail: `Долгое ожидание слота — клиенты уходят`,
        severity: pct >= 15 ? 3 : pct >= 5 ? 2 : 1, bar: null });
    }
    const abandoned = k.stats.clientAbandoned || 0;
    if (abandoned > 0) {
      const total = k.stats.totalOrders || 1;
      const pct = Math.round((abandoned / total) * 100);
      issues.push({ type: 'client_abandoned', data: {}, icon: '🚶',
        title: `${abandoned} клиентов ушли не дождавшись (${pct}%)`,
        detail: `Приняли заказ, но очередь слишком большая — клиенты уходят`,
        severity: pct >= 10 ? 3 : pct >= 3 ? 2 : 1, bar: null });
    }
  }

  _openBottleneckModal(issue) {
    this.dispatchEvent(new CustomEvent('bottleneck-click', {
      detail: { issue }, bubbles: true, composed: true,
    }));
  }

  // ─── Active Order Timers ───

  _renderActiveOrders() {
    if (!this.kitchen) return nothing;
    const orders = this.kitchen.activeOrders;
    if (orders.length === 0) return html`<div class="no-active-orders">Нет активных заказов</div>`;
    const now = this.simNow ? new Date(this.simNow).getTime() : 0;

    return html`${orders.map(order => {
      const baseMs = order.startedAt ? new Date(order.startedAt).getTime() : new Date(order.createdAt).getTime();
      const elapsed = now - baseMs;
      const remain = Math.floor(((order.deadlineSec * 1000) - elapsed) / 1000);
      let cls, text;
      if (remain > 60) {
        cls = 'timer-green';
        text = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
      } else if (remain > 0) {
        cls = 'timer-yellow';
        text = `0:${String(remain).padStart(2, '0')}`;
      } else {
        cls = 'timer-red';
        const over = Math.abs(remain);
        text = `-${Math.floor(over / 60)}:${String(over % 60).padStart(2, '0')}`;
      }
      const dishes = order.positions.map(p => p.dishEmoji).join('');
      let totalStages = 0, doneStages = 0;
      for (const pos of order.positions) {
        totalStages += pos.stages.length;
        doneStages += pos.stages.filter(s => s.status === 'done').length;
      }
      const progress = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) + '%' : '0%';

      return html`
        <div class="active-order-row" @click=${() => this._onOrderClick(order.id)}>
          <span class="ao-id">${order.id}</span>
          <span class="ao-dishes">${dishes}</span>
          <span class="ao-progress">${progress}</span>
          <span class="ao-timer ${cls}">${text}</span>
        </div>`;
    })}`;
  }

  // ─── Feed ───

  _renderFeed() {
    const iconMap = {
      order_assigned: '📥', order_failed: '❌', order_completed: '✅',
      stage_started: '👨‍🍳', stage_done: '✔️', position_done: '🍽️',
    };
    const clsMap = {
      order_assigned: 'info', order_failed: 'danger', order_completed: 'success',
      stage_started: 'cooking', stage_done: 'info', position_done: 'success',
    };

    let filtered = this._feedItems;
    if (this._feedFilter === 'active') filtered = this._feedItems.filter(e => e.category === 'active');
    else if (this._feedFilter === 'done') filtered = this._feedItems.filter(e => e.type === 'order_completed');
    else if (this._feedFilter === 'late') filtered = this._feedItems.filter(e => e.isLate);

    const maxShow = 30;
    const items = filtered.slice(0, maxShow);

    return html`
      ${items.map(entry => {
        let cls = clsMap[entry.type] || 'info';
        if (entry.isLate && entry.type === 'order_completed') cls = 'danger late';
        return html`
          <div class="feed-item ${cls}" style=${entry.orderId ? 'cursor:pointer' : ''}
               @click=${() => entry.orderId && this._onOrderClick(entry.orderId)}>
            <span class="feed-icon">${iconMap[entry.type] || '📋'}</span>
            <span class="feed-text">${entry.text}</span>
            <span class="feed-time">${formatTimeShort(entry.time)}</span>
          </div>`;
      })}
      ${filtered.length > maxShow ? html`<div class="feed-more">...ещё ${filtered.length - maxShow}</div>` : nothing}`;
  }

  // ─── Analytics ───

  _renderAnalytics() {
    if (!this.kitchen) return nothing;
    const slots = getBranchSlots(this.slotsByBranch, this.branchId);
    const allOrders = getAllOrders(this.kitchen);

    const ordersBySlot = {};
    for (const o of allOrders) {
      if (!o.slotId) continue;
      if (!ordersBySlot[o.slotId]) ordersBySlot[o.slotId] = [];
      ordersBySlot[o.slotId].push(o);
    }

    let totals = { orders: 0, completed: 0, late: 0, revenue: 0, execSec: 0 };
    const rows = [];

    for (const slot of slots) {
      const orders = ordersBySlot[slot.id] || [];
      if (orders.length === 0) continue;
      const completed = orders.filter(o => o.status === 'completed');
      const late = completed.filter(o => o.isLate);
      const revenue = completed.reduce((s, o) => s + o.totalPrice, 0);
      const avgExec = completed.length > 0
        ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length : 0;
      const cap = slot.capacity || {};
      const used = slot.used || {};
      const sumCap = cap.sumRub || 1;
      const fillPct = Math.round(((used.sumRub || 0) / sumCap) * 100);
      const latePct = completed.length > 0 ? Math.round((late.length / completed.length) * 100) : 0;

      totals.orders += orders.length;
      totals.completed += completed.length;
      totals.late += late.length;
      totals.revenue += revenue;
      totals.execSec += completed.reduce((s, o) => s + (o.execSec || 0), 0);

      rows.push({ slot, orders: orders.length, completed: completed.length, late: late.length,
        avgExec, revenue, fillPct, latePct });
    }

    const avgExecTotal = totals.completed > 0 ? totals.execSec / totals.completed : 0;
    const totalLatePct = totals.completed > 0 ? Math.round((totals.late / totals.completed) * 100) : 0;

    return html`
      <div class="analytics-header" @click=${() => { this._analyticsCollapsed = !this._analyticsCollapsed; }}>
        <h4>📊 Аналитика по слотам</h4>
        <span class="analytics-chevron">${this._analyticsCollapsed ? '▶' : '▼'}</span>
      </div>
      ${!this._analyticsCollapsed ? html`
        <div class="analytics-table-wrap">
          <table class="analytics-table">
            <thead>
              <tr><th>Слот</th><th>Заказов</th><th>Готово</th><th>Опоздания</th><th>Ср. время</th><th>Выручка</th><th>Заполн.</th></tr>
            </thead>
            <tbody>
              ${rows.map(r => html`
                <tr class=${r.latePct > 30 ? 'analytics-row-danger' : r.latePct > 0 ? 'analytics-row-warn' : ''}>
                  <td>${formatTime(r.slot.startsAt)}–${formatTime(r.slot.endsAt)}</td>
                  <td>${r.orders}</td>
                  <td>${r.completed}</td>
                  <td class=${r.late > 0 ? 'td-late' : ''}>${r.late}</td>
                  <td>${this._fmtSec(r.avgExec)}</td>
                  <td>${(r.revenue / 1000).toFixed(1)}к₽</td>
                  <td><div class="fill-bar"><div class="fill-bar-inner" style="width:${r.fillPct}%"></div><span>${r.fillPct}%</span></div></td>
                </tr>`)}
              <tr class="analytics-summary">
                <td><strong>Итого</strong></td>
                <td><strong>${totals.orders}</strong></td>
                <td><strong>${totals.completed}</strong></td>
                <td class=${totals.late > 0 ? 'td-late' : ''}><strong>${totals.late} (${totalLatePct}%)</strong></td>
                <td><strong>${this._fmtSec(avgExecTotal)}</strong></td>
                <td><strong>${(totals.revenue / 1000).toFixed(1)}к₽</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>` : nothing}`;
  }

  _fmtSec(sec) {
    sec = Math.round(sec);
    if (sec < 60) return `${sec}с`;
    const m = Math.floor(sec / 60), s = sec % 60;
    return s > 0 ? `${m}м${s}с` : `${m}м`;
  }

  render() {
    const issues = this._analyzeBottlenecks();
    const filters = [
      { id: 'all', label: 'Все' },
      { id: 'active', label: 'Активные' },
      { id: 'done', label: 'Готовые' },
      { id: 'late', label: 'Опоздания' },
    ];

    return html`
      <h3>🔥 Узкие места</h3>

      <div class="bottleneck-dashboard">
        ${issues.length === 0
          ? html`<div class="bn-ok"><span class="bn-ok-icon">✅</span>Всё в норме</div>`
          : issues.map(issue => {
            const cls = issue.severity >= 3 ? 'bn-crit' : issue.severity >= 2 ? 'bn-warn' : 'bn-info';
            return html`
              <div class="bn-card ${cls}" style="cursor:pointer" @click=${() => this._openBottleneckModal(issue)}>
                <div class="bn-card-header">
                  <span class="bn-icon">${issue.icon}</span>
                  <span class="bn-title">${issue.title}</span>
                  <span class="bn-sev">${'●'.repeat(issue.severity)}</span>
                </div>
                <div class="bn-detail">${issue.detail}</div>
                ${issue.bar != null ? html`<div class="bn-bar-wrap"><div class="bn-bar-fill ${cls}" style="width:${issue.bar}%"></div></div>` : nothing}
              </div>`;
          })}
      </div>

      <div class="kitchen-section">
        <h4>⏱️ Активные заказы</h4>
        <div class="active-orders-list">${this._renderActiveOrders()}</div>
      </div>

      <div class="kitchen-section">
        <h4>📋 Лента заказов</h4>
        <div class="feed-filter-tabs">
          ${filters.map(f => html`
            <button class="feed-filter-btn ${this._feedFilter === f.id ? 'active' : ''}"
                    @click=${() => { this._feedFilter = f.id; }}>
              ${f.label}
            </button>`)}
        </div>
        <div class="order-feed">${this._renderFeed()}</div>
      </div>

      <div class="kitchen-section">${this._renderAnalytics()}</div>

      <div class="kitchen-section">
        <h4>📝 Лог</h4>
        <div class="sim-log">${this._logLines.join('\n')}</div>
      </div>`;
  }
}

customElements.define('sim-feed-panel', SimFeedPanel);
