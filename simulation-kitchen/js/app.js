import { createKitchenState, resetOrderSeq, getKitchenStats, pushTimeline } from './domain/kitchen.js';
import { SimulationEngine } from './simulation/engine.js';
import { getAllScenarios, getScenario } from './simulation/config.js';
import { getProfile } from './simulation/orderProfiles.js';

import { state, extractConfig, applyConfig, syncFormFromState, resetToDefaults, initCapacityDefaults } from './state/store.js';
import { saveProfileToStorage, loadProfileFromStorage, deleteProfileFromStorage, getProfileNames, autoSave, loadAutoSave, LAST_PROFILE_KEY } from './state/storage.js';
import { pad, todayStr } from './ui/helpers.js';

import { renderCooksEditor } from './ui/settings/cooksEditor.js';
import { renderStationsEditor } from './ui/settings/stationsEditor.js';
import { renderMenuEditor } from './ui/settings/menuEditor.js';
import { renderCombosEditor } from './ui/settings/combosEditor.js';
import { renderEquipmentEditor } from './ui/settings/equipmentEditor.js';
import { renderSlotCapacityEditor, renderSlotsPreview, setSlotChangeHandler } from './ui/settings/slotEditor.js';
import { renderScenarioSelector, renderIntensityChart } from './ui/settings/scenarioEditor.js';
import { renderProfileManager } from './ui/settings/profileBar.js';

import { renderSimMetrics } from './ui/simulation/simMonitor.js';

import './components/settings-view.js';
import './components/sim-view.js';
import './components/order-modal.js';
import './components/bottleneck-modal.js';
import './components/shift-report-modal.js';

let engine = null;
let rafId = null;

function _fmtSec(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м${s}с` : `${m}м`;
}

const doAutoSave = () => autoSave(extractConfig);

function _getSimView() { return document.getElementById('simViewComponent'); }
function _getOrderModal() { return document.getElementById('orderModalComponent'); }
function _getBottleneckModal() { return document.getElementById('bottleneckModalComponent'); }
function _getShiftReportModal() { return document.getElementById('shiftReportModalComponent'); }

// ─── Slot Generation ───────────────────────────────────────

function generateSlots() {
  const startTimeStr = document.getElementById('slotGenStart').value || '10:00';
  const endTimeStr = document.getElementById('slotGenEnd').value || '22:00';
  const durationMin = parseInt(document.getElementById('slotGenDuration').value) || 30;
  const dateStr = document.getElementById('slotGenDate').value || todayStr();

  const [startH, startM] = startTimeStr.split(':').map(Number);
  const [endH, endM] = endTimeStr.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  const capacity = { sumRub: state.capacityPerSlot.sumRub || 30000 };

  const slots = [];
  let currentMin = startMin;
  let idx = 1;

  while (currentMin + durationMin <= endMin) {
    const sH = Math.floor(currentMin / 60), sM = currentMin % 60;
    const eMin = currentMin + durationMin;
    const eH = Math.floor(eMin / 60), eM = eMin % 60;
    slots.push({
      id: `slot-${idx}`,
      startsAt: `${dateStr}T${pad(sH)}:${pad(sM)}:00`,
      endsAt: `${dateStr}T${pad(eH)}:${pad(eM)}:00`,
      capacity: { ...capacity }, used: {}, version: 0, paused: false,
    });
    currentMin = eMin;
    idx++;
  }

  state.slotsByBranch = { [state.branchId]: slots };
  renderSlotsPreview(state.slotsByBranch, state.branchId);
  doAutoSave();
}

// ─── Settings Rendering ────────────────────────────────────

function refreshSettings() {
  const onChange = doAutoSave;

  renderCooksEditor(state.cooks, state.stations, state.dishes, onChange);
  renderStationsEditor(state.stations, onChange);
  renderEquipmentEditor(state.equipment, state.dishes, state.combos, state.stations, onChange);
  renderMenuEditor(state.dishes, state.stations, onChange);
  renderCombosEditor(state.combos, state.dishes, onChange, state.stations, state.equipment);
  renderSlotCapacityEditor(state.stations, state.capacityPerSlot, onChange);
  renderSlotsPreview(state.slotsByBranch, state.branchId);

  renderScenarioSelector(getAllScenarios(), state.scenarioId, (id) => {
    state.scenarioId = id;
    renderIntensityChart(getProfile(id));
    const sc = getScenario(id);
    state.timeScale = sc.timeScale;
    document.getElementById('cfgTimeScale').value = sc.timeScale;
    doAutoSave();
  });
  renderIntensityChart(getProfile(state.scenarioId));

  renderProfileManager({
    profiles: getProfileNames(),
    activeProfile: state.activeProfileName,
    onSave: (name) => { saveProfileToStorage(name, extractConfig()); state.activeProfileName = name; refreshSettings(); },
    onLoad: (name) => { const cfg = loadProfileFromStorage(name); if (cfg) { applyConfig(cfg); state.activeProfileName = name; refreshSettings(); } },
    onDelete: (name) => { deleteProfileFromStorage(name); if (state.activeProfileName === name) state.activeProfileName = null; refreshSettings(); },
    onExport: () => {
      const blob = new Blob([JSON.stringify(extractConfig(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `kitchen-profile-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    },
    onImport: (json) => {
      try { applyConfig(JSON.parse(json)); refreshSettings(); }
      catch (e) { alert('Ошибка импорта: ' + e.message); }
    },
    onReset: () => { resetToDefaults(); initCapacityDefaults(); syncFormFromState(); refreshSettings(); doAutoSave(); },
  });
}

// ─── Mode Switching ────────────────────────────────────────

function switchToSimulation() {
  state.branchId = document.getElementById('cfgBranchId').value || 'branch-1';
  state.minPrepMinutes = parseInt(document.getElementById('cfgMinPrep').value) || 0;
  state.maxSlotsToCheck = parseInt(document.getElementById('cfgMaxSlots').value) || 50;
  state.timeScale = parseInt(document.getElementById('cfgTimeScale').value) || 120;

  if (Object.keys(state.slotsByBranch).length === 0) generateSlots();

  const branchSlots = state.slotsByBranch[state.branchId] || [];
  if (branchSlots.length === 0) { alert('Сначала сгенерируйте слоты!'); return; }

  resetOrderSeq();
  state.kitchen = createKitchenState({
    stations: state.stations,
    cooks: state.cooks,
    dishes: state.dishes,
    equipment: state.equipment,
  });

  for (const slots of Object.values(state.slotsByBranch)) {
    for (const s of slots) { s.used = {}; s.version = 0; }
  }

  const simStartTime = new Date(branchSlots[0].startsAt);

  const simView = _getSimView();
  const orderModal = _getOrderModal();
  const bottleneckModal = _getBottleneckModal();

  const handleOrderClick = (orderId) => {
    if (state.kitchen && engine) {
      orderModal?.open(orderId, state.kitchen, engine.getSimNow());
    }
  };

  if (simView && !simView._eventsAttached) {
    simView._eventsAttached = true;
    simView.addEventListener('order-click', (e) => handleOrderClick(e.detail.orderId));
    simView.addEventListener('bottleneck-click', (e) => {
      bottleneckModal?.open(e.detail.issue, state.kitchen, engine?.getSimNow());
    });
  }

  engine = new SimulationEngine({
    onTick: (simNow, { timeScale, ordersClosed }) => {
      const clockEl = document.getElementById('simClock');
      if (clockEl) clockEl.textContent = `${pad(simNow.getHours())}:${pad(simNow.getMinutes())}:${pad(simNow.getSeconds())}`;
      const speedLabel = document.getElementById('simSpeedLabel');
      if (speedLabel) speedLabel.textContent = `x${timeScale}`;

      const statusEl = document.getElementById('headerSubtitle');
      if (statusEl && ordersClosed) {
        const pending = (state.kitchen?.activeOrders?.length || 0) + (state.kitchen?.scheduledOrders?.length || 0);
        statusEl.textContent = pending > 0
          ? `⏳ Приём закрыт · Осталось заказов: ${pending}`
          : '✅ Смена завершена';
      }

      if (simView) {
        simView.kitchen = state.kitchen;
        simView.simNow = simNow;
        simView.slotsByBranch = state.slotsByBranch;
        simView.branchId = state.branchId;
        simView.stats = getKitchenStats(state.kitchen);
        simView.requestUpdate();
      }

      renderSimMetrics(getKitchenStats(state.kitchen));
    },
    onEvent: (evt) => {
      const t = evt.time;
      const k = state.kitchen;
      const stageRu = { prep: 'готовку', baking: 'выпекание', assembly: 'сборку' };

      const fp = simView?.querySelector('sim-feed-panel');

      switch (evt.type) {
        case 'order_assigned': {
          const waitInfo = evt.waitMinutes > 0 ? ` ⏱ ожидание ~${Math.round(evt.waitMinutes)}мин` : '';
          fp?.addFeedItem('order_assigned', `📋 ${evt.orderId} → ${evt.slotId} (${evt.positionCount} блюд, ${evt.totalPrice}₽)${waitInfo}`, t, { orderId: evt.orderId });
          const tlWait = evt.waitMinutes > 0 ? ` (ожидание слота ~${Math.round(evt.waitMinutes)}мин)` : '';
          pushTimeline(k, evt.orderId, { time: t, icon: '📋', text: `Заказ создан и запланирован на слот ${evt.slotId}${tlWait}` });
          break;
        }
        case 'client_refused':
          fp?.addFeedItem('order_failed', `🙅 ${evt.orderId} — клиент отказался (ожидание ~${evt.waitMinutes}мин, шанс ${evt.acceptRate}%)`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '🙅', text: `Клиент отказался ждать ~${evt.waitMinutes}мин до слота ${evt.slotId} (вероятность ${evt.acceptRate}%)` });
          break;
        case 'order_activated':
          fp?.addFeedItem('order_assigned', `🚀 ${evt.orderId} — передан на кухню`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '🚀', text: `Слот начался — заказ передан на кухню` });
          break;
        case 'order_failed':
          fp?.addFeedItem('order_failed', `${evt.orderId} — ${evt.reason === 'NO_AVAILABLE_SLOTS' ? 'нет свободных слотов' : evt.reason}`, t, { orderId: evt.orderId });
          fp?.appendLog(`FAIL: ${evt.orderId} — ${evt.reason}`, t);
          pushTimeline(k, evt.orderId, { time: t, icon: '❌', text: `Заказ отклонён: ${evt.reason}` });
          break;
        case 'order_completed':
          fp?.addFeedItem('order_completed', `${evt.orderId} выполнен (${evt.totalPrice}₽)`, t, { orderId: evt.orderId, isLate: evt.isLate });
          pushTimeline(k, evt.orderId, { time: t, icon: evt.isLate ? '🔴' : '✅', text: evt.isLate ? `Заказ выполнен с опозданием (${_fmtSec(evt.execSec)})` : `Заказ выполнен вовремя (${_fmtSec(evt.execSec)})` });
          break;
        case 'stage_started': {
          const stLabel = stageRu[evt.stageType] || evt.stageType;
          fp?.addFeedItem('stage_started', `${evt.cookName}: ${evt.dishName} [${evt.stageType}] (${evt.orderId})`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '👨‍🍳', text: `${evt.cookName} приступил к ${stLabel}: ${evt.dishName}`, stage: evt.stageType, action: 'start', cook: evt.cookName, stationName: evt.stationName || '' });
          break;
        }
        case 'stage_done': {
          const sdLabel = stageRu[evt.stageType] || evt.stageType;
          fp?.addFeedItem('stage_done', `${evt.cookName}: ${evt.dishName} [${evt.stageType}] завершён (${evt.orderId})`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '✔️', text: `${evt.cookName} завершил ${sdLabel}: ${evt.dishName}`, stage: evt.stageType, action: 'end', cook: evt.cookName, stationName: evt.stationName || '' });
          break;
        }
        case 'position_done':
          fp?.addFeedItem('position_done', `${evt.dishName} полностью готово (${evt.orderId})`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '🍽️', text: `${evt.dishName} — все этапы завершены, блюдо готово` });
          break;
        case 'client_abandoned':
          fp?.addFeedItem('order_failed', `🚶 ${evt.orderId} — клиент ушёл (ожидал ${Math.round(evt.waitMinutes)}мин, ${evt.totalPrice}₽)`, t, { orderId: evt.orderId });
          pushTimeline(k, evt.orderId, { time: t, icon: '🚶', text: `Клиент не дождался и ушёл (ожидал ~${Math.round(evt.waitMinutes)}мин)` });
          break;
        case 'orders_closed':
          fp?.addFeedItem('order_failed', `🚫 Приём заказов закрыт — все слоты заполнены`, t, {});
          break;
      }
    },
    onShiftComplete: (simNow) => {
      const fp = simView?.querySelector('sim-feed-panel');
      fp?.addFeedItem('order_completed', `✅ Смена завершена — все заказы выполнены`, simNow, {});
      _getShiftReportModal()?.open(state.kitchen, state.slotsByBranch, state.branchId, simNow);
    },
    onOrderGenerated: () => {},
    getState: () => state,
    setState: (newState) => Object.assign(state, newState),
  });

  engine.setSimNow(simStartTime);
  engine.setTimeScale(state.timeScale);
  engine.setScenario(state.scenarioId);

  state.mode = 'simulation';
  const settingsEl = document.getElementById('settingsView');
  if (settingsEl) settingsEl.style.display = 'none';
  document.getElementById('simView').style.display = 'flex';
  document.getElementById('btnPlay').style.display = 'none';
  document.getElementById('btnStop').style.display = 'inline-flex';
  document.getElementById('headerSubtitle').textContent = 'Симуляция запущена';

  const sc = getScenario(state.scenarioId);
  const scLabel = document.getElementById('simScenarioLabel');
  if (scLabel) scLabel.textContent = sc.icon + ' ' + sc.label;

  if (simView?.updateComplete) {
    simView.updateComplete.then(() => {
      const fp = simView.querySelector('sim-feed-panel');
      if (fp) fp.resetFeed();
    });
  }

  engine.play();
  rafId = requestAnimationFrame(function loop(ts) {
    try { if (engine) engine.tick(ts); }
    catch (e) { console.error('[SIM ERROR]', e); }
    rafId = requestAnimationFrame(loop);
  });
}

function switchToSettings() {
  state.mode = 'settings';
  if (engine) { engine.pause(); engine = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const settingsEl2 = document.getElementById('settingsView');
  if (settingsEl2) settingsEl2.style.display = '';
  document.getElementById('simView').style.display = 'none';
  document.getElementById('btnPlay').style.display = 'inline-flex';
  document.getElementById('btnStop').style.display = 'none';
  document.getElementById('headerSubtitle').textContent = 'Настройка кухни и слотов';
  document.getElementById('btnSimResume').style.display = 'none';
  document.getElementById('btnSimPause').style.display = 'inline-flex';

  refreshSettings();
}

// ─── Init ──────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  const autoSaved = loadAutoSave();
  if (autoSaved) applyConfig(autoSaved);
  else initCapacityDefaults();

  const lastProfile = localStorage.getItem(LAST_PROFILE_KEY);
  if (lastProfile) state.activeProfileName = lastProfile;

  const settingsView = document.getElementById('settingsView');
  if (settingsView?.updateComplete) await settingsView.updateComplete;

  const dateInput = document.getElementById('slotGenDate');
  if (dateInput && !dateInput.value) dateInput.value = todayStr();

  syncFormFromState();
  refreshSettings();

  document.getElementById('btnPlay').addEventListener('click', switchToSimulation);
  document.getElementById('btnStop').addEventListener('click', switchToSettings);
  document.getElementById('btnSimPause').addEventListener('click', () => { if (engine) engine.pause(); document.getElementById('btnSimPause').style.display = 'none'; document.getElementById('btnSimResume').style.display = 'inline-flex'; });
  document.getElementById('btnSimResume').addEventListener('click', () => { if (engine) engine.play(); document.getElementById('btnSimResume').style.display = 'none'; document.getElementById('btnSimPause').style.display = 'inline-flex'; });

  const speedSlider = document.getElementById('simSpeedSlider');
  if (speedSlider) speedSlider.addEventListener('input', () => { const val = parseInt(speedSlider.value); if (engine) engine.setTimeScale(val); document.getElementById('simSpeedLabel').textContent = `x${val}`; });

  setSlotChangeHandler(doAutoSave);
  document.getElementById('btnGenerateSlots').addEventListener('click', generateSlots);

  document.getElementById('btnAddCook').addEventListener('click', () => {
    state.cooks.push({ id: 'cook-' + Date.now(), name: 'Повар ' + (state.cooks.length + 1), emoji: ['👨‍🍳', '👩‍🍳'][state.cooks.length % 2], stations: state.stations.map(s => s.id), speed: 1.0, dishTimes: {} });
    refreshSettings();
    doAutoSave();
  });

  document.getElementById('btnAddStation').addEventListener('click', () => {
    state.stations.push({ id: 'station-' + Date.now(), name: 'Новая станция', emoji: '🔧', parallelSlots: 2 });
    refreshSettings();
    doAutoSave();
  });

  document.getElementById('btnAddDish').addEventListener('click', () => {
    state.dishes.push({ id: 'dish-' + Date.now(), name: 'Новое блюдо', emoji: '🍽️', price: 300,
      station: state.stations[0]?.id || 'prep', prepTimeSec: 60,
      bakingStation: '', bakingTimeSec: 0,
      assemblyStation: '', assemblyTimeSec: 0,
      ingredients: '' });
    refreshSettings();
    doAutoSave();
  });

  document.getElementById('btnAddCombo').addEventListener('click', () => {
    state.combos.push({ id: 'combo-' + Date.now(), name: 'Новый набор', items: [] });
    refreshSettings();
    doAutoSave();
  });

  document.getElementById('btnAddOven').addEventListener('click', () => {
    state.equipment.push({
      id: 'eq-' + Date.now(),
      type: 'oven',
      name: 'Новая печь',
      emoji: '🔥',
      count: 1,
      capacityPerUnit: 4,
      station: state.stations.find(s => s.id === 'oven')?.id || '',
      linkedDishes: [],
    });
    refreshSettings();
    doAutoSave();
  });

  document.getElementById('btnAddFryer').addEventListener('click', () => {
    state.equipment.push({
      id: 'eq-' + Date.now(),
      type: 'fryer',
      name: 'Новый фритюр',
      emoji: '🍟',
      count: 1,
      capacityGrams: 3000,
      portionGrams: 300,
      station: state.stations.find(s => s.id === 'fryer')?.id || '',
      linkedDishes: [],
    });
    refreshSettings();
    doAutoSave();
  });
});
