import { getScenario } from './config.js';
import { getProfile, getLambdaForTime } from './orderProfiles.js';
import {
  generateRandomOrder,
  scheduleOrder,
  activateScheduledOrders,
  tryAssignCooks,
  tickKitchen,
  markOrderFailed,
  abandonOrder,
  estimateQueueETAs,
} from '../domain/kitchen.js';
import { firstFitAssign } from '../domain/slotModel.js';

/**
 * Customer patience model.
 * halfLife = 40min → at 40 min wait, 50% accept.
 * 0min→100%, 5min→92%, 10min→84%, 15min→77%,
 * 20min→71%, 30min→59%, 40min→50%, 60min→35%,
 * 90min→21%, 120min→12%, min floor 5%.
 */
export function clientAcceptRate(waitMinutes) {
  if (waitMinutes <= 0) return 1;
  const halfLife = 40;
  return Math.max(0.05, Math.pow(0.5, waitMinutes / halfLife));
}

/**
 * Post-acceptance patience model.
 * Returns per-second hazard rate (probability of abandoning in the next second).
 * Grace period = order deadline (15min). After that, rate grows exponentially.
 * ~0.1%/min at +1min overdue, doubles every 10 min overdue.
 */
function abandonmentHazardPerSec(waitingSec, deadlineSec = 900) {
  if (waitingSec <= deadlineSec) return 0;
  const overtimeMin = (waitingSec - deadlineSec) / 60;
  const ratePerMin = 0.001 * Math.pow(2, overtimeMin / 10);
  return Math.min(ratePerMin / 60, 0.01);
}

export class SimulationEngine {
  constructor({ onTick, onEvent, onOrderGenerated, onShiftComplete, getState, setState }) {
    this.onTick = onTick;
    this.onEvent = onEvent;
    this.onOrderGenerated = onOrderGenerated;
    this.onShiftComplete = onShiftComplete;
    this.getState = getState;
    this.setState = setState;

    this.running = false;
    this.simNow = new Date();
    this.timeScale = 60;
    this.lastRealTs = null;
    this.currentScenarioId = 'lunch_rush';
    this.totalSimElapsed = 0;
    this.ordersClosed = false;
    this.shiftEnded = false;
  }

  setScenario(id) {
    const scenario = getScenario(id);
    this.timeScale = scenario.timeScale;
    this.currentScenarioId = id;
    return scenario;
  }

  setSimNow(date) {
    this.simNow = new Date(date);
  }

  setTimeScale(scale) {
    this.timeScale = Math.max(1, Math.min(3600, scale));
  }

  reset() {
    this.running = false;
    this.lastRealTs = null;
    this.totalSimElapsed = 0;
    this.ordersClosed = false;
    this.shiftEnded = false;
  }

  tick(realNow) {
    if (!this.running) return;
    if (!this.lastRealTs) {
      this.lastRealTs = realNow;
      return;
    }

    const deltaRealMs = Math.min(realNow - this.lastRealTs, 100);
    this.lastRealTs = realNow;
    const deltaSimMs = deltaRealMs * this.timeScale;
    const deltaSimSec = deltaSimMs / 1000;

    this.simNow = new Date(this.simNow.getTime() + deltaSimMs);
    this.totalSimElapsed += deltaSimMs;

    const state = this.getState();
    if (!state) return;

    if (!this.ordersClosed) {
      this._generateOrders(state, deltaSimMs);
    }

    const activateEvents = activateScheduledOrders(
      state.kitchen,
      state.slotsByBranch,
      state.branchId || 'branch-1',
      this.simNow,
    );
    for (const evt of activateEvents) {
      if (this.onEvent) this.onEvent(evt);
    }

    const kitchenEvents = tickKitchen(state.kitchen, deltaSimSec, this.simNow);

    for (const evt of kitchenEvents) {
      if (this.onEvent) this.onEvent(evt);
    }

    this._checkAbandonments(state, deltaSimSec);

    if (this.ordersClosed && !this.shiftEnded) {
      const k = state.kitchen;
      const pending = k.activeOrders.length + k.scheduledOrders.length;
      if (pending === 0) {
        this.shiftEnded = true;
        if (this.onShiftComplete) {
          this.onShiftComplete(this.simNow);
        }
      }
    }

    if (this.onTick) {
      this.onTick(this.simNow, {
        timeScale: this.timeScale,
        totalSimElapsed: this.totalSimElapsed,
        ordersClosed: this.ordersClosed,
      });
    }
  }

  _generateOrders(state, deltaSimMs) {
    const scenario = getScenario(this.currentScenarioId);
    const profile = getProfile(this.currentScenarioId);
    if (!profile) return;

    const lambdaPerHour = getLambdaForTime(profile, this.simNow);
    if (lambdaPerHour <= 0) return;

    const lambdaPerMs = lambdaPerHour / (3600 * 1000);
    const expected = lambdaPerMs * deltaSimMs;

    let ordersToGenerate = 0;
    if (expected < 1) {
      if (Math.random() < expected) ordersToGenerate = 1;
    } else {
      ordersToGenerate = Math.floor(expected);
      if (Math.random() < (expected - ordersToGenerate)) ordersToGenerate++;
    }

    for (let i = 0; i < ordersToGenerate; i++) {
      const order = generateRandomOrder(
        state.kitchen.dishes,
        this.simNow,
        Math.random,
        state.combos || [],
      );

      const branchId = state.branchId || 'branch-1';
      const minPrepMs = (state.minPrepMinutes || 0) * 60 * 1000;
      const maxSlots = state.maxSlotsToCheck || 50;

      const result = firstFitAssign({
        state: state.slotsByBranch,
        branchId,
        orderId: order.id,
        visibleAt: new Date(this.simNow),
        load: order.load,
        minPrepMs,
        maxSlots,
        now: new Date(this.simNow),
        logFn: null,
      });

      state.kitchen.stats.totalOrders++;
      order.assignLog = result.assignLog || [];

      if (result.success) {
        const slotStartMs = new Date(result.slot.startsAt).getTime();
        const nowMs = this.simNow.getTime();
        const waitMs = Math.max(0, slotStartMs - nowMs);
        const waitMin = waitMs / 60000;
        const acceptRate = clientAcceptRate(waitMin);

        if (waitMin > 1 && Math.random() > acceptRate) {
          state.kitchen.stats.clientRefusals++;
          order.slotId = result.slot.id;
          markOrderFailed(state.kitchen, order, 'CLIENT_REFUSED');
          order.waitMinutes = Math.round(waitMin * 10) / 10;
          order.acceptRate = Math.round(acceptRate * 100);

          if (this.onEvent) {
            this.onEvent({
              type: 'client_refused',
              orderId: order.id,
              slotId: result.slot.id,
              waitMinutes: order.waitMinutes,
              acceptRate: order.acceptRate,
              totalPrice: order.totalPrice,
              time: new Date(this.simNow),
            });
          }
        } else {
          state.slotsByBranch = result.state;
          order.slotId = result.slot.id;
          if (waitMin > 0) order.waitMinutes = Math.round(waitMin * 10) / 10;
          scheduleOrder(state.kitchen, order);

          if (this.onEvent) {
            this.onEvent({
              type: 'order_assigned',
              orderId: order.id,
              slotId: result.slot.id,
              totalPrice: order.totalPrice,
              positionCount: order.positions.length,
              waitMinutes: waitMin > 1 ? Math.round(waitMin * 10) / 10 : 0,
              comboName: order.comboName || null,
              time: new Date(this.simNow),
            });
          }
        }
      } else {
        markOrderFailed(state.kitchen, order, result.error);
        if (this.onEvent) {
          this.onEvent({
            type: 'order_failed',
            orderId: order.id,
            reason: result.error,
            time: new Date(this.simNow),
          });
        }
        if (result.error === 'NO_AVAILABLE_SLOTS') {
          this.ordersClosed = true;
          if (this.onEvent) {
            this.onEvent({
              type: 'orders_closed',
              time: new Date(this.simNow),
            });
          }
          break;
        }
      }

      if (this.onOrderGenerated) {
        this.onOrderGenerated(order);
      }
    }
  }

  _checkAbandonments(state, deltaSimSec) {
    const k = state.kitchen;
    const nowMs = this.simNow.getTime();
    const toAbandon = [];

    const checkList = [...k.activeOrders, ...k.scheduledOrders];

    for (const order of checkList) {
      if (order.status !== 'active' && order.status !== 'scheduled') continue;

      const waitingSec = (nowMs - new Date(order.createdAt).getTime()) / 1000;
      const hazard = abandonmentHazardPerSec(waitingSec, order.deadlineSec || 900);
      if (hazard <= 0) continue;

      const hasActiveStage = order.positions.some(p =>
        p.stages.some(s => s.status === 'active')
      );
      if (hasActiveStage) continue;

      const pAbandon = 1 - Math.exp(-hazard * deltaSimSec);
      if (Math.random() < pAbandon) {
        toAbandon.push(order);
      }
    }

    for (const order of toAbandon) {
      const waitingSec = (nowMs - new Date(order.createdAt).getTime()) / 1000;
      abandonOrder(k, order, this.simNow);

      if (this.onEvent) {
        this.onEvent({
          type: 'client_abandoned',
          orderId: order.id,
          waitMinutes: Math.round(waitingSec / 60 * 10) / 10,
          totalPrice: order.totalPrice,
          time: new Date(this.simNow),
        });
      }
    }
  }

  getSimNow() {
    return new Date(this.simNow);
  }

  play() {
    this.running = true;
    this.lastRealTs = performance.now();
  }

  pause() {
    this.running = false;
    this.lastRealTs = null;
  }
}
