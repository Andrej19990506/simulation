import { formatTimeShort } from '../helpers.js';

export function renderSimMetrics(stats) {
  const el = document.getElementById('simMetrics');
  if (!el) return;

  const fmtExec = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m > 0 ? `${m}м${s > 0 ? s + 'с' : ''}` : `${s}с`;
  };

  const lost = (stats.failedOrders || 0) + (stats.clientAbandoned || 0);
  const onTime = (stats.completedOrders || 0) - (stats.lateOrders || 0);
  const inProgress = (stats.totalOrders || 0) - (stats.completedOrders || 0) - lost;
  const metrics = [
    { label: 'Всего', value: stats.totalOrders, cls: 'info' },
    { label: 'Выполнено', value: stats.completedOrders, cls: 'success' },
    { label: 'Вовремя', value: onTime, cls: onTime > 0 ? 'success' : 'info' },
    { label: 'Опоздали', value: stats.lateOrders, cls: stats.lateOrders > 0 ? 'danger' : 'info' },
    { label: 'Потеряно', value: lost, cls: lost > 0 ? 'danger' : 'info' },
    { label: 'Ср. время', value: fmtExec(stats.avgExecSec), cls: 'warning' },
    { label: 'Выручка', value: (stats.totalRevenue / 1000).toFixed(1) + 'к₽', cls: 'purple' },
    { label: 'В работе', value: Math.max(0, inProgress), cls: inProgress > 0 ? 'warning' : 'info' },
  ];

  if (el.children.length !== metrics.length) {
    el.innerHTML = '';
    metrics.forEach(m => {
      const chip = document.createElement('div');
      chip.className = `ms-chip ${m.cls}`;
      chip.innerHTML = `<span class="ms-val"></span><span class="ms-lbl">${m.label}</span>`;
      el.appendChild(chip);
    });
  }

  metrics.forEach((m, i) => {
    const chip = el.children[i];
    if (!chip) return;
    chip.className = `ms-chip ${m.cls}`;
    chip.querySelector('.ms-val').textContent = m.value;
  });
}

const _feedStore = [];
let _feedFilter = 'all';
let _onOrderClick = null;

export function setFeedOrderClickHandler(fn) { _onOrderClick = fn; }
export function getFeedStore() { return _feedStore; }
export function resetFeedStore() { _feedStore.length = 0; _feedFilter = 'all'; }

const FEED_CATEGORIES = {
  order_assigned: 'active',
  order_activated: 'active',
  order_failed: 'failed',
  order_completed: 'done',
  stage_started: 'active',
  stage_done: 'active',
  position_done: 'active',
};

export function addFeedItem(type, text, simNow, extra = {}) {
  const entry = {
    type,
    text,
    time: new Date(simNow),
    orderId: extra.orderId || null,
    isLate: extra.isLate || false,
    category: FEED_CATEGORIES[type] || 'active',
  };
  _feedStore.unshift(entry);
  if (_feedStore.length > 200) _feedStore.length = 200;

  _renderFeed();
}

export function initFeedFilters() {
  const container = document.getElementById('feedFilterTabs');
  if (!container) return;

  const filters = [
    { id: 'all', label: 'Все' },
    { id: 'active', label: 'Активные' },
    { id: 'done', label: 'Готовые' },
    { id: 'late', label: 'Опоздания' },
  ];

  container.innerHTML = '';
  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'feed-filter-btn' + (f.id === _feedFilter ? ' active' : '');
    btn.textContent = f.label;
    btn.dataset.filter = f.id;
    btn.addEventListener('click', () => {
      _feedFilter = f.id;
      container.querySelectorAll('.feed-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderFeed();
    });
    container.appendChild(btn);
  });
}

function _renderFeed() {
  const el = document.getElementById('simOrderFeed');
  if (!el) return;

  const iconMap = {
    order_assigned: '📥', order_failed: '❌', order_completed: '✅',
    stage_started: '👨‍🍳', stage_done: '✔️', position_done: '🍽️',
  };
  const clsMap = {
    order_assigned: 'info', order_failed: 'danger', order_completed: 'success',
    stage_started: 'cooking', stage_done: 'info', position_done: 'success',
  };

  let filtered = _feedStore;
  if (_feedFilter === 'active') {
    filtered = _feedStore.filter(e => e.category === 'active');
  } else if (_feedFilter === 'done') {
    filtered = _feedStore.filter(e => e.type === 'order_completed');
  } else if (_feedFilter === 'late') {
    filtered = _feedStore.filter(e => e.isLate);
  }

  const maxShow = 30;
  const items = filtered.slice(0, maxShow);

  el.innerHTML = '';
  items.forEach(entry => {
    const item = document.createElement('div');
    let cls = clsMap[entry.type] || 'info';
    if (entry.isLate && entry.type === 'order_completed') cls = 'danger late';
    item.className = `feed-item ${cls}`;
    if (entry.orderId) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        if (_onOrderClick) _onOrderClick(entry.orderId);
      });
    }
    item.innerHTML = `
      <span class="feed-icon">${iconMap[entry.type] || '📋'}</span>
      <span class="feed-text">${entry.text}</span>
      <span class="feed-time">${formatTimeShort(entry.time)}</span>`;
    el.appendChild(item);
  });

  if (filtered.length > maxShow) {
    const more = document.createElement('div');
    more.className = 'feed-more';
    more.textContent = `...ещё ${filtered.length - maxShow}`;
    el.appendChild(more);
  }
}

export function appendSimLog(msg, simNow) {
  const el = document.getElementById('simLog');
  if (!el) return;
  el.textContent += `[${formatTimeShort(simNow)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
