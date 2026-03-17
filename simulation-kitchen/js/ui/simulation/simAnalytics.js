import { getBranchSlots } from '../../domain/slotModel.js';
import { getAllOrders } from '../../domain/kitchen.js';
import { formatTime } from '../helpers.js';

let _collapsed = false;

export function renderSlotAnalytics(kitchen, slotsByBranch, branchId) {
  const el = document.getElementById('simAnalytics');
  if (!el) return;

  const slots = getBranchSlots(slotsByBranch, branchId);
  const allOrders = getAllOrders(kitchen);

  const ordersBySlot = {};
  for (const o of allOrders) {
    if (!o.slotId) continue;
    if (!ordersBySlot[o.slotId]) ordersBySlot[o.slotId] = [];
    ordersBySlot[o.slotId].push(o);
  }

  let totals = { orders: 0, completed: 0, late: 0, revenue: 0, execSec: 0 };

  let rows = '';
  for (const slot of slots) {
    const orders = ordersBySlot[slot.id] || [];
    if (orders.length === 0) continue;

    const completed = orders.filter(o => o.status === 'completed');
    const late = completed.filter(o => o.isLate);
    const revenue = completed.reduce((s, o) => s + o.totalPrice, 0);
    const avgExec = completed.length > 0
      ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length
      : 0;

    const cap = slot.capacity || {};
    const used = slot.used || {};
    const sumCap = cap.sumRub || 1;
    const fillPct = Math.round(((used.sumRub || 0) / sumCap) * 100);
    const latePct = completed.length > 0 ? Math.round((late.length / completed.length) * 100) : 0;
    const rowCls = latePct > 30 ? 'analytics-row-danger' : latePct > 0 ? 'analytics-row-warn' : '';

    totals.orders += orders.length;
    totals.completed += completed.length;
    totals.late += late.length;
    totals.revenue += revenue;
    totals.execSec += completed.reduce((s, o) => s + (o.execSec || 0), 0);

    const fmtAvg = _fmtSec(avgExec);

    rows += `<tr class="${rowCls}">
      <td>${formatTime(slot.startsAt)}–${formatTime(slot.endsAt)}</td>
      <td>${orders.length}</td>
      <td>${completed.length}</td>
      <td class="${late.length > 0 ? 'td-late' : ''}">${late.length}</td>
      <td>${fmtAvg}</td>
      <td>${(revenue / 1000).toFixed(1)}к₽</td>
      <td><div class="fill-bar"><div class="fill-bar-inner" style="width:${fillPct}%"></div><span>${fillPct}%</span></div></td>
    </tr>`;
  }

  const avgExecTotal = totals.completed > 0 ? totals.execSec / totals.completed : 0;
  const totalLatePct = totals.completed > 0 ? Math.round((totals.late / totals.completed) * 100) : 0;

  rows += `<tr class="analytics-summary">
    <td><strong>Итого</strong></td>
    <td><strong>${totals.orders}</strong></td>
    <td><strong>${totals.completed}</strong></td>
    <td class="${totals.late > 0 ? 'td-late' : ''}"><strong>${totals.late} (${totalLatePct}%)</strong></td>
    <td><strong>${_fmtSec(avgExecTotal)}</strong></td>
    <td><strong>${(totals.revenue / 1000).toFixed(1)}к₽</strong></td>
    <td></td>
  </tr>`;

  el.innerHTML = `
    <div class="analytics-header" id="analyticsToggle">
      <h4>📊 Аналитика по слотам</h4>
      <span class="analytics-chevron">${_collapsed ? '▶' : '▼'}</span>
    </div>
    <div class="analytics-table-wrap" style="display:${_collapsed ? 'none' : 'block'}">
      <table class="analytics-table">
        <thead>
          <tr>
            <th>Слот</th>
            <th>Заказов</th>
            <th>Готово</th>
            <th>Опоздания</th>
            <th>Ср. время</th>
            <th>Выручка</th>
            <th>Заполн.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  el.querySelector('#analyticsToggle').addEventListener('click', () => {
    _collapsed = !_collapsed;
    const wrap = el.querySelector('.analytics-table-wrap');
    const chevron = el.querySelector('.analytics-chevron');
    wrap.style.display = _collapsed ? 'none' : 'block';
    chevron.textContent = _collapsed ? '▶' : '▼';
  });
}

function _fmtSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}м${s > 0 ? s + 'с' : ''}` : `${s}с`;
}
