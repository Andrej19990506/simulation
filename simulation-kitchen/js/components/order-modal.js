import { html, nothing } from 'lit';
import { BaseComponent } from './base-component.js';
import { getAllOrders, STAGE_LABELS } from '../domain/kitchen.js';
import { formatTimeShort } from '../ui/helpers.js';

function _fmtTimer(totalSec) {
  const sec = Math.round(totalSec);
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
}

function _fmtDuration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м${s}с` : `${m}м`;
}

export class OrderModal extends BaseComponent {
  static properties = {
    orderId: { type: String },
    kitchen: { type: Object },
    simNow: { type: Object },
    _visible: { state: true },
  };

  constructor() {
    super();
    this.orderId = null;
    this.kitchen = null;
    this.simNow = null;
    this._visible = false;
  }

  open(orderId, kitchen, simNow) {
    this.orderId = orderId;
    this.kitchen = kitchen;
    this.simNow = simNow;
    this._visible = true;
  }

  close() {
    this._visible = false;
    this.orderId = null;
  }

  updated() {
    if (this._visible) this._attachTimelineHover();
  }

  _onOverlayClick(e) {
    if (e.target === e.currentTarget) this.close();
  }

  render() {
    if (!this._visible || !this.orderId || !this.kitchen) return nothing;

    const order = getAllOrders(this.kitchen).find(o => o.id === this.orderId);
    if (!order) return nothing;

    const now = this.simNow ? new Date(this.simNow).getTime() : Date.now();
    const createdMs = new Date(order.createdAt).getTime();
    const startedMs = order.startedAt ? new Date(order.startedAt).getTime() : createdMs;
    const cookingElapsedMs = now - startedMs;
    const deadlineMs = order.deadlineSec * 1000;
    const remainMs = deadlineMs - cookingElapsedMs;

    return html`
      <div class="modal-overlay" style="display:flex" @click=${this._onOverlayClick}>
        <div class="modal-content">
          <button class="modal-close" @click=${() => this.close()}>✕</button>
          <div class="modal-body">
            ${this._renderHeader(order, remainMs)}
            ${this._renderMeta(order)}
            ${this._renderAssignLog(order)}
            ${this._renderLateAnalysis(order, createdMs, startedMs)}
            ${this._renderPositions(order)}
            ${this._renderTimeline(order)}
          </div>
        </div>
      </div>`;
  }

  _renderHeader(order, remainMs) {
    let timerCls, timerText;
    if (order.status === 'completed') {
      const sec = Math.round(order.execSec || 0);
      timerCls = order.isLate ? 'timer-red' : 'timer-green';
      timerText = _fmtTimer(sec);
    } else if (order.status === 'failed') {
      timerCls = 'timer-red'; timerText = 'Отказ';
    } else if (order.status === 'scheduled') {
      timerCls = 'timer-yellow'; timerText = '⏳ Ожидает';
    } else {
      const remainSec = Math.floor(remainMs / 1000);
      timerCls = remainSec > 60 ? 'timer-green' : remainSec > 0 ? 'timer-yellow' : 'timer-red';
      timerText = _fmtTimer(remainSec);
    }

    const statusMap = { scheduled: '⏳ Запланирован', active: '🔄 Активен', completed: '✅ Выполнен', failed: '❌ Отказ' };

    return html`
      <div class="modal-header-row">
        <div>
          <h3>${order.id}</h3>
          ${order.comboName ? html`<span class="mh-combo">📦 ${order.comboName}</span>` : nothing}
          <span class="mh-slot">${order.slotId || '—'}</span>
          <span class="mh-status">${statusMap[order.status] || order.status}</span>
        </div>
        <div class="mh-right">
          <span class="modal-timer ${timerCls}">${timerText}</span>
          <span class="mh-price">${order.totalPrice}₽</span>
        </div>
      </div>`;
  }

  _renderMeta(order) {
    return html`
      <div class="modal-meta">
        <span>Создан: ${formatTimeShort(order.createdAt)}</span>
        ${order.startedAt ? html`<span>На кухне: ${formatTimeShort(order.startedAt)}</span>` : nothing}
        ${order.completedAt ? html`<span>Завершён: ${formatTimeShort(order.completedAt)}</span>` : nothing}
        <span>Дедлайн: ${Math.round(order.deadlineSec / 60)} мин</span>
      </div>`;
  }

  _renderAssignLog(order) {
    if (!order.assignLog?.length) return nothing;
    return html`
      <div class="modal-assign-log">
        <h4>🎯 Почему этот слот?</h4>
        ${order.assignLog.map(line => {
          const isReject = line.includes('отклонён') || line.includes('пропущен') || line.includes('переполнен');
          const isSuccess = line.startsWith('✅');
          const cls = isReject ? 'al-reject' : isSuccess ? 'al-success' : 'al-info';
          return html`<div class="al-line ${cls}">${line}</div>`;
        })}
      </div>`;
  }

  _renderLateAnalysis(order, createdMs, startedMs) {
    if (order.status !== 'completed') return nothing;

    const completedMs = new Date(order.completedAt).getTime();
    const totalSec = Math.round((completedMs - createdMs) / 1000);
    const cookingSec = Math.round((completedMs - startedMs) / 1000);
    const waitSec = Math.round((startedMs - createdMs) / 1000);
    const deadlineSec = order.deadlineSec;
    const overSec = cookingSec - deadlineSec;

    const stageTimes = this._computeWallClockStageTimes(order);
    const maxStage = Object.entries(stageTimes).sort((a, b) => b[1] - a[1])[0];
    const bottleneck = maxStage ? maxStage[0] : null;

    const cls = order.isLate ? 'late-analysis-bad' : 'late-analysis-ok';
    const icon = order.isLate ? '🔴' : '🟢';
    const verdict = order.isLate
      ? `Опоздал на ${_fmtDuration(overSec)}`
      : `Вовремя (запас ${_fmtDuration(Math.abs(overSec))})`;

    const segments = [];
    if (waitSec > 0) segments.push({ label: 'Ожидание слота', sec: waitSec, cls: 'la-wait' });
    for (const [label, sec] of Object.entries(stageTimes)) {
      segments.push({ label, sec, cls: label === bottleneck ? 'la-bottleneck' : 'la-stage' });
    }
    const barTotal = Math.max(totalSec, 1);

    return html`
      <div class="modal-late-analysis ${cls}">
        <h4>${icon} ${verdict}</h4>
        <div class="la-timeline">
          ${segments.map(seg => html`
            <div class="la-bar-seg ${seg.cls}"
                 style="width:${Math.max((seg.sec / barTotal) * 100, 2)}%"
                 title="${seg.label}: ${_fmtDuration(seg.sec)}"></div>`)}
        </div>
        <div class="la-breakdown">
          ${waitSec > 0 ? html`
            <div class="la-row">
              <span class="la-dot la-wait"></span>
              <span>Ожидание слота</span>
              <span class="la-val">${_fmtDuration(waitSec)} (${Math.round((waitSec / totalSec) * 100)}%)</span>
            </div>` : nothing}
          ${Object.entries(stageTimes).map(([label, sec]) => {
            const pct = totalSec > 0 ? Math.round((sec / totalSec) * 100) : 0;
            const isBn = label === bottleneck;
            return html`
              <div class="la-row${isBn ? ' la-row-highlight' : ''}">
                <span class="la-dot ${isBn ? 'la-bottleneck' : 'la-stage'}"></span>
                <span>${label}${isBn ? ' ⚠️' : ''}</span>
                <span class="la-val">${_fmtDuration(sec)} (${pct}%)</span>
              </div>`;
          })}
          <div class="la-row la-row-total">
            <span></span><span><strong>Готовка</strong></span>
            <span class="la-val"><strong>${_fmtDuration(cookingSec)} / ${_fmtDuration(deadlineSec)}</strong></span>
          </div>
        </div>
      </div>`;
  }

  _computeWallClockStageTimes(order) {
    const timeline = order.timeline || [];
    const stageSpans = {};
    for (const ev of timeline) {
      if (!ev.stage) continue;
      const label = STAGE_LABELS[ev.stage] || ev.stage;
      if (!stageSpans[label]) stageSpans[label] = { firstStart: null, lastEnd: null };
      const ms = new Date(ev.time).getTime();
      if (ev.action === 'start' && (!stageSpans[label].firstStart || ms < stageSpans[label].firstStart))
        stageSpans[label].firstStart = ms;
      if (ev.action === 'end' && (!stageSpans[label].lastEnd || ms > stageSpans[label].lastEnd))
        stageSpans[label].lastEnd = ms;
    }
    const result = {};
    for (const [label, span] of Object.entries(stageSpans)) {
      if (span.firstStart && span.lastEnd)
        result[label] = Math.round((span.lastEnd - span.firstStart) / 1000);
    }
    if (Object.keys(result).length === 0) {
      for (const pos of order.positions) {
        for (const stage of pos.stages) {
          const label = STAGE_LABELS[stage.type] || stage.type;
          result[label] = Math.max(result[label] || 0, Math.round(stage.totalTimeSec));
        }
      }
    }
    return result;
  }

  _renderPositions(order) {
    return html`
      <div class="modal-positions">
        ${order.positions.map(pos => html`
          <div class="modal-position">
            <div class="mp-header">
              <span class="mp-dish">${pos.dishEmoji} ${pos.dishName}</span>
              <span class="mp-qty">×${pos.quantity}</span>
              <span class="mp-price">${pos.price * pos.quantity}₽</span>
            </div>
            <div class="mp-stages">
              ${pos.stages.map(stage => {
                const label = STAGE_LABELS[stage.type] || stage.type;
                let stageCls = 'stage-pending', icon = '⏳';
                if (stage.status === 'done') { stageCls = 'stage-done'; icon = '✅'; }
                else if (stage.status === 'active') { stageCls = 'stage-active'; icon = '🔥'; }
                else if (stage.status === 'waiting') { stageCls = 'stage-waiting'; icon = '⏱️'; }
                const pct = stage.totalTimeSec > 0
                  ? Math.round(((stage.totalTimeSec - stage.remainingSec) / stage.totalTimeSec) * 100) : 0;
                return html`
                  <div class="modal-stage ${stageCls}">
                    <span class="ms-icon">${icon}</span>
                    <span class="ms-label">${label}</span>
                    <div class="ms-bar"><div class="ms-bar-fill" style="width:${pct}%"></div></div>
                    <span class="ms-time">${Math.round(stage.totalTimeSec - stage.remainingSec)}/${Math.round(stage.totalTimeSec)}с</span>
                  </div>`;
              })}
            </div>
          </div>`)}
      </div>`;
  }

  _renderTimeline(order) {
    const events = order.timeline || [];
    if (events.length === 0) return nothing;

    const cookNames = [...new Set(events.filter(e => e.cook).map(e => e.cook))];
    const palette = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const orderStartMs = order.startedAt
      ? new Date(order.startedAt).getTime()
      : new Date(order.createdAt).getTime();

    const stationMap = {};
    if (this.kitchen?.stations) {
      for (const s of this.kitchen.stations) stationMap[s.id] = s;
    }

    const cookInfo = {};
    cookNames.forEach((name, i) => {
      const color = palette[i % palette.length];
      let stationLabel = '', stationEmoji = '';
      const kitchenCook = this.kitchen?.cooks?.find(c => c.name === name);
      if (kitchenCook?.stations?.length > 0) {
        const st = stationMap[kitchenCook.stations[0]];
        if (st) { stationLabel = st.name; stationEmoji = st.emoji || ''; }
      }
      if (!stationLabel) {
        const firstEvt = events.find(e => e.cook === name && e.stage);
        if (firstEvt) stationLabel = STAGE_LABELS[firstEvt.stage] || firstEvt.stage;
      }
      const firstStart = events.find(e => e.cook === name && e.action === 'start');
      const firstStartMs = firstStart ? new Date(firstStart.time).getTime() : null;
      cookInfo[name] = { color, stationLabel, stationEmoji, firstStartMs };
    });

    return html`
      <div class="modal-timeline">
        <h4>📍 Путь заказа</h4>
        ${cookNames.length > 0 ? html`
          <div class="tl-legend">
            ${cookNames.map(name => {
              const ci = cookInfo[name];
              const waitSec = ci.firstStartMs ? Math.round((ci.firstStartMs - orderStartMs) / 1000) : 0;
              return html`
                <span class="tl-legend-item" data-cook=${name}>
                  <span class="tl-legend-dot" style="background:${ci.color}"></span>
                  ${ci.stationEmoji ? ci.stationEmoji + ' ' : ''}${ci.stationLabel} (${name})
                  ${waitSec > 0 ? html`<span class="tl-legend-wait"> · ⏱ ${_fmtDuration(waitSec)}</span>` : nothing}
                </span>`;
            })}
          </div>` : nothing}

        <div class="tl-track">
          ${events.map((ev, i) => {
            const isLast = i === events.length - 1;
            const isFirst = i === 0;
            const ci = ev.cook ? cookInfo[ev.cook] : null;
            const evMs = new Date(ev.time).getTime();
            const fromStartSec = Math.round((evMs - orderStartMs) / 1000);
            let timeDelta = '';
            if (i > 0) {
              const deltaSec = Math.round((evMs - new Date(events[i - 1].time).getTime()) / 1000);
              if (deltaSec > 0) timeDelta = `+${_fmtDuration(deltaSec)}`;
            }

            return html`
              <div class="tl-step${isLast ? ' tl-last' : ''}${isFirst ? ' tl-first' : ''}"
                   data-cook=${ev.cook || nothing} data-from-start=${fromStartSec}>
                <div class="tl-connector">
                  <div class="tl-dot" style=${ci ? `border-color:${ci.color}` : ''}>${ev.icon}</div>
                  ${!isLast ? html`<div class="tl-line"></div>` : nothing}
                </div>
                <div class="tl-content">
                  <div class="tl-text">${ev.text}</div>
                  <div class="tl-meta">
                    <span class="tl-time">${formatTimeShort(ev.time)}</span>
                    ${timeDelta ? html`<span class="tl-delta">${timeDelta}</span>` : nothing}
                    <span class="tl-from-start" style="display:none">от старта: ${_fmtDuration(fromStartSec)}</span>
                  </div>
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _attachTimelineHover() {
    const track = this.querySelector('.tl-track');
    if (!track) return;

    const steps = track.querySelectorAll('.tl-step[data-cook]');
    const legends = this.querySelectorAll('.tl-legend-item[data-cook]');
    const allSteps = track.querySelectorAll('.tl-step');

    const highlight = (cookName) => {
      allSteps.forEach(s => {
        const sc = s.dataset.cook;
        const dot = s.querySelector('.tl-dot');
        const fromStart = s.querySelector('.tl-from-start');
        if (!sc) { s.classList.remove('tl-dimmed'); }
        else if (sc === cookName) {
          s.classList.add('tl-highlight'); s.classList.remove('tl-dimmed');
          if (dot) dot.style.boxShadow = `0 0 0 4px ${dot.style.borderColor || '#3b82f6'}44`;
          if (fromStart) fromStart.style.display = '';
        } else {
          s.classList.add('tl-dimmed'); s.classList.remove('tl-highlight');
          if (dot) dot.style.boxShadow = '';
          if (fromStart) fromStart.style.display = 'none';
        }
      });
      legends.forEach(l => l.classList.toggle('tl-legend-active', l.dataset.cook === cookName));
    };

    const clear = () => {
      allSteps.forEach(s => {
        s.classList.remove('tl-highlight', 'tl-dimmed');
        const dot = s.querySelector('.tl-dot');
        if (dot) dot.style.boxShadow = '';
        const fromStart = s.querySelector('.tl-from-start');
        if (fromStart) fromStart.style.display = 'none';
      });
      legends.forEach(l => l.classList.remove('tl-legend-active'));
    };

    steps.forEach(s => { s.addEventListener('mouseenter', () => highlight(s.dataset.cook)); s.addEventListener('mouseleave', clear); });
    legends.forEach(l => { l.addEventListener('mouseenter', () => highlight(l.dataset.cook)); l.addEventListener('mouseleave', clear); });
  }
}

customElements.define('order-modal', OrderModal);
