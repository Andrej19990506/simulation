import { DEFAULT_STATIONS, DEFAULT_DISHES, DEFAULT_COMBOS, DEFAULT_COOKS, DEFAULT_EQUIPMENT } from '../domain/defaults.js';
import { migrateDish } from '../domain/dishes.js';
import { migrateEquipment } from '../domain/equipment.js';

export const state = {
  mode: 'settings',
  branchId: 'branch-1',
  minPrepMinutes: 5,
  maxSlotsToCheck: 50,
  timeScale: 120,
  startTime: null,
  scenarioId: 'lunch_rush',
  activeProfileName: null,

  stations: JSON.parse(JSON.stringify(DEFAULT_STATIONS)),
  dishes: JSON.parse(JSON.stringify(DEFAULT_DISHES)),
  combos: JSON.parse(JSON.stringify(DEFAULT_COMBOS)),
  cooks: JSON.parse(JSON.stringify(DEFAULT_COOKS)),
  equipment: JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT)),

  capacityPerSlot: { sumRub: 30000 },
  slotsByBranch: {},
  kitchen: null,
};

export function extractConfig() {
  return {
    branchId: state.branchId,
    minPrepMinutes: state.minPrepMinutes,
    maxSlotsToCheck: state.maxSlotsToCheck,
    timeScale: state.timeScale,
    scenarioId: state.scenarioId,
    stations: state.stations,
    dishes: state.dishes,
    combos: state.combos,
    cooks: state.cooks,
    equipment: state.equipment,
    capacityPerSlot: state.capacityPerSlot,
    slotsByBranch: state.slotsByBranch,
    slotGenStart: document.getElementById('slotGenStart')?.value || '10:00',
    slotGenEnd: document.getElementById('slotGenEnd')?.value || '22:00',
    slotGenDuration: document.getElementById('slotGenDuration')?.value || '30',
  };
}

export function applyConfig(cfg) {
  if (!cfg) return;
  if (cfg.branchId) state.branchId = cfg.branchId;
  if (cfg.minPrepMinutes != null) state.minPrepMinutes = cfg.minPrepMinutes;
  if (cfg.maxSlotsToCheck != null) state.maxSlotsToCheck = cfg.maxSlotsToCheck;
  if (cfg.timeScale != null) state.timeScale = cfg.timeScale;
  if (cfg.scenarioId) state.scenarioId = cfg.scenarioId;
  if (cfg.stations) {
    state.stations = cfg.stations;
    state.stations.forEach(migrateStation);
  }
  if (cfg.dishes) {
    state.dishes = cfg.dishes;
    state.dishes.forEach(migrateDish);
  }
  if (cfg.combos) state.combos = cfg.combos;
  if (cfg.cooks) state.cooks = cfg.cooks;
  if (cfg.equipment) {
    state.equipment = cfg.equipment;
    state.equipment.forEach(migrateEquipment);
  }
  if (cfg.capacityPerSlot) {
    state.capacityPerSlot = cfg.capacityPerSlot;
    if (!state.capacityPerSlot.sumRub) state.capacityPerSlot = { sumRub: 30000 };
  }
  if (cfg.slotsByBranch) state.slotsByBranch = cfg.slotsByBranch;

  syncFormFromState();

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (cfg.slotGenStart) setVal('slotGenStart', cfg.slotGenStart);
  if (cfg.slotGenEnd) setVal('slotGenEnd', cfg.slotGenEnd);
  if (cfg.slotGenDuration) setVal('slotGenDuration', cfg.slotGenDuration);
}

export function syncFormFromState() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('cfgBranchId', state.branchId);
  set('cfgMinPrep', state.minPrepMinutes);
  set('cfgMaxSlots', state.maxSlotsToCheck);
  set('cfgTimeScale', state.timeScale);
}

export function resetToDefaults() {
  state.stations = JSON.parse(JSON.stringify(DEFAULT_STATIONS));
  state.dishes = JSON.parse(JSON.stringify(DEFAULT_DISHES));
  state.combos = JSON.parse(JSON.stringify(DEFAULT_COMBOS));
  state.cooks = JSON.parse(JSON.stringify(DEFAULT_COOKS));
  state.equipment = JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT));
  state.capacityPerSlot = { sumRub: 30000 };
  state.scenarioId = 'lunch_rush';
  state.branchId = 'branch-1';
  state.minPrepMinutes = 5;
  state.maxSlotsToCheck = 50;
  state.timeScale = 120;
  state.activeProfileName = null;
}

function migrateStation(station) {
  if (!station.parallelSlots) station.parallelSlots = 4;
  delete station.capacity;
  delete station.passive;
}

export function initCapacityDefaults() {
  if (!state.capacityPerSlot.sumRub) state.capacityPerSlot.sumRub = 30000;
}
