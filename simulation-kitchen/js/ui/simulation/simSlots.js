import { getBranchSlots } from '../../domain/slotModel.js';
import { getOrdersBySlot } from '../../domain/kitchen.js';
import { formatTime } from '../helpers.js';

let _expandedSlotId = null;
let _onOrderClick = null;

export function setSlotOrderClickHandler(fn) { _onOrderClick = fn; }

export function renderSimSlots(slotsByBranch, branchId, simNow, kitchen) {
  const el = document.getElementById('simSlotTimeline');
  if (!el) return;

  const slots = getBranchSlots(slotsByBranch, branchId);
  const now = new Date(simNow).getTime();

  const existing = el.querySelectorAll('.slot-bar');
  const existingMap = {};
  existing.forEach(e => { existingMap[e.dataset.id] = e; });

  const newIds = new Set(slots.map(s => s.id));
  existing.forEach(e => { if (!newIds.has(e.dataset.id)) e.remove(); });

  slots.forEach(s => {
    let bar = existingMap[s.id];
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'slot-bar';
      bar.dataset.id = s.id;
      bar.innerHTML = `
        <div class="slot-bar-fill"></div>
        <div class="slot-bar-content">
          <div class="slot-bar-time"></div>
          <div class="slot-bar-info">
            <span class="slot-bar-detail"></span>
            <span class="slot-bar-pct"></span>
          </div>
        </div>
        <div class="slot-bar-expand"></div>`;
      bar.addEventListener('click', (e) => {
        if (e.target.closest('.slot-order-row')) return;
        _expandedSlotId = _expandedSlotId === s.id ? null : s.id;
        _refreshExpand(el, kitchen, simNow);
      });
      el.appendChild(bar);
    }

    const startMs = new Date(s.startsAt).getTime();
    const endMs = new Date(s.endsAt).getTime();
    bar.classList.toggle('active', now >= startMs && now < endMs);
    bar.classList.toggle('expanded', _expandedSlotId === s.id);
    bar.classList.toggle('slot-paused', !!s.paused);

    const cap = s.capacity || {};
    const used = s.used || {};
    let maxPct = 0;
    let isFull = false;
    const capEntries = Object.entries(cap);
    for (const [key, capVal] of capEntries) {
      if (capVal <= 0) continue;
      const pct = ((used[key] || 0) / capVal) * 100;
      if (pct > maxPct) maxPct = pct;
      if ((used[key] || 0) >= capVal) isFull = true;
    }

    bar.classList.toggle('full', isFull);
    bar.querySelector('.slot-bar-fill').style.width = Math.min(maxPct, 100) + '%';
    bar.querySelector('.slot-bar-time').textContent = `${formatTime(s.startsAt)} — ${formatTime(s.endsAt)}`;
    const usedSum = used.sumRub || 0;
    const capSum = cap.sumRub || 0;
    bar.querySelector('.slot-bar-detail').textContent = capSum > 0
      ? `${usedSum.toLocaleString()}₽ / ${capSum.toLocaleString()}₽`
      : capEntries.map(([k, v]) => `${k}: ${used[k] || 0}/${v}`).join(' · ');

    const pctEl = bar.querySelector('.slot-bar-pct');
    pctEl.textContent = Math.round(maxPct) + '%';
    pctEl.className = 'slot-bar-pct ' + (maxPct >= 90 ? 'high' : maxPct >= 50 ? 'mid' : 'low');

    const expandEl = bar.querySelector('.slot-bar-expand');
    if (_expandedSlotId === s.id && kitchen) {
      _renderSlotOrders(expandEl, kitchen, s, simNow);
    } else {
      expandEl.innerHTML = '';
    }
  });
}

function _refreshExpand(container, kitchen, simNow) {
  container.querySelectorAll('.slot-bar').forEach(bar => {
    const expandEl = bar.querySelector('.slot-bar-expand');
    const isExpanded = bar.dataset.id === _expandedSlotId;
    bar.classList.toggle('expanded', isExpanded);
    if (isExpanded && kitchen) {
      const slots = Array.from(container.querySelectorAll('.slot-bar'));
      const slot = { id: bar.dataset.id };
      _renderSlotOrders(expandEl, kitchen, slot, simNow);
    } else {
      expandEl.innerHTML = '';
    }
  });
}

function _renderSlotOrders(expandEl, kitchen, slot, simNow) {
  const orders = getOrdersBySlot(kitchen, slot.id);
  if (orders.length === 0) {
    expandEl.innerHTML = '<div class="slot-no-orders">Нет заказов</div>';
    return;
  }

  const now = new Date(simNow).getTime();
  let html = '<div class="slot-orders-list">';
  for (const order of orders) {
    const dishes = order.positions.map(p => p.dishEmoji).join('');
    let statusBadge;
    if (order.status === 'completed') {
      statusBadge = order.isLate
        ? '<span class="so-badge late">⏰ Опоздал</span>'
        : '<span class="so-badge done">✅ Готов</span>';
    } else if (order.status === 'failed') {
      statusBadge = '<span class="so-badge failed">❌ Отказ</span>';
    } else if (order.status === 'scheduled') {
      statusBadge = '<span class="so-badge scheduled">⏳ Ожидает</span>';
    } else {
      const elapsedMs = now - new Date(order.createdAt).getTime();
      const remainMs = (order.deadlineSec * 1000) - elapsedMs;
      const remainSec = Math.floor(remainMs / 1000);
      if (remainSec > 60) {
        const m = Math.floor(remainSec / 60);
        const s = remainSec % 60;
        statusBadge = `<span class="so-badge active timer-green">${m}:${String(s).padStart(2, '0')}</span>`;
      } else if (remainSec > 0) {
        const s = remainSec;
        statusBadge = `<span class="so-badge active timer-yellow">0:${String(s).padStart(2, '0')}</span>`;
      } else {
        const overSec = Math.abs(remainSec);
        const m = Math.floor(overSec / 60);
        const s = overSec % 60;
        statusBadge = `<span class="so-badge active timer-red">-${m}:${String(s).padStart(2, '0')}</span>`;
      }
    }
    html += `<div class="slot-order-row" data-order-id="${order.id}">
      <span class="so-id">${order.id}</span>
      <span class="so-dishes">${dishes}</span>
      ${statusBadge}
      <span class="so-price">${order.totalPrice}₽</span>
    </div>`;
  }
  html += '</div>';
  expandEl.innerHTML = html;

  expandEl.querySelectorAll('.slot-order-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_onOrderClick) _onOrderClick(row.dataset.orderId);
    });
  });
}
