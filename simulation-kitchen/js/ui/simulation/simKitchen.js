import { STAGE_LABELS, getEquipmentStatus } from '../../domain/kitchen.js';

export function renderSimCooks(kitchen) {
  const el = document.getElementById('simCooks');
  if (!el || !kitchen) return;

  const eqStatus = getEquipmentStatus(kitchen);

  const existing = el.querySelectorAll('.cook-card');
  const existingMap = {};
  existing.forEach(e => { existingMap[e.dataset.id] = e; });

  kitchen.cooks.forEach(cook => {
    let card = existingMap[cook.id];
    if (!card) {
      card = document.createElement('div');
      card.className = 'cook-card';
      card.dataset.id = cook.id;
      card.innerHTML = `
        <span class="cook-emoji"></span>
        <div class="cook-info">
          <div class="cook-name"></div>
          <div class="cook-status"></div>
          <div class="cook-eq-info"></div>
          <div class="cook-progress"><div class="cook-progress-fill"></div></div>
        </div>`;
      el.appendChild(card);
    }

    card.classList.toggle('busy', cook.status === 'busy');
    card.querySelector('.cook-emoji').textContent = cook.emoji;
    card.querySelector('.cook-name').textContent = cook.name;

    const statusEl = card.querySelector('.cook-status');
    const eqInfoEl = card.querySelector('.cook-eq-info');
    const progressFill = card.querySelector('.cook-progress-fill');

    if (cook.status === 'busy' && cook.equipmentId) {
      const eq = eqStatus[cook.equipmentId];
      if (eq) {
        const itemsList = eq.items.map(it =>
          `${it.dishEmoji} ${it.dishName} ×${it.slotsUsed} (${Math.ceil(it.remainingSec)}с)`
        ).join(', ');

        statusEl.textContent = itemsList || 'Загружает...';
        statusEl.className = 'cook-status cooking';

        eqInfoEl.style.display = '';
        eqInfoEl.innerHTML = `${eq.emoji} <strong>${eq.name}</strong>: ` +
          `<span class="eq-fill">${eq.current}/${eq.capacity}</span> занято, ` +
          `<span class="eq-free">${eq.free}</span> свободно`;

        const fillPct = eq.capacity > 0 ? (eq.current / eq.capacity) * 100 : 0;
        progressFill.style.width = fillPct + '%';
      } else {
        statusEl.textContent = 'Работает с оборудованием...';
        statusEl.className = 'cook-status cooking';
        eqInfoEl.style.display = 'none';
        progressFill.style.width = '0%';
      }
    } else if (cook.status === 'busy' && cook.currentOrderId) {
      eqInfoEl.style.display = 'none';
      const order = kitchen.activeOrders.find(o => o.id === cook.currentOrderId);
      if (order) {
        const pos = order.positions[cook.currentPositionIdx];
        if (pos) {
          const stage = pos.stages[cook.currentStageIdx];
          if (stage) {
            const stageLabel = STAGE_LABELS[stage.type] || stage.type;
            const total = stage.totalTimeSec || 1;
            const done = total - stage.remainingSec;
            statusEl.textContent = `${pos.dishEmoji} ${pos.dishName} [${stageLabel}] (${Math.ceil(stage.remainingSec)}с)`;
            statusEl.className = 'cook-status cooking';
            progressFill.style.width = Math.min(total > 0 ? (done / total) * 100 : 0, 100) + '%';
          } else {
            statusEl.textContent = `🔄 ${cook.currentOrderId}`;
            statusEl.className = 'cook-status cooking';
            progressFill.style.width = '0%';
          }
        } else {
          statusEl.textContent = `🔄 ${cook.currentOrderId}`;
          statusEl.className = 'cook-status cooking';
          progressFill.style.width = '0%';
        }
      } else {
        statusEl.textContent = 'Работает...';
        statusEl.className = 'cook-status cooking';
        progressFill.style.width = '0%';
      }
    } else {
      eqInfoEl.style.display = 'none';
      statusEl.textContent = '💤 Ожидает';
      statusEl.className = 'cook-status';
      progressFill.style.width = '0%';
    }
  });
}

export function renderSimStations(kitchen) {
  const el = document.getElementById('simStations');
  if (!el || !kitchen) return;

  const eqStatus = getEquipmentStatus(kitchen);

  const existing = el.querySelectorAll('.station-chip');
  const existingMap = {};
  existing.forEach(e => { existingMap[e.dataset.id] = e; });

  kitchen.stations.forEach(st => {
    let chip = existingMap[st.id];
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'station-chip';
      chip.dataset.id = st.id;
      chip.innerHTML = `<span class="station-emoji"></span><span class="station-name"></span><span class="station-load"></span><div class="station-eq-detail"></div>`;
      el.appendChild(chip);
    }

    const queueLen = (kitchen.stationQueues[st.id] || []).length;

    chip.querySelector('.station-emoji').textContent = st.emoji;
    chip.querySelector('.station-name').textContent = st.name;
    chip.querySelector('.station-load').textContent = `${st.currentLoad}/${st.parallelSlots}` + (queueLen > 0 ? ` (+${queueLen})` : '');
    chip.classList.toggle('active', st.currentLoad > 0);
    chip.classList.toggle('overloaded', st.currentLoad >= st.parallelSlots);

    const eqDetail = chip.querySelector('.station-eq-detail');
    const stationEqs = Object.entries(eqStatus).filter(([_, s]) => {
      const eq = kitchen.equipment.find(e => e.id === _);
      return eq && eq.station === st.id;
    });

    if (stationEqs.length > 0) {
      const parts = stationEqs.map(([eqId, s]) =>
        `${s.emoji} ${s.current}/${s.capacity}`
      );
      eqDetail.textContent = parts.join(' · ');
      eqDetail.style.display = '';
    } else {
      eqDetail.style.display = 'none';
    }
  });
}

export function renderSimQueue(kitchen) {
  const queueEl = document.getElementById('simQueue');
  const badgeEl = document.getElementById('queueBadge');
  if (!queueEl || !kitchen) return;

  let totalQueued = 0;
  for (const q of Object.values(kitchen.stationQueues || {})) {
    totalQueued += q.length;
  }
  if (badgeEl) badgeEl.textContent = totalQueued;

  queueEl.innerHTML = '';

  const maxShow = 10;
  const waitingOrders = kitchen.activeOrders.filter(o =>
    o.positions.some(p => p.stages.some(s => s.status === 'waiting'))
  );

  const items = waitingOrders.slice(0, maxShow);
  items.forEach(order => {
    const item = document.createElement('div');
    item.className = 'queue-item';

    const id = document.createElement('span');
    id.className = 'queue-id';
    id.textContent = order.id;

    const dishes = document.createElement('span');
    dishes.className = 'queue-dishes';
    dishes.textContent = order.positions.map(p => p.dishEmoji).join('');

    const price = document.createElement('span');
    price.className = 'queue-price';
    price.textContent = order.totalPrice + '₽';

    item.appendChild(id); item.appendChild(dishes); item.appendChild(price);
    queueEl.appendChild(item);
  });

  if (waitingOrders.length > maxShow) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:11px;color:#5a6688;padding:4px';
    more.textContent = `...и ещё ${waitingOrders.length - maxShow}`;
    queueEl.appendChild(more);
  }
}
