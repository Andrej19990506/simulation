export function renderActiveOrderTimers(kitchen, simNow, onOrderClick) {
  const el = document.getElementById('simActiveOrders');
  if (!el) return;

  const now = new Date(simNow).getTime();
  const orders = kitchen.activeOrders;

  if (orders.length === 0) {
    el.innerHTML = '<div class="no-active-orders">Нет активных заказов</div>';
    return;
  }

  const existing = el.querySelectorAll('.active-order-row');
  const existingMap = {};
  existing.forEach(e => { existingMap[e.dataset.id] = e; });

  const activeIds = new Set(orders.map(o => o.id));
  existing.forEach(e => { if (!activeIds.has(e.dataset.id)) e.remove(); });

  orders.forEach(order => {
    const elapsedMs = now - new Date(order.createdAt).getTime();
    const deadlineMs = order.deadlineSec * 1000;
    const remainMs = deadlineMs - elapsedMs;
    const remainSec = Math.floor(remainMs / 1000);

    let timerClass, timerText;
    if (remainSec > 60) {
      timerClass = 'timer-green';
      const m = Math.floor(remainSec / 60);
      const s = remainSec % 60;
      timerText = `${m}:${String(s).padStart(2, '0')}`;
    } else if (remainSec > 0) {
      timerClass = 'timer-yellow';
      const m = Math.floor(remainSec / 60);
      const s = remainSec % 60;
      timerText = `${m}:${String(s).padStart(2, '0')}`;
    } else {
      timerClass = 'timer-red';
      const overSec = Math.abs(remainSec);
      const m = Math.floor(overSec / 60);
      const s = overSec % 60;
      timerText = `-${m}:${String(s).padStart(2, '0')}`;
    }

    const dishes = order.positions.map(p => p.dishEmoji).join('');
    const progress = _getOrderProgress(order);

    let row = existingMap[order.id];
    if (!row) {
      row = document.createElement('div');
      row.className = 'active-order-row';
      row.dataset.id = order.id;
      row.innerHTML = `
        <span class="ao-id"></span>
        <span class="ao-dishes"></span>
        <span class="ao-progress"></span>
        <span class="ao-timer"></span>`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => { if (onOrderClick) onOrderClick(order.id); });
      el.appendChild(row);
    }

    row.querySelector('.ao-id').textContent = order.id;
    row.querySelector('.ao-dishes').textContent = dishes;
    row.querySelector('.ao-progress').textContent = progress;

    const timerEl = row.querySelector('.ao-timer');
    timerEl.textContent = timerText;
    timerEl.className = `ao-timer ${timerClass}`;
  });
}

function _getOrderProgress(order) {
  let totalStages = 0, doneStages = 0;
  for (const pos of order.positions) {
    totalStages += pos.stages.length;
    doneStages += pos.stages.filter(s => s.status === 'done').length;
  }
  return totalStages > 0 ? Math.round((doneStages / totalStages) * 100) + '%' : '0%';
}
