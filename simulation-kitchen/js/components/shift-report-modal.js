import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { getAllOrders, getKitchenStats, STAGE_LABELS } from '../domain/kitchen.js';
import { getBranchSlots } from '../domain/slotModel.js';
import { formatTime } from '../ui/helpers.js';

function _fmtSec(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}

function _fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export class ShiftReportModal extends BaseComponent {
  static properties = {
    kitchen: { type: Object },
    slotsByBranch: { type: Object },
    branchId: { type: String },
    simNow: { type: Object },
    _visible: { state: true },
  };

  constructor() {
    super();
    this.kitchen = null;
    this.slotsByBranch = {};
    this.branchId = '';
    this.simNow = null;
    this._visible = false;
  }

  open(kitchen, slotsByBranch, branchId, simNow) {
    this.kitchen = kitchen;
    this.slotsByBranch = slotsByBranch;
    this.branchId = branchId;
    this.simNow = simNow;
    this._visible = true;
  }

  close() { this._visible = false; }

  _onOverlayClick(e) { if (e.target === e.currentTarget) this.close(); }

  render() {
    if (!this._visible || !this.kitchen) return nothing;

    const stats = getKitchenStats(this.kitchen);
    const completed = this.kitchen.completedOrders || [];
    const failed = this.kitchen.failedOrders || [];
    const slots = getBranchSlots(this.slotsByBranch, this.branchId);
    const lateOrders = completed.filter(o => o.isLate);
    const totalRevenue = completed.reduce((s, o) => s + o.totalPrice, 0);

    return html`
      <div class="modal-overlay" style="display:flex" @click=${this._onOverlayClick}>
        <div class="modal-content shift-report-modal">
          <button class="modal-close" @click=${() => this.close()}>✕</button>
          <div class="modal-body">
            ${this._renderHeader()}
            ${this._renderSummary(stats, completed, lateOrders, failed, totalRevenue)}
            ${this._renderSlotTimeline(slots)}
            ${this._renderCookPerformance(completed)}
            ${this._renderLateAnalysis(lateOrders)}
            ${this._renderRecommendations(stats, completed, lateOrders, slots)}
          </div>
        </div>
      </div>`;
  }

  _renderHeader() {
    return html`
      <div class="sr-header">
        <h2>📊 Отчёт закрытия смены</h2>
        <div class="sr-time">${_fmtDate(this.simNow)}</div>
      </div>`;
  }

  _renderSummary(stats, completed, lateOrders, failed, totalRevenue) {
    const onTimePct = completed.length > 0
      ? Math.round(((completed.length - lateOrders.length) / completed.length) * 100) : 0;
    const avgExec = completed.length > 0
      ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length : 0;
    const latePct = completed.length > 0
      ? Math.round((lateOrders.length / completed.length) * 100) : 0;

    let grade, gradeClass;
    if (onTimePct >= 95) { grade = 'A+'; gradeClass = 'grade-a'; }
    else if (onTimePct >= 85) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (onTimePct >= 75) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (onTimePct >= 60) { grade = 'C'; gradeClass = 'grade-c'; }
    else { grade = 'D'; gradeClass = 'grade-d'; }

    return html`
      <div class="sr-grade-row">
        <div class="sr-grade ${gradeClass}">${grade}</div>
        <div class="sr-grade-label">
          <div>Оценка смены</div>
          <div class="sr-grade-sub">${onTimePct}% заказов вовремя</div>
        </div>
      </div>
      <div class="sr-kpi-grid">
        <div class="sr-kpi"><div class="sr-kpi-val">${stats.totalOrders}</div><div class="sr-kpi-label">Всего заказов</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${completed.length}</div><div class="sr-kpi-label">Выполнено</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${completed.length - lateOrders.length}</div><div class="sr-kpi-label">Вовремя</div></div>
        <div class="sr-kpi sr-kpi-warn"><div class="sr-kpi-val">${lateOrders.length} <small>(${latePct}%)</small></div><div class="sr-kpi-label">Опоздали</div></div>
        <div class="sr-kpi sr-kpi-warn"><div class="sr-kpi-val">${failed.length}</div><div class="sr-kpi-label">Потеряно</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${stats.clientRefusals || 0}</div><div class="sr-kpi-label">↳ Отказались сразу</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${stats.clientAbandoned || 0}</div><div class="sr-kpi-label">↳ Ушли из очереди</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${(totalRevenue / 1000).toFixed(1)}к</div><div class="sr-kpi-label">Выручка ₽</div></div>
        <div class="sr-kpi"><div class="sr-kpi-val">${_fmtSec(avgExec)}</div><div class="sr-kpi-label">Ср. время</div></div>
      </div>`;
  }

  _renderSlotTimeline(slots) {
    if (slots.length === 0) return nothing;
    const allOrders = getAllOrders(this.kitchen);
    const rows = [];
    for (const slot of slots) {
      const orders = allOrders.filter(o => o.slotId === slot.id);
      if (orders.length === 0 && slot.paused) continue;
      const completed = orders.filter(o => o.status === 'completed');
      const late = completed.filter(o => o.isLate);
      const revenue = completed.reduce((s, o) => s + o.totalPrice, 0);
      const cap = slot.capacity?.sumRub || 0;
      const used = slot.used?.sumRub || 0;
      const fillPct = cap > 0 ? Math.round((used / cap) * 100) : 0;
      const latePct = completed.length > 0 ? Math.round((late.length / completed.length) * 100) : 0;
      rows.push({ slot, orders: orders.length, completed: completed.length, late: late.length, revenue, fillPct, latePct });
    }

    return html`
      <div class="sr-section">
        <h3>📅 По слотам</h3>
        <div class="sr-table-wrap">
          <table class="sr-table">
            <thead><tr><th>Слот</th><th>Заказов</th><th>Готово</th><th>Опоздания</th><th>Выручка</th><th>Заполн.</th></tr></thead>
            <tbody>
              ${rows.map(r => html`
                <tr class=${r.latePct > 30 ? 'sr-row-danger' : r.latePct > 0 ? 'sr-row-warn' : ''}>
                  <td>${formatTime(r.slot.startsAt)}–${formatTime(r.slot.endsAt)}</td>
                  <td>${r.orders}</td><td>${r.completed}</td>
                  <td class=${r.late > 0 ? 'td-late' : ''}>${r.late}</td>
                  <td>${(r.revenue / 1000).toFixed(1)}к₽</td>
                  <td><div class="sr-fill-bar"><div class="sr-fill-inner" style="width:${r.fillPct}%"></div><span>${r.fillPct}%</span></div></td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  _renderCookPerformance(completed) {
    const cookMap = {};
    for (const order of completed) {
      const tl = order.timeline || [];
      const cookStarts = {};
      for (const ev of tl) {
        if (!ev.cook) continue;
        if (!cookMap[ev.cook]) cookMap[ev.cook] = { name: ev.cook, tasks: 0, totalSec: 0, orders: new Set() };
        cookMap[ev.cook].orders.add(order.id);
        const ms = new Date(ev.time).getTime();
        if (ev.action === 'start') { cookMap[ev.cook].tasks++; cookStarts[ev.cook] = ms; }
        else if (ev.action === 'end' && cookStarts[ev.cook]) {
          cookMap[ev.cook].totalSec += (ms - cookStarts[ev.cook]) / 1000;
          delete cookStarts[ev.cook];
        }
      }
    }

    const stationMap = {};
    if (this.kitchen.stations) for (const s of this.kitchen.stations) stationMap[s.id] = s;
    const cooks = Object.values(cookMap).sort((a, b) => b.orders.size - a.orders.size);
    if (cooks.length === 0) return nothing;

    return html`
      <div class="sr-section">
        <h3>👨‍🍳 Эффективность сотрудников</h3>
        <div class="sr-table-wrap">
          <table class="sr-table">
            <thead><tr><th>Сотрудник</th><th>Станция</th><th>Заказов</th><th>Операций</th><th>Общее время</th><th>Ср. на операцию</th></tr></thead>
            <tbody>
              ${cooks.map(c => {
                const kc = this.kitchen.cooks?.find(k => k.name === c.name);
                let stName = '—';
                if (kc?.stations?.length > 0) { const st = stationMap[kc.stations[0]]; if (st) stName = `${st.emoji} ${st.name}`; }
                return html`<tr><td><strong>${c.name}</strong></td><td>${stName}</td><td>${c.orders.size}</td><td>${c.tasks}</td><td>${_fmtSec(c.totalSec)}</td><td>${_fmtSec(c.tasks > 0 ? c.totalSec / c.tasks : 0)}</td></tr>`;
              })}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  _renderLateAnalysis(lateOrders) {
    if (lateOrders.length === 0) return html`<div class="sr-section sr-section-ok"><h3>✅ Все заказы выполнены вовремя!</h3></div>`;

    const stageTotals = {}, stageCount = {};
    for (const order of lateOrders) {
      const spans = {};
      for (const ev of (order.timeline || [])) {
        if (!ev.stage) continue;
        const label = STAGE_LABELS[ev.stage] || ev.stage;
        const ms = new Date(ev.time).getTime();
        if (!spans[label]) spans[label] = { start: Infinity, end: 0 };
        if (ev.action === 'start' && ms < spans[label].start) spans[label].start = ms;
        if (ev.action === 'end' && ms > spans[label].end) spans[label].end = ms;
      }
      for (const [label, s] of Object.entries(spans)) {
        if (s.start < Infinity && s.end > 0) {
          stageTotals[label] = (stageTotals[label] || 0) + (s.end - s.start) / 1000;
          stageCount[label] = (stageCount[label] || 0) + 1;
        }
      }
    }

    const bottlenecks = Object.entries(stageTotals)
      .map(([label, total]) => ({ label, avg: total / (stageCount[label] || 1) }))
      .sort((a, b) => b.avg - a.avg);

    const maxOverSec = Math.max(...lateOrders.map(o => (o.execSec || 0) - o.deadlineSec));
    const avgOverSec = lateOrders.reduce((s, o) => s + Math.max(0, (o.execSec || 0) - o.deadlineSec), 0) / lateOrders.length;

    return html`
      <div class="sr-section sr-section-danger">
        <h3>🔴 Анализ опозданий (${lateOrders.length} заказов)</h3>
        <div class="sr-late-stats">
          <div class="sr-late-stat"><div class="sr-late-val">${_fmtSec(avgOverSec)}</div><div class="sr-late-label">Среднее опоздание</div></div>
          <div class="sr-late-stat"><div class="sr-late-val">${_fmtSec(maxOverSec)}</div><div class="sr-late-label">Макс. опоздание</div></div>
        </div>
        <h4>Узкие места (ср. время этапа в опоздавших заказах):</h4>
        <div class="sr-bottlenecks">
          ${bottlenecks.map((bn, i) => html`
            <div class="sr-bottleneck-row ${i === 0 ? 'sr-bottleneck-top' : ''}">
              <span class="sr-bn-label">${bn.label}${i === 0 ? ' ⚠️' : ''}</span>
              <span class="sr-bn-val">${_fmtSec(bn.avg)}</span>
            </div>`)}
        </div>
      </div>`;
  }

  _renderRecommendations(stats, completed, lateOrders, slots) {
    const tips = [];
    const latePct = completed.length > 0 ? (lateOrders.length / completed.length) * 100 : 0;

    if (latePct > 20) tips.push({ icon: '🔴', text: `${Math.round(latePct)}% заказов опаздывают — критическая нагрузка. Рассмотрите добавление сотрудников или увеличение лимита слотов.` });
    else if (latePct > 5) tips.push({ icon: '🟡', text: `${Math.round(latePct)}% заказов опаздывают — умеренная нагрузка. Проверьте узкие места на станциях.` });

    const avgExec = completed.length > 0 ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length : 0;
    if (avgExec > 600) tips.push({ icon: '⏱️', text: `Среднее время выполнения ${_fmtSec(avgExec)} — превышает 10 минут. Оптимизируйте процессы готовки.` });

    const refusals = stats.clientRefusals || 0;
    if (refusals > 0) {
      const refPct = stats.totalOrders > 0 ? Math.round((refusals / stats.totalOrders) * 100) : 0;
      const lostRev = this.kitchen.failedOrders?.filter(o => o.failReason === 'CLIENT_REFUSED').reduce((s, o) => s + o.totalPrice, 0) || 0;
      tips.push({ icon: '🙅', text: `${refusals} клиентов (${refPct}%) отказались. Потеряно ~${(lostRev / 1000).toFixed(1)}к₽. Увеличьте пропускную способность.` });
    }

    const totalRevenue = completed.reduce((s, o) => s + o.totalPrice, 0);
    tips.push({ icon: '💰', text: `Выручка за смену: ${totalRevenue.toLocaleString()}₽. Средний чек: ${completed.length > 0 ? Math.round(totalRevenue / completed.length).toLocaleString() : 0}₽.` });

    if (tips.length === 0) tips.push({ icon: '✅', text: 'Все показатели в норме. Отличная работа!' });

    return html`
      <div class="sr-section">
        <h3>💡 Рекомендации</h3>
        <div class="sr-tips">
          ${tips.map(t => html`<div class="sr-tip"><span class="sr-tip-icon">${t.icon}</span><span>${t.text}</span></div>`)}
        </div>
      </div>`;
  }
}

customElements.define('shift-report-modal', ShiftReportModal);
