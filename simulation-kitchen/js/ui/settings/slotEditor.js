import { getBranchSlots } from '../../domain/slotModel.js';
import { formatTime } from '../helpers.js';

export function renderSlotCapacityEditor(stations, capacityPerSlot, onChange) {
  const el = document.getElementById('slotCapacityEditor');
  if (!el) return;
  el.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'cap-editor-row';
  const label = document.createElement('label');
  label.textContent = '💰 Сумма заказов на слот (₽)';
  const input = document.createElement('input');
  input.type = 'number'; input.min = '1000'; input.step = '1000';
  input.value = capacityPerSlot.sumRub || 30000;
  input.addEventListener('change', () => {
    capacityPerSlot.sumRub = parseInt(input.value) || 30000;
    if (onChange) onChange();
  });
  row.appendChild(label);
  row.appendChild(input);
  el.appendChild(row);

  const hint = document.createElement('div');
  hint.className = 'cap-editor-hint';
  hint.textContent = 'Слот принимает заказы, пока сумма не достигнет лимита';
  el.appendChild(hint);
}

let _onSlotChange = null;

export function setSlotChangeHandler(fn) { _onSlotChange = fn; }

export function renderSlotsPreview(slotsByBranch, branchId) {
  const previewEl = document.getElementById('slotsPreview');
  const summaryEl = document.getElementById('slotsSummary');
  if (!previewEl) return;

  const slots = getBranchSlots(slotsByBranch, branchId);
  previewEl.innerHTML = '';

  if (slots.length === 0) {
    previewEl.innerHTML = '<div style="color:#5a6688;font-size:12px;padding:10px;">Нет слотов. Сгенерируйте слоты выше.</div>';
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  const activeCount = slots.filter(s => !s.paused).length;
  const totalCap = slots.filter(s => !s.paused).reduce((sum, s) => sum + ((s.capacity && s.capacity.sumRub) || 0), 0);

  slots.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'slot-preview-card' + (s.paused ? ' paused' : '');

    const capSum = (s.capacity && s.capacity.sumRub) || 0;

    item.innerHTML = `
      <div class="spc-header">
        <span class="spc-time">${formatTime(s.startsAt)} — ${formatTime(s.endsAt)}</span>
        <span class="spc-id">${s.id}</span>
      </div>
      <div class="spc-controls">
        <div class="spc-sum-group">
          <label>₽</label>
          <input type="number" class="spc-sum-input" value="${capSum}" min="0" step="1000" data-idx="${idx}">
        </div>
        <button class="spc-toggle ${s.paused ? 'off' : 'on'}" data-idx="${idx}" title="${s.paused ? 'Включить слот' : 'Поставить на паузу'}">
          ${s.paused ? '▶' : '⏸'}
        </button>
      </div>
      ${s.paused ? '<div class="spc-paused-badge">⏸ На паузе</div>' : ''}`;

    previewEl.appendChild(item);
  });

  previewEl.querySelectorAll('.spc-sum-input').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.idx);
      const val = parseInt(input.value) || 0;
      slots[i].capacity = { ...slots[i].capacity, sumRub: val };
      if (_onSlotChange) _onSlotChange();
    });
  });

  previewEl.querySelectorAll('.spc-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx);
      slots[i].paused = !slots[i].paused;
      renderSlotsPreview(slotsByBranch, branchId);
      if (_onSlotChange) _onSlotChange();
    });
  });

  if (summaryEl) {
    summaryEl.textContent = `Активных: ${activeCount}/${slots.length} · Общий лимит: ${(totalCap / 1000).toFixed(0)}к₽ · ${formatTime(slots[0].startsAt)} – ${formatTime(slots[slots.length - 1].endsAt)}`;
  }
}
