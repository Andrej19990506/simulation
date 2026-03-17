import { getAllOrders, STAGE_LABELS } from '../../domain/kitchen.js';
import { formatTimeShort } from '../helpers.js';

let _modalEl = null;

function _fmtTimer(totalSec) {
  const sec = Math.round(totalSec);
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  const sign = sec < 0 ? '-' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

function _fmtDuration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м${s}с` : `${m}м`;
}

export function initOrderModal() {
  _modalEl = document.getElementById('orderModal');
  if (!_modalEl) return;
  _modalEl.addEventListener('click', (e) => {
    if (e.target === _modalEl) closeOrderModal();
  });
}

export function openOrderModal(orderId, kitchen, simNow) {
  if (!_modalEl) return;
  const order = getAllOrders(kitchen).find(o => o.id === orderId);
  if (!order) return;

  const now = new Date(simNow).getTime();
  const createdMs = new Date(order.createdAt).getTime();
  const startedMs = order.startedAt ? new Date(order.startedAt).getTime() : createdMs;
  const elapsedMs = now - createdMs;
  const deadlineMs = order.deadlineSec * 1000;
  const remainMs = deadlineMs - elapsedMs;

  let timerHtml;
  if (order.status === 'completed') {
    const sec = Math.round(order.execSec || ((new Date(order.completedAt).getTime() - createdMs) / 1000));
    const cls = order.isLate ? 'timer-red' : 'timer-green';
    timerHtml = `<span class="modal-timer ${cls}">${_fmtTimer(sec)}</span>`;
  } else if (order.status === 'failed') {
    timerHtml = `<span class="modal-timer timer-red">Отказ</span>`;
  } else if (order.status === 'scheduled') {
    timerHtml = `<span class="modal-timer timer-yellow">⏳ Ожидает</span>`;
  } else {
    const remainSec = Math.floor(remainMs / 1000);
    const cls = remainSec > 60 ? 'timer-green' : remainSec > 0 ? 'timer-yellow' : 'timer-red';
    timerHtml = `<span class="modal-timer ${cls}">${_fmtTimer(remainSec)}</span>`;
  }

  const statusMap = {
    scheduled: '⏳ Запланирован',
    active: '🔄 Активен',
    completed: '✅ Выполнен',
    failed: '❌ Отказ',
  };
  const statusLabel = statusMap[order.status] || order.status;

  let positionsHtml = '';
  for (const pos of order.positions) {
    let stagesHtml = '';
    for (const stage of pos.stages) {
      const label = STAGE_LABELS[stage.type] || stage.type;
      let stageCls = 'stage-pending';
      let stageIcon = '⏳';
      if (stage.status === 'done') { stageCls = 'stage-done'; stageIcon = '✅'; }
      else if (stage.status === 'active') { stageCls = 'stage-active'; stageIcon = '🔥'; }
      else if (stage.status === 'waiting') { stageCls = 'stage-waiting'; stageIcon = '⏱️'; }

      const pct = stage.totalTimeSec > 0
        ? Math.round(((stage.totalTimeSec - stage.remainingSec) / stage.totalTimeSec) * 100)
        : 0;

      stagesHtml += `
        <div class="modal-stage ${stageCls}">
          <span class="ms-icon">${stageIcon}</span>
          <span class="ms-label">${label}</span>
          <div class="ms-bar"><div class="ms-bar-fill" style="width:${pct}%"></div></div>
          <span class="ms-time">${Math.round(stage.totalTimeSec - stage.remainingSec)}/${Math.round(stage.totalTimeSec)}с</span>
        </div>`;
    }

    positionsHtml += `
      <div class="modal-position">
        <div class="mp-header">
          <span class="mp-dish">${pos.dishEmoji} ${pos.dishName}</span>
          <span class="mp-qty">×${pos.quantity}</span>
          <span class="mp-price">${pos.price * pos.quantity}₽</span>
        </div>
        <div class="mp-stages">${stagesHtml}</div>
      </div>`;
  }

  let assignLogHtml = '';
  if (order.assignLog && order.assignLog.length > 0) {
    assignLogHtml = '<div class="modal-assign-log"><h4>🎯 Почему этот слот?</h4>';
    for (const line of order.assignLog) {
      const isReject = line.includes('отклонён') || line.includes('пропущен') || line.includes('переполнен');
      const isSuccess = line.startsWith('✅');
      const cls = isReject ? 'al-reject' : isSuccess ? 'al-success' : 'al-info';
      assignLogHtml += `<div class="al-line ${cls}">${line}</div>`;
    }
    assignLogHtml += '</div>';
  }

  const lateAnalysisHtml = _buildLateAnalysis(order, createdMs, startedMs);

  const eventsHtml = _buildTimeline(order, kitchen);

  _modalEl.querySelector('.modal-body').innerHTML = `
    <div class="modal-header-row">
      <div>
        <h3>${order.id}</h3>
        <span class="mh-slot">${order.slotId || '—'}</span>
        <span class="mh-status">${statusLabel}</span>
      </div>
      <div class="mh-right">
        ${timerHtml}
        <span class="mh-price">${order.totalPrice}₽</span>
      </div>
    </div>
    <div class="modal-meta">
      <span>Создан: ${formatTimeShort(order.createdAt)}</span>
      ${order.startedAt ? `<span>На кухне: ${formatTimeShort(order.startedAt)}</span>` : ''}
      ${order.completedAt ? `<span>Завершён: ${formatTimeShort(order.completedAt)}</span>` : ''}
      <span>Дедлайн: ${Math.round(order.deadlineSec / 60)} мин</span>
    </div>
    ${assignLogHtml}
    ${lateAnalysisHtml}
    <div class="modal-positions">${positionsHtml}</div>
    ${eventsHtml}`;

  _modalEl.style.display = 'flex';
  _attachTimelineHover();
}

function _buildLateAnalysis(order, createdMs, startedMs) {
  if (order.status !== 'completed') return '';

  const completedMs = new Date(order.completedAt).getTime();
  const totalSec = Math.round((completedMs - createdMs) / 1000);
  const waitSec = Math.round((startedMs - createdMs) / 1000);
  const deadlineSec = order.deadlineSec;
  const overSec = totalSec - deadlineSec;

  const stageTimes = _computeWallClockStageTimes(order);

  const maxStage = Object.entries(stageTimes).sort((a, b) => b[1] - a[1])[0];
  const bottleneck = maxStage ? maxStage[0] : null;

  const cls = order.isLate ? 'late-analysis-bad' : 'late-analysis-ok';
  const icon = order.isLate ? '🔴' : '🟢';
  const verdict = order.isLate
    ? `Опоздал на ${_fmtDuration(overSec)}`
    : `Вовремя (запас ${_fmtDuration(Math.abs(overSec))})`;

  let timelineHtml = `<div class="la-timeline">`;
  const segments = [];
  if (waitSec > 0) segments.push({ label: 'Ожидание слота', sec: waitSec, cls: 'la-wait' });
  for (const [label, sec] of Object.entries(stageTimes)) {
    segments.push({ label, sec, cls: label === bottleneck ? 'la-bottleneck' : 'la-stage' });
  }

  const barTotal = Math.max(totalSec, 1);
  for (const seg of segments) {
    const pct = Math.max((seg.sec / barTotal) * 100, 2);
    timelineHtml += `<div class="la-bar-seg ${seg.cls}" style="width:${pct}%" title="${seg.label}: ${_fmtDuration(seg.sec)}"></div>`;
  }
  timelineHtml += `</div>`;

  let breakdownHtml = '<div class="la-breakdown">';
  if (waitSec > 0) {
    const waitPct = Math.round((waitSec / totalSec) * 100);
    breakdownHtml += `<div class="la-row"><span class="la-dot la-wait"></span><span>Ожидание слота</span><span class="la-val">${_fmtDuration(waitSec)} (${waitPct}%)</span></div>`;
  }
  for (const [label, sec] of Object.entries(stageTimes)) {
    const pct = totalSec > 0 ? Math.round((sec / totalSec) * 100) : 0;
    const isBn = label === bottleneck;
    breakdownHtml += `<div class="la-row${isBn ? ' la-row-highlight' : ''}"><span class="la-dot ${isBn ? 'la-bottleneck' : 'la-stage'}"></span><span>${label}${isBn ? ' ⚠️' : ''}</span><span class="la-val">${_fmtDuration(sec)} (${pct}%)</span></div>`;
  }
  breakdownHtml += `<div class="la-row la-row-total"><span></span><span><strong>Итого</strong></span><span class="la-val"><strong>${_fmtDuration(totalSec)} / ${_fmtDuration(deadlineSec)}</strong></span></div>`;
  breakdownHtml += '</div>';

  return `<div class="modal-late-analysis ${cls}">
    <h4>${icon} ${verdict}</h4>
    ${timelineHtml}
    ${breakdownHtml}
  </div>`;
}

function _computeWallClockStageTimes(order) {
  const timeline = order.timeline || [];
  const stageSpans = {};

  for (const ev of timeline) {
    if (!ev.stage) continue;
    const label = STAGE_LABELS[ev.stage] || ev.stage;
    if (!stageSpans[label]) stageSpans[label] = { firstStart: null, lastEnd: null };
    const ms = new Date(ev.time).getTime();
    if (ev.action === 'start') {
      if (!stageSpans[label].firstStart || ms < stageSpans[label].firstStart) {
        stageSpans[label].firstStart = ms;
      }
    }
    if (ev.action === 'end') {
      if (!stageSpans[label].lastEnd || ms > stageSpans[label].lastEnd) {
        stageSpans[label].lastEnd = ms;
      }
    }
  }

  const result = {};
  for (const [label, span] of Object.entries(stageSpans)) {
    if (span.firstStart && span.lastEnd) {
      result[label] = Math.round((span.lastEnd - span.firstStart) / 1000);
    }
  }

  if (Object.keys(result).length === 0) {
    for (const pos of order.positions) {
      for (const stage of pos.stages) {
        const t = Math.round(stage.totalTimeSec);
        const label = STAGE_LABELS[stage.type] || stage.type;
        result[label] = Math.max(result[label] || 0, t);
      }
    }
  }

  return result;
}

function _buildTimeline(order, kitchen) {
  const events = order.timeline || [];
  if (events.length === 0) return '';

  const stationMap = {};
  if (kitchen && kitchen.stations) {
    for (const s of kitchen.stations) stationMap[s.id] = s;
  }

  const cookNames = [...new Set(events.filter(e => e.cook).map(e => e.cook))];
  const cookInfo = {};
  const palette = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
  const orderStartMs = order.startedAt
    ? new Date(order.startedAt).getTime()
    : new Date(order.createdAt).getTime();

  cookNames.forEach((name, i) => {
    const color = palette[i % palette.length];
    let stationLabel = '';
    let stationEmoji = '';
    let firstStartMs = null;

    const kitchenCook = kitchen?.cooks?.find(c => c.name === name);
    if (kitchenCook && kitchenCook.stations?.length > 0) {
      const st = stationMap[kitchenCook.stations[0]];
      if (st) {
        stationLabel = st.name;
        stationEmoji = st.emoji || '';
      }
    }

    if (!stationLabel) {
      const firstEvt = events.find(e => e.cook === name && e.stage);
      if (firstEvt) stationLabel = STAGE_LABELS[firstEvt.stage] || firstEvt.stage;
    }

    const firstStart = events.find(e => e.cook === name && e.action === 'start');
    if (firstStart) firstStartMs = new Date(firstStart.time).getTime();

    cookInfo[name] = { color, stationLabel, stationEmoji, firstStartMs };
  });

  let html = '<div class="modal-timeline"><h4>📍 Путь заказа</h4>';

  if (cookNames.length > 0) {
    html += '<div class="tl-legend">';
    for (const name of cookNames) {
      const ci = cookInfo[name];
      const waitSec = ci.firstStartMs ? Math.round((ci.firstStartMs - orderStartMs) / 1000) : null;
      const waitLabel = waitSec !== null && waitSec > 0 ? ` · ⏱ ${_fmtDuration(waitSec)}` : '';
      html += `<span class="tl-legend-item" data-cook="${name}">`
        + `<span class="tl-legend-dot" style="background:${ci.color}"></span>`
        + `${ci.stationEmoji ? ci.stationEmoji + ' ' : ''}${ci.stationLabel} (${name})`
        + `<span class="tl-legend-wait" data-wait="${waitSec || 0}">${waitLabel}</span>`
        + `</span>`;
    }
    html += '</div>';
  }

  html += '<div class="tl-track">';

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const isLast = i === events.length - 1;
    const isFirst = i === 0;
    const cookAttr = ev.cook ? ` data-cook="${ev.cook}"` : '';
    const ci = ev.cook ? cookInfo[ev.cook] : null;
    const dotStyle = ci ? ` style="border-color:${ci.color}"` : '';

    const evMs = new Date(ev.time).getTime();
    const fromStartSec = Math.round((evMs - orderStartMs) / 1000);

    let timeDelta = '';
    if (i > 0) {
      const prevTime = new Date(events[i - 1].time).getTime();
      const deltaSec = Math.round((evMs - prevTime) / 1000);
      if (deltaSec > 0) timeDelta = `+${_fmtDuration(deltaSec)}`;
    }

    html += `
      <div class="tl-step${isLast ? ' tl-last' : ''}${isFirst ? ' tl-first' : ''}"${cookAttr} data-from-start="${fromStartSec}">
        <div class="tl-connector">
          <div class="tl-dot"${dotStyle}>${ev.icon}</div>
          ${!isLast ? '<div class="tl-line"></div>' : ''}
        </div>
        <div class="tl-content">
          <div class="tl-text">${ev.text}</div>
          <div class="tl-meta">
            <span class="tl-time">${formatTimeShort(ev.time)}</span>
            ${timeDelta ? `<span class="tl-delta">${timeDelta}</span>` : ''}
            <span class="tl-from-start" style="display:none">от старта: ${_fmtDuration(fromStartSec)}</span>
          </div>
        </div>
      </div>`;
  }

  html += '</div></div>';
  return html;
}

function _attachTimelineHover() {
  if (!_modalEl) return;
  const track = _modalEl.querySelector('.tl-track');
  if (!track) return;

  const steps = track.querySelectorAll('.tl-step[data-cook]');
  const legends = _modalEl.querySelectorAll('.tl-legend-item[data-cook]');
  const allSteps = track.querySelectorAll('.tl-step');

  function highlight(cookName) {
    allSteps.forEach(s => {
      const sc = s.dataset.cook;
      const dot = s.querySelector('.tl-dot');
      const fromStart = s.querySelector('.tl-from-start');
      if (!sc) {
        s.classList.remove('tl-dimmed');
      } else if (sc === cookName) {
        s.classList.add('tl-highlight');
        s.classList.remove('tl-dimmed');
        if (dot) {
          const color = dot.style.borderColor || '#3b82f6';
          dot.style.boxShadow = `0 0 0 4px ${color}44`;
        }
        if (fromStart) fromStart.style.display = '';
      } else {
        s.classList.add('tl-dimmed');
        s.classList.remove('tl-highlight');
        if (dot) dot.style.boxShadow = '';
        if (fromStart) fromStart.style.display = 'none';
      }
    });
    legends.forEach(l => {
      l.classList.toggle('tl-legend-active', l.dataset.cook === cookName);
    });
  }

  function clearHighlight() {
    allSteps.forEach(s => {
      s.classList.remove('tl-highlight', 'tl-dimmed');
      const dot = s.querySelector('.tl-dot');
      if (dot) dot.style.boxShadow = '';
      const fromStart = s.querySelector('.tl-from-start');
      if (fromStart) fromStart.style.display = 'none';
    });
    legends.forEach(l => { l.classList.remove('tl-legend-active'); });
  }

  steps.forEach(s => {
    s.addEventListener('mouseenter', () => highlight(s.dataset.cook));
    s.addEventListener('mouseleave', clearHighlight);
  });

  legends.forEach(l => {
    l.addEventListener('mouseenter', () => highlight(l.dataset.cook));
    l.addEventListener('mouseleave', clearHighlight);
  });
}

export function closeOrderModal() {
  if (_modalEl) _modalEl.style.display = 'none';
}
