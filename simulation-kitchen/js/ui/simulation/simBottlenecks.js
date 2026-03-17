import { getEquipmentStatus, STAGE_LABELS } from '../../domain/kitchen.js';

let _kitchen = null;
let _simNow = null;

export function renderBottlenecks(kitchen, simNow) {
  const el = document.getElementById('simBottlenecks');
  if (!el || !kitchen) return;

  _kitchen = kitchen;
  _simNow = simNow;

  const issues = [];

  _checkStationQueues(kitchen, issues);
  _checkCookLoad(kitchen, issues);
  _checkCookFatigue(kitchen, issues);
  _checkEquipment(kitchen, issues);
  _checkLateOrders(kitchen, simNow, issues);
  _checkClientRefusals(kitchen, issues);

  issues.sort((a, b) => b.severity - a.severity);

  if (issues.length === 0) {
    el.innerHTML = '<div class="bn-ok"><span class="bn-ok-icon">✅</span>Всё в норме</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const cls = issue.severity >= 3 ? 'bn-crit' : issue.severity >= 2 ? 'bn-warn' : 'bn-info';
    html += `<div class="bn-card ${cls}" data-idx="${i}" style="cursor:pointer">
      <div class="bn-card-header">
        <span class="bn-icon">${issue.icon}</span>
        <span class="bn-title">${issue.title}</span>
        <span class="bn-sev">${'●'.repeat(issue.severity)}</span>
      </div>
      <div class="bn-detail">${issue.detail}</div>
      ${issue.bar != null ? `<div class="bn-bar-wrap"><div class="bn-bar-fill ${cls}" style="width:${issue.bar}%"></div></div>` : ''}
    </div>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.bn-card[data-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      if (issues[idx]) _openBottleneckModal(issues[idx]);
    });
  });
}

function _checkStationQueues(kitchen, issues) {
  for (const station of kitchen.stations) {
    const queue = kitchen.stationQueues[station.id] || [];
    const load = station.currentLoad || 0;
    const max = station.parallelSlots || 1;
    const pct = Math.round((load / max) * 100);

    if (queue.length >= 3 || pct >= 100) {
      const severity = queue.length >= 5 ? 3 : queue.length >= 3 ? 2 : 1;
      issues.push({
        type: 'station', data: { stationId: station.id },
        icon: station.emoji || '🔧',
        title: `${station.name}: перегрузка`,
        detail: `Загрузка ${load}/${max} · В очереди: ${queue.length} заказ(ов)`,
        severity,
        bar: Math.min(pct, 100),
      });
    }
  }
}

function _checkCookLoad(kitchen, issues) {
  const totalCooks = kitchen.cooks.length;
  const busyCooks = kitchen.cooks.filter(c => c.status === 'busy').length;
  const idleCooks = totalCooks - busyCooks;
  const busyPct = totalCooks > 0 ? Math.round((busyCooks / totalCooks) * 100) : 0;

  if (busyPct === 100 && totalCooks > 0) {
    let totalQueued = 0;
    for (const q of Object.values(kitchen.stationQueues || {})) totalQueued += q.length;

    if (totalQueued > 0) {
      issues.push({
        type: 'cooks_busy', data: {},
        icon: '👨‍🍳',
        title: 'Все повара заняты',
        detail: `${busyCooks}/${totalCooks} заняты · ${totalQueued} в очереди без повара`,
        severity: 3,
        bar: 100,
      });
    }
  } else if (idleCooks > 1 && busyCooks > 0) {
    let totalQueued = 0;
    for (const q of Object.values(kitchen.stationQueues || {})) totalQueued += q.length;
    if (totalQueued === 0) {
      issues.push({
        type: 'cooks_idle', data: {},
        icon: '💤',
        title: `${idleCooks} повар(а) простаивают`,
        detail: `Занято: ${busyCooks}/${totalCooks} · Нет заказов в очереди`,
        severity: 1,
        bar: busyPct,
      });
    }
  }
}

function _checkCookFatigue(kitchen, issues) {
  const tiredCooks = kitchen.cooks.filter(c => (c.fatigueMultiplier || 1) > 1.01);
  if (tiredCooks.length === 0) return;

  const worst = tiredCooks.reduce((a, b) => (b.fatigueMultiplier > a.fatigueMultiplier ? b : a));
  const worstPct = Math.round((worst.fatigueMultiplier - 1) * 200);
  const speedPct = Math.round((1 / worst.fatigueMultiplier) * 100);
  const workHours = Math.round(worst.continuousWorkSec / 3600 * 10) / 10;

  const details = tiredCooks.map(c => {
    const sp = Math.round((1 / (c.fatigueMultiplier || 1)) * 100);
    const hrs = Math.round(c.continuousWorkSec / 3600 * 10) / 10;
    return `${c.emoji} ${c.name}: ${sp}% скорость (${hrs}ч работы)`;
  }).join(' · ');

  const severity = worst.fatigueMultiplier >= 1.3 ? 3 : worst.fatigueMultiplier >= 1.15 ? 2 : 1;

  issues.push({
    type: 'cook_fatigue',
    data: { cookIds: tiredCooks.map(c => c.id), worstCookId: worst.id },
    icon: '😓',
    title: `Усталость: ${tiredCooks.length} повар(а)`,
    detail: details,
    severity,
    bar: Math.min(worstPct, 100),
  });
}

function _checkEquipment(kitchen, issues) {
  const eqStatus = getEquipmentStatus(kitchen);
  for (const [eqId, eq] of Object.entries(eqStatus)) {
    if (eq.capacity <= 0) continue;
    const fillPct = Math.round((eq.current / eq.capacity) * 100);

    const station = kitchen.stations.find(s => {
      const eqObj = kitchen.equipment.find(e => e.id === eqId);
      return eqObj && eqObj.station === s.id;
    });
    const queue = station ? (kitchen.stationQueues[station.id] || []) : [];

    if (fillPct >= 90 && queue.length > 0) {
      issues.push({
        type: 'equipment', data: { eqId },
        icon: eq.emoji || '🔥',
        title: `${eq.name}: почти полон`,
        detail: `${eq.current}/${eq.capacity} занято · ${queue.length} ожидают загрузки`,
        severity: fillPct >= 100 ? 3 : 2,
        bar: fillPct,
      });
    }
  }
}

function _checkLateOrders(kitchen, simNow, issues) {
  const now = new Date(simNow).getTime();
  let lateActive = 0;
  let worstOverSec = 0;

  for (const order of kitchen.activeOrders) {
    const createdMs = new Date(order.createdAt).getTime();
    const elapsedMs = now - createdMs;
    const deadlineMs = order.deadlineSec * 1000;
    if (elapsedMs > deadlineMs) {
      lateActive++;
      const overSec = (elapsedMs - deadlineMs) / 1000;
      if (overSec > worstOverSec) worstOverSec = overSec;
    }
  }

  if (lateActive > 0) {
    issues.push({
      type: 'late_orders', data: {},
      icon: '🔴',
      title: `${lateActive} заказ(ов) уже опаздывают`,
      detail: `Макс. превышение: ${_fmtSec(worstOverSec)}`,
      severity: lateActive >= 3 ? 3 : 2,
      bar: null,
    });
  }
}

function _fmtSec(s) {
  s = Math.round(s);
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}м ${r}с` : `${m}м`;
}

function _checkClientRefusals(kitchen, issues) {
  const refusals = kitchen.stats.clientRefusals || 0;
  if (refusals === 0) return;

  const total = kitchen.stats.totalOrders || 1;
  const pct = Math.round((refusals / total) * 100);
  const severity = pct >= 15 ? 3 : pct >= 5 ? 2 : 1;

  issues.push({
    type: 'client_refusals', data: {},
    icon: '🙅',
    title: `${refusals} клиентов отказались (${pct}%)`,
    detail: `Долгое ожидание слота — клиенты уходят`,
    severity,
    bar: null,
  });
}

function _openBottleneckModal(issue) {
  const modal = document.getElementById('bottleneckModal');
  if (!modal || !_kitchen) return;

  const body = modal.querySelector('.modal-body');
  const cls = issue.severity >= 3 ? 'bn-crit' : issue.severity >= 2 ? 'bn-warn' : 'bn-info';

  let contentHtml = '';

  switch (issue.type) {
    case 'station':
      contentHtml = _buildStationDetail(issue);
      break;
    case 'cooks_busy':
      contentHtml = _buildCooksBusyDetail();
      break;
    case 'cooks_idle':
      contentHtml = _buildCooksIdleDetail();
      break;
    case 'equipment':
      contentHtml = _buildEquipmentDetail(issue);
      break;
    case 'late_orders':
      contentHtml = _buildLateOrdersDetail();
      break;
    case 'client_refusals':
      contentHtml = _buildClientRefusalsDetail();
      break;
    default:
      contentHtml = `<p>${issue.detail}</p>`;
  }

  body.innerHTML = `
    <div class="bnm-header ${cls}">
      <span class="bnm-icon">${issue.icon}</span>
      <div>
        <h3>${issue.title}</h3>
        <div class="bnm-sub">${issue.detail}</div>
      </div>
    </div>
    ${contentHtml}`;

  modal.style.display = 'flex';
}

function _buildStationDetail(issue) {
  const station = _kitchen.stations.find(s => s.id === issue.data.stationId);
  if (!station) return '';

  const queue = _kitchen.stationQueues[station.id] || [];
  const cooksOnStation = _kitchen.cooks.filter(c =>
    c.status === 'busy' && c.stations?.includes(station.id)
  );
  const idleCooksForStation = _kitchen.cooks.filter(c =>
    c.status === 'idle' && c.stations?.includes(station.id)
  );

  let ordersInQueue = '';
  for (const item of queue.slice(0, 10)) {
    const order = _kitchen.activeOrders.find(o => o.id === item.orderId);
    if (order) {
      const dishes = order.positions.map(p => p.dishEmoji).join('');
      ordersInQueue += `<div class="bnm-row"><span>${order.id}</span><span>${dishes}</span><span>${order.totalPrice}₽</span></div>`;
    }
  }

  let cooksList = '';
  for (const cook of cooksOnStation) {
    const order = _kitchen.activeOrders.find(o => o.id === cook.currentOrderId);
    const pos = order?.positions?.[cook.currentPositionIdx];
    const stage = pos?.stages?.[cook.currentStageIdx];
    const stageLabel = stage ? (STAGE_LABELS[stage.type] || stage.type) : '';
    const remaining = stage ? `${Math.ceil(stage.remainingSec)}с` : '';
    cooksList += `<div class="bnm-row"><span>👨‍🍳 ${cook.name}</span><span>${pos ? pos.dishEmoji + ' ' + pos.dishName : '—'} [${stageLabel}]</span><span>${remaining}</span></div>`;
  }

  const eqStatus = getEquipmentStatus(_kitchen);
  let eqHtml = '';
  for (const [eqId, eq] of Object.entries(eqStatus)) {
    const eqObj = _kitchen.equipment.find(e => e.id === eqId);
    if (eqObj && eqObj.station === station.id) {
      eqHtml += `<div class="bnm-eq">
        <strong>${eq.emoji} ${eq.name}</strong>: ${eq.current}/${eq.capacity} занято, ${eq.free} свободно
        ${eq.items?.length > 0 ? '<div class="bnm-eq-items">' + eq.items.map(it =>
          `<span class="bnm-eq-item">${it.dishEmoji} ${it.dishName} — ${Math.ceil(it.remainingSec)}с</span>`
        ).join('') + '</div>' : ''}
      </div>`;
    }
  }

  return `
    <div class="bnm-section">
      <h4>📊 Состояние станции</h4>
      <div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${station.currentLoad}/${station.parallelSlots}</div><div class="bnm-stat-lbl">Загрузка</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${queue.length}</div><div class="bnm-stat-lbl">В очереди</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${cooksOnStation.length}</div><div class="bnm-stat-lbl">Повара работают</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${idleCooksForStation.length}</div><div class="bnm-stat-lbl">Повара свободны</div></div>
      </div>
    </div>
    ${cooksList ? `<div class="bnm-section"><h4>👨‍🍳 Повара на станции</h4><div class="bnm-list">${cooksList}</div></div>` : ''}
    ${eqHtml ? `<div class="bnm-section"><h4>🔧 Оборудование</h4>${eqHtml}</div>` : ''}
    ${ordersInQueue ? `<div class="bnm-section"><h4>📥 Очередь (${queue.length})</h4><div class="bnm-list">${ordersInQueue}</div>${queue.length > 10 ? `<div class="bnm-more">...и ещё ${queue.length - 10}</div>` : ''}</div>` : ''}
    <div class="bnm-section bnm-tip">
      <h4>💡 Рекомендация</h4>
      <p>${_getStationTip(station, queue, cooksOnStation, idleCooksForStation)}</p>
    </div>`;
}

function _getStationTip(station, queue, busyCooks, idleCooks) {
  if (queue.length >= 5 && idleCooks.length === 0) {
    return `Критическая очередь. Добавьте ещё повара на станцию "${station.name}" или увеличьте parallelSlots.`;
  }
  if (queue.length >= 3 && idleCooks.length > 0) {
    return `Есть свободные повара, но они не берут заказы. Проверьте привязку поваров к станции "${station.name}".`;
  }
  if (busyCooks.length >= station.parallelSlots) {
    return `Все слоты станции заняты. Рассмотрите увеличение мощности станции или перераспределение блюд.`;
  }
  return `Следите за динамикой — если очередь растёт, потребуются дополнительные ресурсы.`;
}

function _buildCooksBusyDetail() {
  let html = '<div class="bnm-section"><h4>👨‍🍳 Все повара</h4><div class="bnm-list">';

  for (const cook of _kitchen.cooks) {
    const order = _kitchen.activeOrders.find(o => o.id === cook.currentOrderId);
    const pos = order?.positions?.[cook.currentPositionIdx];
    const stage = pos?.stages?.[cook.currentStageIdx];
    const stageLabel = stage ? (STAGE_LABELS[stage.type] || stage.type) : '';
    const remaining = stage ? Math.ceil(stage.remainingSec) : 0;

    const stationNames = (cook.stations || []).map(sId => {
      const st = _kitchen.stations.find(s => s.id === sId);
      return st ? st.name : sId;
    }).join(', ');

    html += `<div class="bnm-row">
      <span>${cook.emoji} ${cook.name}</span>
      <span>${pos ? pos.dishEmoji + ' ' + pos.dishName + ' [' + stageLabel + ']' : cook.equipmentId ? '🔧 Оборудование' : '—'}</span>
      <span>${remaining > 0 ? remaining + 'с' : '—'}</span>
    </div>`;
  }

  html += '</div></div>';

  let totalQueued = 0;
  let queueBreakdown = '';
  for (const [stId, q] of Object.entries(_kitchen.stationQueues || {})) {
    if (q.length === 0) continue;
    totalQueued += q.length;
    const st = _kitchen.stations.find(s => s.id === stId);
    queueBreakdown += `<div class="bnm-row"><span>${st?.emoji || '🔧'} ${st?.name || stId}</span><span>${q.length} в очереди</span><span></span></div>`;
  }

  if (queueBreakdown) {
    html += `<div class="bnm-section"><h4>📥 Очереди по станциям (${totalQueued})</h4><div class="bnm-list">${queueBreakdown}</div></div>`;
  }

  html += `<div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>Все повара заняты, заказы копятся. Добавьте дополнительных сотрудников на загруженные станции.</p></div>`;

  return html;
}

function _buildCooksIdleDetail() {
  let html = '<div class="bnm-section"><h4>👨‍🍳 Статус поваров</h4><div class="bnm-list">';

  for (const cook of _kitchen.cooks) {
    const status = cook.status === 'busy' ? '🔥 Занят' : '💤 Свободен';
    const stationNames = (cook.stations || []).map(sId => {
      const st = _kitchen.stations.find(s => s.id === sId);
      return st ? st.emoji + ' ' + st.name : sId;
    }).join(', ');

    html += `<div class="bnm-row"><span>${cook.emoji} ${cook.name} — ${status}</span><span>${stationNames}</span><span></span></div>`;
  }

  html += '</div></div>';
  html += `<div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>Сотрудники простаивают. Если это длится долго, рассмотрите перераспределение на другие станции или сокращение смены.</p></div>`;

  return html;
}

function _buildEquipmentDetail(issue) {
  const eqStatus = getEquipmentStatus(_kitchen);
  const eq = eqStatus[issue.data.eqId];
  const eqObj = _kitchen.equipment.find(e => e.id === issue.data.eqId);
  if (!eq || !eqObj) return '';

  const station = _kitchen.stations.find(s => s.id === eqObj.station);
  const queue = station ? (_kitchen.stationQueues[station.id] || []) : [];
  const assignedCook = _kitchen.cooks.find(c => c.equipmentId === issue.data.eqId);

  let itemsHtml = '';
  if (eq.items?.length > 0) {
    for (const it of eq.items) {
      const pct = it.totalSec > 0 ? Math.round(((it.totalSec - it.remainingSec) / it.totalSec) * 100) : 0;
      itemsHtml += `<div class="bnm-row">
        <span>${it.dishEmoji} ${it.dishName} ×${it.slotsUsed}</span>
        <span><div class="bnm-mini-bar"><div class="bnm-mini-fill" style="width:${pct}%"></div></div></span>
        <span>${Math.ceil(it.remainingSec)}с</span>
      </div>`;
    }
  }

  return `
    <div class="bnm-section">
      <h4>📊 Оборудование</h4>
      <div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${eq.current}/${eq.capacity}</div><div class="bnm-stat-lbl">Загрузка</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${eq.free}</div><div class="bnm-stat-lbl">Свободно</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${queue.length}</div><div class="bnm-stat-lbl">В очереди</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${assignedCook?.name || '—'}</div><div class="bnm-stat-lbl">Ответственный</div></div>
      </div>
    </div>
    ${itemsHtml ? `<div class="bnm-section"><h4>🔥 Сейчас в работе</h4><div class="bnm-list">${itemsHtml}</div></div>` : ''}
    <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${eq.free === 0 ? 'Оборудование полностью загружено. Рассмотрите добавление единиц оборудования в настройках.' : 'Мощность на пределе. Следите за динамикой.'}</p></div>`;
}

function _buildLateOrdersDetail() {
  const now = new Date(_simNow).getTime();
  const lateOrders = [];

  for (const order of _kitchen.activeOrders) {
    const createdMs = new Date(order.createdAt).getTime();
    const elapsedMs = now - createdMs;
    const deadlineMs = order.deadlineSec * 1000;
    if (elapsedMs > deadlineMs) {
      lateOrders.push({ order, overSec: (elapsedMs - deadlineMs) / 1000 });
    }
  }

  lateOrders.sort((a, b) => b.overSec - a.overSec);

  let rows = '';
  for (const { order, overSec } of lateOrders) {
    const dishes = order.positions.map(p => p.dishEmoji).join('');
    const waitingStages = [];
    for (const pos of order.positions) {
      for (const stage of pos.stages) {
        if (stage.status === 'active') {
          waitingStages.push(`${pos.dishEmoji} ${STAGE_LABELS[stage.type] || stage.type} (${Math.ceil(stage.remainingSec)}с)`);
        } else if (stage.status === 'waiting') {
          waitingStages.push(`${pos.dishEmoji} ${STAGE_LABELS[stage.type] || stage.type} (ожидает)`);
        }
      }
    }

    rows += `<div class="bnm-late-order">
      <div class="bnm-row"><span><strong>${order.id}</strong></span><span>${dishes}</span><span class="bnm-over">-${_fmtSec(overSec)}</span></div>
      ${waitingStages.length > 0 ? `<div class="bnm-stages">${waitingStages.map(s => `<span class="bnm-stage-chip">${s}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  const stageBottlenecks = {};
  for (const { order } of lateOrders) {
    for (const pos of order.positions) {
      for (const stage of pos.stages) {
        if (stage.status === 'active' || stage.status === 'waiting') {
          const label = STAGE_LABELS[stage.type] || stage.type;
          stageBottlenecks[label] = (stageBottlenecks[label] || 0) + 1;
        }
      }
    }
  }

  let bottleneckHtml = '';
  const sorted = Object.entries(stageBottlenecks).sort((a, b) => b[1] - a[1]);
  for (const [label, count] of sorted) {
    bottleneckHtml += `<div class="bnm-row"><span>${label}</span><span>${count} операций застряли</span><span></span></div>`;
  }

  return `
    <div class="bnm-section"><h4>🔴 Опаздывающие заказы (${lateOrders.length})</h4>${rows}</div>
    ${bottleneckHtml ? `<div class="bnm-section"><h4>🎯 Где застряли?</h4><div class="bnm-list">${bottleneckHtml}</div></div>` : ''}
    <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${sorted.length > 0 ? `Основное узкое место: "${sorted[0][0]}". Усильте эту станцию дополнительными ресурсами.` : 'Проверьте загрузку станций и поваров.'}</p></div>`;
}

function _buildClientRefusalsDetail() {
  const refusals = _kitchen.failedOrders.filter(o => o.failReason === 'CLIENT_REFUSED');
  const total = _kitchen.stats.totalOrders || 1;
  const pct = Math.round((refusals.length / total) * 100);
  const lostRevenue = refusals.reduce((s, o) => s + o.totalPrice, 0);

  const waitBuckets = { '0-5м': 0, '5-15м': 0, '15-30м': 0, '30-60м': 0, '60+м': 0 };
  for (const o of refusals) {
    const w = o.waitMinutes || 0;
    if (w <= 5) waitBuckets['0-5м']++;
    else if (w <= 15) waitBuckets['5-15м']++;
    else if (w <= 30) waitBuckets['15-30м']++;
    else if (w <= 60) waitBuckets['30-60м']++;
    else waitBuckets['60+м']++;
  }

  let bucketRows = '';
  for (const [range, count] of Object.entries(waitBuckets)) {
    if (count === 0) continue;
    const bPct = Math.round((count / refusals.length) * 100);
    bucketRows += `<div class="bnm-row"><span>⏱ ${range}</span><span>${count} отказов</span><span>${bPct}%</span></div>`;
  }

  const recent = refusals.slice(-8).reverse();
  let recentRows = '';
  for (const o of recent) {
    const dishes = o.positions.map(p => p.dishEmoji).join('');
    recentRows += `<div class="bnm-row"><span>${o.id}</span><span>${dishes} · ~${o.waitMinutes || '?'}мин ожид.</span><span>${o.totalPrice}₽</span></div>`;
  }

  return `
    <div class="bnm-section">
      <h4>📊 Сводка</h4>
      <div class="bnm-stats">
        <div class="bnm-stat"><div class="bnm-stat-val">${refusals.length}</div><div class="bnm-stat-lbl">Отказов</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${pct}%</div><div class="bnm-stat-lbl">От всех заказов</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${(lostRevenue / 1000).toFixed(1)}к</div><div class="bnm-stat-lbl">Потеряно ₽</div></div>
        <div class="bnm-stat"><div class="bnm-stat-val">${refusals.length > 0 ? Math.round(refusals.reduce((s, o) => s + (o.waitMinutes || 0), 0) / refusals.length) : 0}м</div><div class="bnm-stat-lbl">Ср. ожидание</div></div>
      </div>
    </div>
    <div class="bnm-section"><h4>⏱ Распределение по времени ожидания</h4><div class="bnm-list">${bucketRows}</div></div>
    ${recentRows ? `<div class="bnm-section"><h4>🙅 Последние отказы</h4><div class="bnm-list">${recentRows}</div></div>` : ''}
    <div class="bnm-section bnm-tip"><h4>💡 Рекомендация</h4><p>${pct >= 15 ? 'Критический уровень отказов. Увеличьте лимит суммы на слот, добавьте слоты или увеличьте мощность кухни.' : pct >= 5 ? 'Заметный уровень отказов. Рассмотрите расширение слотов в пиковые часы.' : 'Незначительный уровень отказов — в пределах нормы.'}</p></div>`;
}
