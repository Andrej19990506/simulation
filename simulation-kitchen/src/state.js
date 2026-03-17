/**
 * Состояние симуляции: слоты по филиалам и текущее симулируемое время.
 * Единственный источник правды для данных, с которыми работает UI и engine.
 */

const state = {
  /** @type {Record<string, object[]>} */
  slotsByBranch: {},
  /** @type {Date} */
  simNow: new Date()
};

export function getSlotsByBranch() {
  return state.slotsByBranch;
}

export function setSlotsByBranch(config) {
  state.slotsByBranch = config || {};
}

export function getSlotsForBranch(branchId) {
  return state.slotsByBranch[branchId] || [];
}

export function getSimNow() {
  return state.simNow;
}

export function setSimNow(date) {
  state.simNow = date;
}

export { state };
