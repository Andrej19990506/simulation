import { getAllOrders, getKitchenStats, STAGE_LABELS } from '../../domain/kitchen.js';
import { getBranchSlots } from '../../domain/slotModel.js';
import { formatTime } from '../helpers.js';

let _modalEl = null;

export function initShiftReport() {
  _modalEl = document.getElementById('shiftReportModal');
  if (!_modalEl) return;
  _modalEl.addEventListener('click', (e) => {
    if (e.target === _modalEl) closeShiftReport();
  });
}

export function closeShiftReport() {
  if (_modalEl) _modalEl.style.display = 'none';
}

export function openShiftReport(kitchen, slotsByBranch, branchId, simNow) {
  if (!_modalEl) return;

  const stats = getKitchenStats(kitchen);
  const allOrders = getAllOrders(kitchen);
  const completed = kitchen.completedOrders || [];
  const failed = kitchen.failedOrders || [];
  const slots = getBranchSlots(slotsByBranch, branchId);
  const lateOrders = completed.filter(o => o.isLate);
  const onTimeOrders = completed.filter(o => !o.isLate);
  const totalRevenue = completed.reduce((s, o) => s + o.totalPrice, 0);

  const summaryHtml = _buildSummary(stats, completed, lateOrders, failed, totalRevenue, simNow);
  const timelineHtml = _buildSlotTimeline(slots, kitchen);
  const cookPerfHtml = _buildCookPerformance(kitchen, completed);
  const lateAnalysisHtml = _buildLateAnalysis(lateOrders);
  const recommendHtml = _buildRecommendations(stats, completed, lateOrders, kitchen, slots);

  _modalEl.querySelector('.modal-body').innerHTML = `
    <div class="sr-header">
      <h2>📊 Отчёт закрытия смены</h2>
      <div class="sr-time">${_fmtDate(simNow)}</div>
    </div>
    ${summaryHtml}
    ${timelineHtml}
    ${cookPerfHtml}
    ${lateAnalysisHtml}
    ${recommendHtml}`;

  _modalEl.style.display = 'flex';
}

function _fmtSec(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}

function _fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function _buildSummary(stats, completed, lateOrders, failed, totalRevenue, simNow) {
  const onTimePct = completed.length > 0
    ? Math.round(((completed.length - lateOrders.length) / completed.length) * 100) : 0;
  const avgExec = completed.length > 0
    ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length : 0;
  const latePct = completed.length > 0
    ? Math.round((lateOrders.length / completed.length) * 100) : 0;

  const gradeScore = onTimePct;
  let grade, gradeClass;
  if (gradeScore >= 95) { grade = 'A+'; gradeClass = 'grade-a'; }
  else if (gradeScore >= 85) { grade = 'A'; gradeClass = 'grade-a'; }
  else if (gradeScore >= 75) { grade = 'B'; gradeClass = 'grade-b'; }
  else if (gradeScore >= 60) { grade = 'C'; gradeClass = 'grade-c'; }
  else { grade = 'D'; gradeClass = 'grade-d'; }

  return `
    <div class="sr-grade-row">
      <div class="sr-grade ${gradeClass}">${grade}</div>
      <div class="sr-grade-label">
        <div>Оценка смены</div>
        <div class="sr-grade-sub">${onTimePct}% заказов вовремя</div>
      </div>
    </div>
    <div class="sr-kpi-grid">
      <div class="sr-kpi">
        <div class="sr-kpi-val">${stats.totalOrders}</div>
        <div class="sr-kpi-label">Всего заказов</div>
      </div>
      <div class="sr-kpi">
        <div class="sr-kpi-val">${completed.length}</div>
        <div class="sr-kpi-label">Выполнено</div>
      </div>
      <div class="sr-kpi sr-kpi-warn">
        <div class="sr-kpi-val">${lateOrders.length} <small>(${latePct}%)</small></div>
        <div class="sr-kpi-label">Опоздали</div>
      </div>
      <div class="sr-kpi">
        <div class="sr-kpi-val">${failed.length}</div>
        <div class="sr-kpi-label">Отклонено</div>
      </div>
      <div class="sr-kpi sr-kpi-warn">
        <div class="sr-kpi-val">${stats.clientRefusals || 0}</div>
        <div class="sr-kpi-label">Отказы клиентов</div>
      </div>
      <div class="sr-kpi">
        <div class="sr-kpi-val">${(totalRevenue / 1000).toFixed(1)}к</div>
        <div class="sr-kpi-label">Выручка ₽</div>
      </div>
      <div class="sr-kpi">
        <div class="sr-kpi-val">${_fmtSec(avgExec)}</div>
        <div class="sr-kpi-label">Ср. время</div>
      </div>
    </div>`;
}

function _buildSlotTimeline(slots, kitchen) {
  if (slots.length === 0) return '';

  let rows = '';
  for (const slot of slots) {
    const orders = getAllOrders(kitchen).filter(o => o.slotId === slot.id);
    if (orders.length === 0 && slot.paused) continue;

    const completed = orders.filter(o => o.status === 'completed');
    const late = completed.filter(o => o.isLate);
    const revenue = completed.reduce((s, o) => s + o.totalPrice, 0);
    const cap = (slot.capacity && slot.capacity.sumRub) || 0;
    const used = (slot.used && slot.used.sumRub) || 0;
    const fillPct = cap > 0 ? Math.round((used / cap) * 100) : 0;
    const latePct = completed.length > 0 ? Math.round((late.length / completed.length) * 100) : 0;
    const rowCls = latePct > 30 ? 'sr-row-danger' : latePct > 0 ? 'sr-row-warn' : '';

    rows += `<tr class="${rowCls}">
      <td>${formatTime(slot.startsAt)}–${formatTime(slot.endsAt)}</td>
      <td>${orders.length}</td>
      <td>${completed.length}</td>
      <td class="${late.length > 0 ? 'td-late' : ''}">${late.length}</td>
      <td>${(revenue / 1000).toFixed(1)}к₽</td>
      <td><div class="sr-fill-bar"><div class="sr-fill-inner" style="width:${fillPct}%"></div><span>${fillPct}%</span></div></td>
    </tr>`;
  }

  return `
    <div class="sr-section">
      <h3>📅 По слотам</h3>
      <div class="sr-table-wrap">
        <table class="sr-table">
          <thead><tr>
            <th>Слот</th><th>Заказов</th><th>Готово</th><th>Опоздания</th><th>Выручка</th><th>Заполн.</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _buildCookPerformance(kitchen, completed) {
  const cookMap = {};

  for (const order of completed) {
    const tl = order.timeline || [];
    for (const ev of tl) {
      if (!ev.cook) continue;
      if (!cookMap[ev.cook]) {
        cookMap[ev.cook] = { name: ev.cook, tasks: 0, totalSec: 0, orders: new Set() };
      }
      cookMap[ev.cook].orders.add(order.id);
      if (ev.action === 'start') cookMap[ev.cook].tasks++;
    }
  }

  for (const order of completed) {
    const tl = order.timeline || [];
    const cookStarts = {};
    for (const ev of tl) {
      if (!ev.cook) continue;
      const ms = new Date(ev.time).getTime();
      if (ev.action === 'start') {
        cookStarts[ev.cook] = ms;
      } else if (ev.action === 'end' && cookStarts[ev.cook]) {
        const dur = (ms - cookStarts[ev.cook]) / 1000;
        cookMap[ev.cook].totalSec += dur;
        delete cookStarts[ev.cook];
      }
    }
  }

  const stationMap = {};
  if (kitchen.stations) {
    for (const s of kitchen.stations) stationMap[s.id] = s;
  }

  const cooks = Object.values(cookMap).sort((a, b) => b.orders.size - a.orders.size);
  if (cooks.length === 0) return '';

  let rows = '';
  for (const c of cooks) {
    const kitchenCook = kitchen.cooks?.find(k => k.name === c.name);
    let stationName = '—';
    if (kitchenCook && kitchenCook.stations?.length > 0) {
      const st = stationMap[kitchenCook.stations[0]];
      if (st) stationName = `${st.emoji} ${st.name}`;
    }
    const avgSec = c.tasks > 0 ? c.totalSec / c.tasks : 0;

    rows += `<tr>
      <td><strong>${c.name}</strong></td>
      <td>${stationName}</td>
      <td>${c.orders.size}</td>
      <td>${c.tasks}</td>
      <td>${_fmtSec(c.totalSec)}</td>
      <td>${_fmtSec(avgSec)}</td>
    </tr>`;
  }

  return `
    <div class="sr-section">
      <h3>👨‍🍳 Эффективность сотрудников</h3>
      <div class="sr-table-wrap">
        <table class="sr-table">
          <thead><tr>
            <th>Сотрудник</th><th>Станция</th><th>Заказов</th><th>Операций</th><th>Общее время</th><th>Ср. на операцию</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _buildLateAnalysis(lateOrders) {
  if (lateOrders.length === 0) {
    return `<div class="sr-section sr-section-ok">
      <h3>✅ Все заказы выполнены вовремя!</h3>
    </div>`;
  }

  const stageTotals = {};
  const stageCount = {};
  for (const order of lateOrders) {
    const tl = order.timeline || [];
    const spans = {};
    for (const ev of tl) {
      if (!ev.stage) continue;
      const label = STAGE_LABELS[ev.stage] || ev.stage;
      const ms = new Date(ev.time).getTime();
      if (!spans[label]) spans[label] = { start: Infinity, end: 0 };
      if (ev.action === 'start' && ms < spans[label].start) spans[label].start = ms;
      if (ev.action === 'end' && ms > spans[label].end) spans[label].end = ms;
    }
    for (const [label, s] of Object.entries(spans)) {
      if (s.start < Infinity && s.end > 0) {
        const sec = (s.end - s.start) / 1000;
        stageTotals[label] = (stageTotals[label] || 0) + sec;
        stageCount[label] = (stageCount[label] || 0) + 1;
      }
    }
  }

  const bottlenecks = Object.entries(stageTotals)
    .map(([label, total]) => ({ label, avg: total / (stageCount[label] || 1) }))
    .sort((a, b) => b.avg - a.avg);

  let bottleneckHtml = '';
  for (const bn of bottlenecks) {
    const isTop = bn === bottlenecks[0];
    bottleneckHtml += `<div class="sr-bottleneck-row ${isTop ? 'sr-bottleneck-top' : ''}">
      <span class="sr-bn-label">${bn.label}${isTop ? ' ⚠️' : ''}</span>
      <span class="sr-bn-val">${_fmtSec(bn.avg)}</span>
    </div>`;
  }

  const maxOverSec = Math.max(...lateOrders.map(o => (o.execSec || 0) - o.deadlineSec));
  const avgOverSec = lateOrders.reduce((s, o) => s + Math.max(0, (o.execSec || 0) - o.deadlineSec), 0) / lateOrders.length;

  return `
    <div class="sr-section sr-section-danger">
      <h3>🔴 Анализ опозданий (${lateOrders.length} заказов)</h3>
      <div class="sr-late-stats">
        <div class="sr-late-stat">
          <div class="sr-late-val">${_fmtSec(avgOverSec)}</div>
          <div class="sr-late-label">Среднее опоздание</div>
        </div>
        <div class="sr-late-stat">
          <div class="sr-late-val">${_fmtSec(maxOverSec)}</div>
          <div class="sr-late-label">Макс. опоздание</div>
        </div>
      </div>
      <h4>Узкие места (ср. время этапа в опоздавших заказах):</h4>
      <div class="sr-bottlenecks">${bottleneckHtml}</div>
    </div>`;
}

function _buildRecommendations(stats, completed, lateOrders, kitchen, slots) {
  const tips = [];

  const latePct = completed.length > 0 ? (lateOrders.length / completed.length) * 100 : 0;

  if (latePct > 20) {
    tips.push({ icon: '🔴', text: `${Math.round(latePct)}% заказов опаздывают — критическая нагрузка. Рассмотрите добавление сотрудников или увеличение лимита слотов.` });
  } else if (latePct > 5) {
    tips.push({ icon: '🟡', text: `${Math.round(latePct)}% заказов опаздывают — умеренная нагрузка. Проверьте узкие места на станциях.` });
  }

  const avgExec = completed.length > 0
    ? completed.reduce((s, o) => s + (o.execSec || 0), 0) / completed.length : 0;
  if (avgExec > 600) {
    tips.push({ icon: '⏱️', text: `Среднее время выполнения ${_fmtSec(avgExec)} — превышает 10 минут. Оптимизируйте процессы готовки.` });
  }

  const idleCooks = kitchen.cooks?.filter(c => c.status === 'idle') || [];
  if (idleCooks.length > 1 && latePct > 10) {
    tips.push({ icon: '👨‍🍳', text: `${idleCooks.length} повар(ов) простаивают, при этом есть опоздания. Перераспределите сотрудников между станциями.` });
  }

  const clientRefusals = stats.clientRefusals || 0;
  if (clientRefusals > 0) {
    const refPct = stats.totalOrders > 0 ? Math.round((clientRefusals / stats.totalOrders) * 100) : 0;
    const lostRev = kitchen.failedOrders?.filter(o => o.failReason === 'CLIENT_REFUSED').reduce((s, o) => s + o.totalPrice, 0) || 0;
    tips.push({ icon: '🙅', text: `${clientRefusals} клиентов (${refPct}%) отказались из-за долгого ожидания. Потеряно ~${(lostRev / 1000).toFixed(1)}к₽. Увеличьте пропускную способность слотов.` });
  }

  const activeSlots = slots.filter(s => !s.paused);
  const fullSlots = activeSlots.filter(s => {
    const cap = s.capacity?.sumRub || 0;
    const used = s.used?.sumRub || 0;
    return cap > 0 && used >= cap * 0.9;
  });
  if (fullSlots.length > activeSlots.length * 0.8) {
    tips.push({ icon: '📦', text: `${fullSlots.length} из ${activeSlots.length} слотов заполнены более чем на 90%. Увеличьте лимит суммы на слот или добавьте слоты.` });
  }

  const totalRevenue = completed.reduce((s, o) => s + o.totalPrice, 0);
  tips.push({ icon: '💰', text: `Выручка за смену: ${totalRevenue.toLocaleString()}₽. Средний чек: ${completed.length > 0 ? Math.round(totalRevenue / completed.length).toLocaleString() : 0}₽.` });

  if (tips.length === 0) {
    tips.push({ icon: '✅', text: 'Все показатели в норме. Отличная работа!' });
  }

  let html = '<div class="sr-section"><h3>💡 Рекомендации</h3><div class="sr-tips">';
  for (const tip of tips) {
    html += `<div class="sr-tip"><span class="sr-tip-icon">${tip.icon}</span><span>${tip.text}</span></div>`;
  }
  html += '</div></div>';
  return html;
}
