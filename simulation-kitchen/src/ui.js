/**
 * UI: лог, чтение/запись форм, отрисовка списков слотов и состояния, обработчики кнопок.
 */

import { getSlotsByBranch, setSlotsByBranch, getSlotsForBranch, getSimNow, setSimNow } from "./state.js";
import { assignSlotFirstFit } from "./engine.js";

const LOG_ID = "log";
const BRANCH_ID_INPUT = "branchId";
const SLOTS_LIST_ID = "slotsList";
const STATE_VIEW_ID = "stateView";
const SLOTS_CONFIG_ID = "slotsConfig";
const ORDER_LOAD_ID = "orderLoad";
const SIM_TIME_ID = "simTime";
const ORDER_ID_INPUT = "orderId";
const VISIBLE_AT_INPUT = "visibleAt";
const MIN_PREP_INPUT = "minPrep";
const MAX_SLOTS_INPUT = "maxSlots";

export function log(msg) {
  const el = document.getElementById(LOG_ID);
  if (!el) return;
  const ts = new Date().toISOString();
  el.textContent += `[${ts}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function parseJSON(id) {
  const el = document.getElementById(id);
  if (!el) return {};
  try {
    return JSON.parse(el.value);
  } catch (e) {
    alert("Ошибка парсинга JSON в " + id + ": " + e.message);
    throw e;
  }
}

function getBranchId() {
  const el = document.getElementById(BRANCH_ID_INPUT);
  return (el && el.value) || "branch-1";
}

export function renderSlotsList() {
  const listEl = document.getElementById(SLOTS_LIST_ID);
  if (!listEl) return;
  listEl.innerHTML = "";
  const slots = getSlotsForBranch(getBranchId());
  slots.forEach((s) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const left = document.createElement("span");
    left.className = "left";
    const title = document.createElement("span");
    title.textContent = `${s.id} · v${s.version || 0}`;
    const sub = document.createElement("small");
    sub.textContent =
      new Date(s.startsAt).toLocaleTimeString() +
      " - " +
      new Date(s.endsAt).toLocaleTimeString();
    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement("span");
    const statusSpan = document.createElement("span");
    const usedOrders = (s.used && s.used.orders) || 0;
    const capOrders = (s.capacity && s.capacity.orders) || 0;
    const ratio = capOrders > 0 ? usedOrders / capOrders : 0;
    const status = ratio >= 1 ? "full" : "open";
    statusSpan.className = "chip status-" + status;
    statusSpan.textContent = status;
    right.appendChild(statusSpan);

    div.appendChild(left);
    div.appendChild(right);
    listEl.appendChild(div);
  });
}

export function renderState() {
  const stateEl = document.getElementById(STATE_VIEW_ID);
  if (!stateEl) return;
  stateEl.innerHTML = "";
  const slots = getSlotsForBranch(getBranchId());
  slots.forEach((s) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const left = document.createElement("span");
    left.className = "left";
    const title = document.createElement("span");
    title.textContent = `${s.id} · v${s.version || 0}`;
    const sub = document.createElement("small");
    sub.textContent =
      "Used: " +
      JSON.stringify(s.used || {}) +
      " / Capacity: " +
      JSON.stringify(s.capacity || {});
    left.appendChild(title);
    left.appendChild(sub);
    div.appendChild(left);
    stateEl.appendChild(div);
  });
}

function applyConfig() {
  const slotsConfig = parseJSON(SLOTS_CONFIG_ID);
  setSlotsByBranch(slotsConfig);
  renderSlotsList();
  renderState();
  log("Конфиг слотов обновлён.");
}

function updateSimTimeToNow() {
  setSimNow(new Date());
  const input = document.getElementById(SIM_TIME_ID);
  if (input) {
    input.value = getSimNow().toISOString().slice(0, 16);
  }
  log("Симулируемое время установлено на now().");
}

function readSimNow() {
  const input = document.getElementById(SIM_TIME_ID);
  if (input && input.value) {
    setSimNow(new Date(input.value));
  }
  return getSimNow();
}

function handleAssignClick() {
  const branchId = getBranchId();
  const slots = getSlotsForBranch(branchId);
  if (!slots.length) {
    log(`Нет слотов для филиала ${branchId}.`);
    alert("Нет слотов для филиала");
    return;
  }

  const orderIdEl = document.getElementById(ORDER_ID_INPUT);
  const orderId =
    (orderIdEl && orderIdEl.value) ||
    "order-" + Math.random().toString(16).slice(2, 8);
  const visibleAtEl = document.getElementById(VISIBLE_AT_INPUT);
  const visibleAtInput = visibleAtEl ? visibleAtEl.value : "";
  const visibleAt = visibleAtInput
    ? new Date(visibleAtInput)
    : new Date(readSimNow());

  const load = parseJSON(ORDER_LOAD_ID);
  const minPrepEl = document.getElementById(MIN_PREP_INPUT);
  const minPrepMinutes = parseInt((minPrepEl && minPrepEl.value) || "0", 10);
  const minPrepMs = minPrepMinutes * 60 * 1000;
  const maxSlotsEl = document.getElementById(MAX_SLOTS_INPUT);
  const maxSlots = parseInt((maxSlotsEl && maxSlotsEl.value) || "50", 10);

  const now = readSimNow();

  log(
    `AssignSlot(${orderId}) — branch=${branchId}, from=${now.toISOString()}, load=${JSON.stringify(load)}`
  );

  const result = assignSlotFirstFit({
    slots,
    orderId,
    load,
    visibleAt,
    now,
    minPrepMs,
    maxSlotsToCheck: maxSlots
  });

  if (result) {
    log(
      `  slot=${result.slot.id}: выбран, версия ${(result.slot.version || 1) - 1}→${result.slot.version}, used=${JSON.stringify(result.slot.used)}`
    );
    renderSlotsList();
    renderState();
    log(
      `Назначение: order=${result.orderId}, slot=${result.slot.id}, visibleAt=${visibleAt.toISOString()}`
    );
  } else {
    log("AssignSlot: подходящих слотов не найдено (ErrNoAvailableSlots).");
    alert("Нет доступных слотов для этого заказа");
  }
}

function bindButtons() {
  const btnApply = document.getElementById("btnApplyConfig");
  if (btnApply) btnApply.addEventListener("click", applyConfig);

  const btnAssign = document.getElementById("btnAssign");
  if (btnAssign) btnAssign.addEventListener("click", handleAssignClick);

  const btnNow = document.getElementById("btnNow");
  if (btnNow) btnNow.addEventListener("click", updateSimTimeToNow);

  const btnClearLog = document.getElementById("btnClearLog");
  if (btnClearLog) {
    btnClearLog.addEventListener("click", () => {
      const el = document.getElementById(LOG_ID);
      if (el) el.textContent = "";
    });
  }
}

/**
 * Инициализация UI: время "сейчас", применение конфига из форм, привязка кнопок.
 */
export function initUI() {
  updateSimTimeToNow();
  applyConfig();
  bindButtons();
  log("Симуляция запущена.");
}
