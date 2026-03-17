/**
 * Доменная логика симуляции: CanFit, Reserve, First Fit AssignSlot.
 * Чистые функции без DOM; работают с объектами слотов и нагрузкой (CapacityVector).
 */

/**
 * Проверяет, помещается ли нагрузка load в слот (по каждому ключу capacity).
 * @param {object} slot - { capacity, used }
 * @param {Record<string, number>} load
 * @returns {boolean}
 */
export function canFit(slot, load) {
  const capacity = slot.capacity || {};
  const used = slot.used || {};
  for (const [key, capVal] of Object.entries(capacity)) {
    if (capVal <= 0) continue;
    const usedVal = used[key] || 0;
    const addVal = load[key] || 0;
    if (usedVal + addVal > capVal) return false;
  }
  return true;
}

/**
 * Резервирует нагрузку в слоте (мутирует slot.used и slot.version).
 * @param {object} slot
 * @param {Record<string, number>} load
 */
export function reserve(slot, load) {
  if (!slot.used) slot.used = {};
  const newUsed = { ...slot.used };
  for (const [key, addVal] of Object.entries(load)) {
    if (!addVal) continue;
    newUsed[key] = (newUsed[key] || 0) + addVal;
  }
  slot.used = newUsed;
  slot.version = (slot.version || 0) + 1;
}

/**
 * First Fit: находит первый подходящий слот, применяет guard window и CanFit, затем Reserve.
 * @param {object} params
 * @param {object[]} params.slots - массив слотов (будет отсортирован по startsAt)
 * @param {string} params.orderId
 * @param {Record<string, number>} params.load
 * @param {Date} params.visibleAt
 * @param {Date} params.now - симулируемое "сейчас"
 * @param {number} params.minPrepMs - guard window в мс
 * @param {number} params.maxSlotsToCheck
 * @returns {{ slot: object, orderId: string } | null} - выбранный слот или null (ErrNoAvailableSlots)
 */
export function assignSlotFirstFit({
  slots,
  orderId,
  load,
  visibleAt,
  now,
  minPrepMs,
  maxSlotsToCheck
}) {
  const from = visibleAt && visibleAt > now ? visibleAt : now;
  const sorted = [...slots].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  let checked = 0;
  for (const s of sorted) {
    if (checked >= maxSlotsToCheck) break;
    checked++;

    const startsAt = new Date(s.startsAt);
    if (startsAt < from) continue;
    if (minPrepMs > 0 && (startsAt - now) < minPrepMs) continue;
    if (!canFit(s, load)) continue;

    reserve(s, load);
    return { slot: s, orderId };
  }
  return null;
}
