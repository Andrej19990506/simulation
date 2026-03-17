export function createInitialStateFromConfig(slotsConfig) {
  return slotsConfig || {};
}

export function getBranchSlots(state, branchId) {
  return state[branchId] || [];
}

export function canFitInSlot(slot, load) {
  for (const [key, capVal] of Object.entries(slot.capacity || {})) {
    if (capVal <= 0) continue;
    const usedVal = (slot.used && slot.used[key]) || 0;
    const addVal = load[key] || 0;
    if (usedVal + addVal > capVal) {
      return { canFit: false, reason: { key, usedVal, addVal, capVal } };
    }
  }
  return { canFit: true };
}

export function reserveSlotCapacity(slot, load) {
  const newUsed = { ...(slot.used || {}) };
  for (const [key, addVal] of Object.entries(load)) {
    if (!addVal) continue;
    newUsed[key] = (newUsed[key] || 0) + addVal;
  }
  const prevVersion = slot.version || 0;
  return {
    ...slot,
    used: newUsed,
    version: prevVersion + 1,
  };
}

export function firstFitAssign({
  state,
  branchId,
  orderId,
  visibleAt,
  load,
  minPrepMs,
  maxSlots,
  now,
  logFn,
}) {
  const slots = getBranchSlots(state, branchId);
  const assignLog = [];

  if (!slots.length) {
    if (logFn) logFn(`Нет слотов для филиала ${branchId}.`);
    return { success: false, error: 'NO_SLOTS', assignLog };
  }

  let from = now;
  if (visibleAt > from) from = visibleAt;

  const _fmtTime = (d) => {
    const dt = new Date(d);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
  };

  assignLog.push(`Время: ${_fmtTime(now)}, guard: ${minPrepMs/60000}мин`);

  if (logFn) {
    logFn(`AssignSlot(${orderId}) — branch=${branchId}, from=${from.toLocaleString()}, load=${JSON.stringify(load)}`);
  }

  const sorted = [...slots].sort(
    (a, b) => new Date(a.startsAt) - new Date(b.startsAt),
  );

  let evaluated = 0;
  for (const s of sorted) {
    const startsAt = new Date(s.startsAt);
    const endsAt = new Date(s.endsAt);
    const isActive = startsAt <= now && now < endsAt;
    const slotLabel = `${_fmtTime(startsAt)}–${_fmtTime(endsAt)}`;

    if (s.paused) {
      continue;
    }

    if (endsAt <= from) {
      continue;
    }

    if (evaluated >= maxSlots) break;
    evaluated++;

    if (isActive && minPrepMs > 0 && endsAt - now < minPrepMs) {
      const minLeft = ((endsAt - now) / 60000).toFixed(1);
      assignLog.push(`${slotLabel}: пропущен (до конца ${minLeft}мин < guard ${minPrepMs/60000}мин)`);
      if (logFn) logFn(`  slot=${s.id}: активный, до конца ${minLeft}мин < guard`);
      continue;
    }

    const fit = canFitInSlot(s, load);
    if (!fit.canFit) {
      const { key, usedVal, addVal, capVal } = fit.reason;
      const keyLabel = key === 'sumRub' ? 'сумма ₽' : key;
      assignLog.push(`${slotLabel}: переполнен [${keyLabel}] (${usedVal}+${addVal}>${capVal})`);
      if (logFn) logFn(`  slot=${s.id}: не помещается по ключу "${key}" (${usedVal}+${addVal}>${capVal})`);
      continue;
    }

    const updatedSlot = reserveSlotCapacity(s, load);
    const updatedSlots = slots.map((slot) =>
      slot.id === updatedSlot.id ? updatedSlot : slot,
    );

    const nextState = {
      ...state,
      [branchId]: updatedSlots,
    };

    assignLog.push(`✅ ${slotLabel}: выбран${isActive ? ' (активный)' : ''}`);
    if (logFn) logFn(`  slot=${updatedSlot.id}: выбран, версия ${s.version || 0}→${updatedSlot.version}`);

    return {
      success: true,
      state: nextState,
      slot: updatedSlot,
      assignLog,
    };
  }

  assignLog.push('❌ Подходящих слотов не найдено');
  if (logFn) logFn('AssignSlot: подходящих слотов не найдено (ErrNoAvailableSlots).');
  return { success: false, error: 'NO_AVAILABLE_SLOTS', assignLog };
}

