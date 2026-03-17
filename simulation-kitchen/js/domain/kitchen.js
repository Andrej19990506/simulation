import { getDishTotalTime, getDishPrimaryStation, getCookDishTime, getDishStages } from './dishes.js';
import { getEquipmentForDish, getEquipmentCapacity } from './equipment.js';

export { getDishTotalTime, getDishPrimaryStation, getCookDishTime, getDishStages };
export { DEFAULT_STATIONS, DEFAULT_DISHES, DEFAULT_COOKS } from './defaults.js';

export const STAGE_LABELS = { prep: 'готовка', baking: 'выпекание', assembly: 'сборка' };

let _orderSeq = 0;

export function resetOrderSeq() { _orderSeq = 0; }

export function createOrder(positions, simNow) {
  _orderSeq++;
  const totalPrice = positions.reduce((s, p) => s + p.price * p.quantity, 0);

  return {
    id: `order-${_orderSeq}`,
    seq: _orderSeq,
    positions: positions.map(p => ({
      dishId: p.dishId,
      dishName: p.dishName,
      dishEmoji: p.dishEmoji,
      price: p.price,
      quantity: p.quantity,
      stages: p.stages.map((stage, idx) => ({
        type: stage.type,
        station: stage.station,
        timeSec: stage.timeSec,
        totalTimeSec: stage.timeSec * p.quantity,
        remainingSec: stage.timeSec * p.quantity,
        status: idx === 0 ? 'waiting' : 'pending',
        cookId: null,
      })),
      currentStageIdx: 0,
      status: 'active',
    })),
    load: { sumRub: totalPrice },
    totalPrice,
    status: 'active',
    slotId: null,
    deadlineSec: 900,
    isLate: false,
    execSec: 0,
    assignLog: [],
    timeline: [],
    createdAt: new Date(simNow),
    startedAt: null,
    completedAt: null,
    failReason: null,
  };
}

export function generateRandomOrder(dishes, simNow, rng = Math.random, combos = []) {
  const validCombos = combos.filter(c => c.items && c.items.length > 0);
  const comboChance = validCombos.length > 0 ? 0.15 : 0;

  if (rng() < comboChance) {
    return _generateComboOrder(validCombos, dishes, simNow, rng);
  }

  const count = 1 + Math.floor(rng() * 4);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const dish = dishes[Math.floor(rng() * dishes.length)];
    const existing = positions.find(p => p.dishId === dish.id);
    if (existing) {
      existing.quantity++;
    } else {
      positions.push({
        dishId: dish.id,
        dishName: dish.name,
        dishEmoji: dish.emoji,
        price: dish.price,
        quantity: 1,
        stages: getDishStages(dish),
      });
    }
  }
  return createOrder(positions, simNow);
}

function _generateComboOrder(combos, dishes, simNow, rng) {
  const combo = combos[Math.floor(rng() * combos.length)];
  const dishMap = new Map(dishes.map(d => [d.id, d]));
  const positions = [];

  for (const item of combo.items) {
    const dish = dishMap.get(item.dishId);
    if (!dish) continue;
    const qty = item.qty || 1;
    const existing = positions.find(p => p.dishId === dish.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      positions.push({
        dishId: dish.id,
        dishName: dish.name,
        dishEmoji: dish.emoji,
        price: dish.price,
        quantity: qty,
        stages: getDishStages(dish),
      });
    }
  }

  if (positions.length === 0) return createOrder([], simNow);

  const order = createOrder(positions, simNow);
  if (combo.price > 0) {
    order.totalPrice = combo.price;
    order.load = { sumRub: combo.price };
  }
  order.comboId = combo.id;
  order.comboName = combo.name;
  return order;
}

export function createKitchenState(config) {
  const { stations, cooks, dishes, equipment } = config;

  const equipmentState = {};
  if (equipment) {
    for (const eq of equipment) {
      equipmentState[eq.id] = {
        items: [],
        assignedCookId: null,
        capacity: getEquipmentCapacity(eq),
      };
    }
  }

  return {
    stations: stations.map(s => ({ ...s, currentLoad: 0 })),
    equipment: equipment ? [...equipment] : [],
    equipmentState,
    cooks: cooks.map(c => ({
      ...c,
      status: 'idle',
      currentOrderId: null,
      currentPositionIdx: -1,
      currentStageIdx: -1,
      cookingProgressSec: 0,
      equipmentId: null,
    })),
    dishes: [...dishes],
    scheduledOrders: [],
    activeOrders: [],
    completedOrders: [],
    failedOrders: [],
    stationQueues: {},
    stats: {
      totalOrders: 0, assignedOrders: 0, failedOrders: 0, completedOrders: 0,
      clientRefusals: 0, clientAbandoned: 0, totalRevenue: 0, totalExecSec: 0,
      lateOrders: 0, totalLateSec: 0, peakQueueSize: 0,
    },
  };
}

export function scheduleOrder(kitchen, order) {
  order.status = 'scheduled';
  kitchen.scheduledOrders.push(order);
  kitchen.stats.assignedOrders++;
}

export function activateScheduledOrders(kitchen, slotsByBranch, branchId, simNow) {
  const events = [];
  const now = new Date(simNow).getTime();
  const slots = (slotsByBranch[branchId] || []);

  const toActivate = [];
  const remaining = [];

  for (const order of kitchen.scheduledOrders) {
    const slot = slots.find(s => s.id === order.slotId);
    if (!slot) {
      toActivate.push(order);
      continue;
    }
    const slotStart = new Date(slot.startsAt).getTime();
    if (now >= slotStart) {
      toActivate.push(order);
    } else {
      remaining.push(order);
    }
  }

  kitchen.scheduledOrders = remaining;

  for (const order of toActivate) {
    _enqueueOrder(kitchen, order, simNow);
    events.push({
      type: 'order_activated',
      orderId: order.id,
      slotId: order.slotId,
      time: new Date(simNow),
    });
  }

  return events;
}

export function enqueueOrder(kitchen, order) {
  _enqueueOrder(kitchen, order, order.createdAt);
  kitchen.stats.assignedOrders++;
}

function _enqueueOrder(kitchen, order, simNow) {
  order.status = 'active';
  order.startedAt = new Date(simNow);
  kitchen.activeOrders.push(order);

  for (let posIdx = 0; posIdx < order.positions.length; posIdx++) {
    const pos = order.positions[posIdx];
    if (pos.stages.length > 0 && pos.stages[0].status === 'waiting') {
      _pushToQueue(kitchen, pos.stages[0].station, order.id, posIdx);
    }
  }

  _trackPeakQueue(kitchen);
}

export function markOrderFailed(kitchen, order, reason) {
  order.status = 'failed';
  order.failReason = reason;
  kitchen.failedOrders.push(order);
  kitchen.stats.failedOrders++;
}

function _findEquipmentForStation(kitchen, stationId) {
  return kitchen.equipment.filter(eq => eq.station === stationId);
}

function _isEquipmentStation(kitchen, stationId) {
  return kitchen.equipment.some(eq => eq.station === stationId);
}

function _getEquipmentOccupancy(kitchen, eqId) {
  const es = kitchen.equipmentState[eqId];
  if (!es) return { current: 0, capacity: 0, free: 0 };
  const current = es.items.reduce((sum, it) => sum + it.slotsUsed, 0);
  return { current, capacity: es.capacity, free: Math.max(es.capacity - current, 0) };
}

export function getEquipmentStatus(kitchen) {
  const result = {};
  for (const eq of kitchen.equipment) {
    const occ = _getEquipmentOccupancy(kitchen, eq.id);
    const es = kitchen.equipmentState[eq.id];
    result[eq.id] = {
      ...occ,
      name: eq.name,
      emoji: eq.emoji,
      assignedCookId: es ? es.assignedCookId : null,
      items: es ? es.items : [],
    };
  }
  return result;
}

function _shiftNonLinkedItem(kitchen, stationId) {
  const queue = kitchen.stationQueues[stationId];
  if (!queue || queue.length === 0) return null;
  const stationEqs = _findEquipmentForStation(kitchen, stationId);
  for (let i = 0; i < queue.length; i++) {
    const qi = queue[i];
    const o = kitchen.activeOrders.find(o => o.id === qi.orderId);
    if (!o) { queue.splice(i, 1); i--; continue; }
    const p = o.positions[qi.posIdx];
    if (!p) { queue.splice(i, 1); i--; continue; }
    const isLinked = stationEqs.some(eq => eq.linkedDishes?.includes(p.dishId));
    if (!isLinked) {
      queue.splice(i, 1);
      return qi;
    }
  }
  return null;
}

function _hasLinkedQueueItems(kitchen, stationId) {
  const queue = kitchen.stationQueues[stationId];
  if (!queue || queue.length === 0) return false;
  const stationEqs = _findEquipmentForStation(kitchen, stationId);
  return queue.some(qi => {
    const o = kitchen.activeOrders.find(o => o.id === qi.orderId);
    if (!o) return false;
    const p = o.positions[qi.posIdx];
    if (!p) return false;
    return stationEqs.some(eq => eq.linkedDishes?.includes(p.dishId));
  });
}

function _tryLoadEquipment(kitchen, cook, stationId, simNow) {
  const events = [];
  const stationEquipment = _findEquipmentForStation(kitchen, stationId);
  const queue = kitchen.stationQueues[stationId];
  if (!queue || queue.length === 0) return events;

  for (const eq of stationEquipment) {
    const es = kitchen.equipmentState[eq.id];
    if (!es) continue;

    let keepLooking = true;
    while (keepLooking && queue.length > 0) {
      keepLooking = false;
      const occ = _getEquipmentOccupancy(kitchen, eq.id);
      if (occ.free <= 0) break;

      let queueIdx = -1;
      for (let i = 0; i < queue.length; i++) {
        const qi = queue[i];
        const order = kitchen.activeOrders.find(o => o.id === qi.orderId);
        if (!order) { queue.splice(i, 1); i--; continue; }
        const pos = order.positions[qi.posIdx];
        if (!pos) { queue.splice(i, 1); i--; continue; }
        const stage = pos.stages[pos.currentStageIdx];
        if (!stage || stage.status !== 'waiting') { queue.splice(i, 1); i--; continue; }
        if (eq.linkedDishes?.includes(pos.dishId)) {
          queueIdx = i;
          break;
        }
      }

      if (queueIdx === -1) break;

      const queueItem = queue[queueIdx];
      const order = kitchen.activeOrders.find(o => o.id === queueItem.orderId);
      const pos = order.positions[queueItem.posIdx];
      const stage = pos.stages[pos.currentStageIdx];
      const slotsNeeded = pos.quantity;

      if (slotsNeeded <= occ.free) {
        queue.splice(queueIdx, 1);
        const speedFactor = cook.speed || 1.0;
        const itemTimeSec = Math.round(stage.timeSec * speedFactor);

        es.items.push({
          orderId: order.id,
          posIdx: queueItem.posIdx,
          stageIdx: pos.currentStageIdx,
          dishId: pos.dishId,
          dishName: pos.dishName,
          dishEmoji: pos.dishEmoji,
          slotsUsed: slotsNeeded,
          remainingSec: itemTimeSec,
          totalTimeSec: itemTimeSec,
        });

        stage.totalTimeSec = itemTimeSec;
        stage.remainingSec = itemTimeSec;
        stage.status = 'active';
        stage.cookId = cook.id;

        es.assignedCookId = cook.id;

        events.push({
          type: 'stage_started',
          cookId: cook.id,
          cookName: cook.name,
          orderId: order.id,
          dishName: pos.dishName,
          stageType: stage.type,
          time: new Date(simNow),
        });

        keepLooking = true;
      } else {
        break;
      }
    }
  }
  return events;
}

export function tryAssignCooks(kitchen, simNow) {
  const events = [];

  for (const cook of kitchen.cooks) {
    if (cook.status === 'busy' && cook.equipmentId) {
      const eq = kitchen.equipment.find(e => e.id === cook.equipmentId);
      if (eq) {
        events.push(..._tryLoadEquipment(kitchen, cook, eq.station, simNow));
      }
      continue;
    }

    if (cook.status !== 'idle') continue;

    let found = null;
    let isEquipment = false;
    for (const stationId of cook.stations) {
      const queue = kitchen.stationQueues[stationId];
      if (!queue || queue.length === 0) continue;

      if (_isEquipmentStation(kitchen, stationId)) {
        if (_hasLinkedQueueItems(kitchen, stationId)) {
          isEquipment = true;
          found = { stationId };
          break;
        }
        const nonLinked = _shiftNonLinkedItem(kitchen, stationId);
        if (nonLinked) {
          found = { stationId, ...nonLinked };
          break;
        }
        continue;
      }

      found = { stationId, ...queue.shift() };
      break;
    }
    if (!found) continue;

    if (isEquipment) {
      cook.status = 'busy';
      cook.currentOrderId = null;
      cook.currentPositionIdx = -1;
      cook.currentStageIdx = -1;
      cook.cookingProgressSec = 0;

      const stationEqs = _findEquipmentForStation(kitchen, found.stationId);
      if (stationEqs.length > 0) {
        cook.equipmentId = stationEqs[0].id;
        const es = kitchen.equipmentState[stationEqs[0].id];
        if (es) es.assignedCookId = cook.id;
      }

      events.push(..._tryLoadEquipment(kitchen, cook, found.stationId, simNow));
      continue;
    }

    const order = kitchen.activeOrders.find(o => o.id === found.orderId);
    if (!order) continue;

    const pos = order.positions[found.posIdx];
    if (!pos) continue;

    const stage = pos.stages[pos.currentStageIdx];
    if (!stage || stage.status !== 'waiting') continue;

    const speedFactor = cook.speed || 1.0;
    stage.totalTimeSec = Math.round(stage.timeSec * pos.quantity * speedFactor);
    stage.remainingSec = stage.totalTimeSec;
    stage.status = 'active';
    stage.cookId = cook.id;

    cook.status = 'busy';
    cook.currentOrderId = order.id;
    cook.currentPositionIdx = found.posIdx;
    cook.currentStageIdx = pos.currentStageIdx;
    cook.cookingProgressSec = 0;
    cook.equipmentId = null;

    events.push({
      type: 'stage_started',
      cookId: cook.id,
      cookName: cook.name,
      orderId: order.id,
      dishName: pos.dishName,
      stageType: stage.type,
      time: new Date(simNow),
    });
  }

  return events;
}

export function tickKitchen(kitchen, deltaSimSec, simNow) {
  const events = [];

  events.push(..._tickEquipment(kitchen, deltaSimSec, simNow));

  for (const cook of kitchen.cooks) {
    if (cook.status !== 'busy') continue;
    if (cook.equipmentId) continue;

    const order = kitchen.activeOrders.find(o => o.id === cook.currentOrderId);
    if (!order) { _freeCook(cook, kitchen); continue; }

    const posIdx = cook.currentPositionIdx;
    const pos = order.positions[posIdx];
    if (!pos) { _freeCook(cook, kitchen); continue; }

    const stageIdx = cook.currentStageIdx;
    const stage = pos.stages[stageIdx];
    if (!stage || stage.status !== 'active') { _freeCook(cook, kitchen); continue; }

    stage.remainingSec -= deltaSimSec;

    if (stage.remainingSec <= 0) {
      stage.remainingSec = 0;
      stage.status = 'done';
      _freeCook(cook, kitchen);

      events.push({
        type: 'stage_done',
        cookName: cook.name,
        orderId: order.id,
        dishName: pos.dishName,
        stageType: stage.type,
        time: new Date(simNow),
      });

      _advancePosition(kitchen, order, pos, stageIdx, posIdx, simNow, events);
    }
  }

  events.push(...tryAssignCooks(kitchen, simNow));
  _updateStationLoad(kitchen);
  return events;
}

function _tickEquipment(kitchen, deltaSimSec, simNow) {
  const events = [];

  for (const eq of kitchen.equipment) {
    const es = kitchen.equipmentState[eq.id];
    if (!es || es.items.length === 0) continue;

    const cook = kitchen.cooks.find(c => c.id === es.assignedCookId);
    const cookName = cook ? cook.name : '?';

    const completedItems = [];

    for (const item of es.items) {
      item.remainingSec -= deltaSimSec;
      if (item.remainingSec <= 0) {
        item.remainingSec = 0;
        completedItems.push(item);
      }
    }

    for (const item of completedItems) {
      es.items = es.items.filter(i => i !== item);

      const order = kitchen.activeOrders.find(o => o.id === item.orderId);
      if (!order) continue;

      const pos = order.positions[item.posIdx];
      if (!pos) continue;

      const stage = pos.stages[item.stageIdx];
      if (!stage) continue;

      stage.remainingSec = 0;
      stage.status = 'done';

      events.push({
        type: 'stage_done',
        cookName,
        orderId: order.id,
        dishName: pos.dishName,
        stageType: stage.type,
        time: new Date(simNow),
      });

      _advancePosition(kitchen, order, pos, item.stageIdx, item.posIdx, simNow, events);
    }

    if (es.items.length === 0) {
      const hasLinked = _hasLinkedQueueItems(kitchen, eq.station);
      if (!hasLinked && cook) {
        _freeCook(cook, kitchen);
        es.assignedCookId = null;
      }
    }
  }

  return events;
}

function _advancePosition(kitchen, order, pos, stageIdx, posIdx, simNow, events) {
  const nextIdx = stageIdx + 1;
  if (nextIdx < pos.stages.length) {
    pos.currentStageIdx = nextIdx;
    pos.stages[nextIdx].status = 'waiting';
    _pushToQueue(kitchen, pos.stages[nextIdx].station, order.id, posIdx);
  } else {
    pos.status = 'done';
    events.push({
      type: 'position_done',
      orderId: order.id,
      dishName: pos.dishName,
      time: new Date(simNow),
    });

    if (order.positions.every(p => p.status === 'done')) {
      _completeOrder(kitchen, order, simNow, events);
    }
  }
}

function _freeCook(cook, kitchen) {
  if (cook.equipmentId) {
    const es = kitchen.equipmentState[cook.equipmentId];
    if (es) es.assignedCookId = null;
  }
  cook.status = 'idle';
  cook.currentOrderId = null;
  cook.currentPositionIdx = -1;
  cook.currentStageIdx = -1;
  cook.cookingProgressSec = 0;
  cook.equipmentId = null;
}

function _completeOrder(kitchen, order, simNow, events) {
  order.status = 'completed';
  order.completedAt = new Date(simNow);

  const baseTime = order.startedAt || order.createdAt;
  const cookingSec = (order.completedAt - baseTime) / 1000;
  order.execSec = cookingSec;
  order.isLate = cookingSec > order.deadlineSec;

  const idx = kitchen.activeOrders.indexOf(order);
  if (idx >= 0) kitchen.activeOrders.splice(idx, 1);
  kitchen.completedOrders.push(order);

  kitchen.stats.completedOrders++;
  kitchen.stats.totalRevenue += order.totalPrice;
  kitchen.stats.totalExecSec += cookingSec;
  if (order.isLate) {
    kitchen.stats.lateOrders++;
    kitchen.stats.totalLateSec += cookingSec - order.deadlineSec;
  }

  events.push({
    type: 'order_completed',
    orderId: order.id,
    totalPrice: order.totalPrice,
    isLate: order.isLate,
    execSec: Math.round(cookingSec),
    time: new Date(simNow),
  });
}

function _pushToQueue(kitchen, stationId, orderId, posIdx) {
  if (!kitchen.stationQueues[stationId]) {
    kitchen.stationQueues[stationId] = [];
  }
  kitchen.stationQueues[stationId].push({ orderId, posIdx });
}

function _trackPeakQueue(kitchen) {
  let total = 0;
  for (const q of Object.values(kitchen.stationQueues)) {
    total += q.length;
  }
  if (total > kitchen.stats.peakQueueSize) {
    kitchen.stats.peakQueueSize = total;
  }
}

function _updateStationLoad(kitchen) {
  for (const station of kitchen.stations) station.currentLoad = 0;
  for (const order of kitchen.activeOrders) {
    for (const pos of order.positions) {
      for (const stage of pos.stages) {
        if (stage.status === 'active') {
          const station = kitchen.stations.find(s => s.id === stage.station);
          if (station) station.currentLoad++;
        }
      }
    }
  }
}

export function getKitchenStats(kitchen) {
  const s = kitchen.stats;
  const avgExecSec = s.completedOrders > 0 ? s.totalExecSec / s.completedOrders : 0;
  const slotAssigned = s.totalOrders - s.failedOrders;
  const successRate = s.totalOrders > 0 ? Math.round((slotAssigned / s.totalOrders) * 100) : 0;
  const onTimeRate = s.completedOrders > 0
    ? Math.round(((s.completedOrders - s.lateOrders) / s.completedOrders) * 100) : 100;

  let queueLength = 0;
  for (const q of Object.values(kitchen.stationQueues || {})) {
    queueLength += q.length;
  }

  return {
    ...s, slotAssigned, avgExecSec, successRate, onTimeRate,
    queueLength,
    scheduledCount: (kitchen.scheduledOrders || []).length,
    activeCooks: kitchen.cooks.filter(c => c.status === 'busy').length,
    idleCooks: kitchen.cooks.filter(c => c.status === 'idle').length,
  };
}

/**
 * Estimate how many seconds each queued order will wait before completion.
 * Returns Map<orderId, etaSec>.
 */
export function estimateQueueETAs(kitchen) {
  const etas = {};

  const stationThroughput = {};
  for (const st of kitchen.stations) {
    const workers = kitchen.cooks.filter(
      c => c.stations.includes(st.id)
    ).length || 1;

    const eqs = kitchen.equipment.filter(eq => eq.station === st.id);
    let eqCapacity = 0;
    for (const eq of eqs) {
      eqCapacity += getEquipmentCapacity(eq);
    }

    stationThroughput[st.id] = { workers, eqCapacity, isEquipment: eqs.length > 0 };
  }

  for (const [stationId, queue] of Object.entries(kitchen.stationQueues)) {
    if (!queue || queue.length === 0) continue;
    const tp = stationThroughput[stationId];
    if (!tp) continue;

    let cumulativeSec = 0;

    if (tp.isEquipment && tp.eqCapacity > 0) {
      let batchTimeSec = 0;
      let batchSlots = 0;

      for (const item of queue) {
        const order = kitchen.activeOrders.find(o => o.id === item.orderId);
        if (!order) continue;
        const pos = order.positions[item.posIdx];
        if (!pos) continue;
        const stage = pos.stages[pos.currentStageIdx];
        if (!stage) continue;

        const slots = pos.quantity || 1;
        if (batchSlots + slots > tp.eqCapacity) {
          cumulativeSec += batchTimeSec;
          batchTimeSec = 0;
          batchSlots = 0;
        }
        batchSlots += slots;
        batchTimeSec = Math.max(batchTimeSec, stage.timeSec * (pos.quantity || 1));

        const etaHere = cumulativeSec + batchTimeSec;
        if (!etas[order.id] || etas[order.id] < etaHere) {
          etas[order.id] = Math.round(etaHere);
        }
      }
    } else {
      const parallel = Math.max(1, tp.workers);
      const lanes = Array(parallel).fill(0);

      for (const item of queue) {
        const order = kitchen.activeOrders.find(o => o.id === item.orderId);
        if (!order) continue;
        const pos = order.positions[item.posIdx];
        if (!pos) continue;
        const stage = pos.stages[pos.currentStageIdx];
        if (!stage) continue;

        const jobSec = stage.timeSec * (pos.quantity || 1);
        const minLane = lanes.indexOf(Math.min(...lanes));
        lanes[minLane] += jobSec;

        const etaHere = lanes[minLane];
        if (!etas[order.id] || etas[order.id] < etaHere) {
          etas[order.id] = Math.round(etaHere);
        }
      }
    }
  }

  return etas;
}

/**
 * Remove an order that a client abandoned after initially accepting.
 * Cleans up from queues, activeOrders, scheduledOrders.
 */
export function abandonOrder(kitchen, order, simNow) {
  order.status = 'abandoned';
  order.failReason = 'CLIENT_ABANDONED';
  order.completedAt = new Date(simNow);

  for (const [, queue] of Object.entries(kitchen.stationQueues)) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].orderId === order.id) queue.splice(i, 1);
    }
  }

  let idx = kitchen.activeOrders.indexOf(order);
  if (idx >= 0) kitchen.activeOrders.splice(idx, 1);
  idx = kitchen.scheduledOrders.indexOf(order);
  if (idx >= 0) kitchen.scheduledOrders.splice(idx, 1);

  kitchen.failedOrders.push(order);
  kitchen.stats.clientAbandoned = (kitchen.stats.clientAbandoned || 0) + 1;
}

export function pushTimeline(kitchen, orderId, entry) {
  const order = [...kitchen.scheduledOrders, ...kitchen.activeOrders, ...kitchen.completedOrders, ...kitchen.failedOrders]
    .find(o => o.id === orderId);
  if (order && order.timeline) order.timeline.push(entry);
}

export function getAllOrders(kitchen) {
  return [...(kitchen.scheduledOrders || []), ...kitchen.activeOrders, ...kitchen.completedOrders, ...kitchen.failedOrders];
}

export function getOrdersBySlot(kitchen, slotId) {
  return getAllOrders(kitchen).filter(o => o.slotId === slotId);
}
