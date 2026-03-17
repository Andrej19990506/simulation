import { fmtSec } from '../helpers.js';
import { getEquipmentForDish, getEquipmentCapacity } from '../../domain/equipment.js';

export function renderCombosEditor(combos, dishes, onChange, stations, equipment) {
  const el = document.getElementById('combosEditor');
  if (!el) return;
  el.innerHTML = '';

  const rerender = () => renderCombosEditor(combos, dishes, onChange, stations, equipment);
  const stationLabel = (stId) => {
    const st = (stations || []).find(s => s.id === stId);
    return st ? `${st.emoji} ${st.name}` : stId;
  };

  combos.forEach((combo, comboIdx) => {
    const card = document.createElement('div');
    card.className = 'combo-card';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-close';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Удалить набор';
    delBtn.addEventListener('click', () => {
      combos.splice(comboIdx, 1);
      rerender();
      onChange();
    });
    card.appendChild(delBtn);

    const header = document.createElement('div');
    header.className = 'combo-header';
    const icon = document.createElement('span');
    icon.className = 'combo-icon';
    icon.textContent = '📦';
    const nameInput = document.createElement('input');
    nameInput.className = 'combo-name-input';
    nameInput.value = combo.name;
    nameInput.placeholder = 'Название набора';
    nameInput.addEventListener('change', () => { combo.name = nameInput.value; onChange(); });

    const priceWrap = document.createElement('div');
    priceWrap.className = 'combo-price-wrap';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.value = combo.price || '';
    priceInput.placeholder = '—';
    priceInput.title = 'Цена набора';
    priceInput.addEventListener('change', () => {
      const v = priceInput.value.trim();
      combo.price = v === '' ? null : (parseInt(v) || 0);
      rerender();
      onChange();
    });
    const rub = document.createElement('span');
    rub.textContent = '₽';
    priceWrap.appendChild(priceInput);
    priceWrap.appendChild(rub);

    header.appendChild(icon);
    header.appendChild(nameInput);
    header.appendChild(priceWrap);
    card.appendChild(header);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'combo-items';

    let sumPrice = 0;
    let totalCount = 0;

    const stationItemsMap = {};

    combo.items = combo.items.filter(item => dishes.some(d => d.id === item.dishId));

    combo.items.forEach((item, itemIdx) => {
      const dish = dishes.find(d => d.id === item.dishId);
      if (!dish) return;

      const price = (dish.price || 0) * item.qty;
      sumPrice += price;
      totalCount += item.qty;

      const addToStation = (stId, timeSec, qty, dishId) => {
        if (!stId || !timeSec || timeSec <= 0) return;
        if (!stationItemsMap[stId]) stationItemsMap[stId] = [];
        stationItemsMap[stId].push({ timeSec, qty, dishId });
      };
      addToStation(dish.station, dish.prepTimeSec, item.qty, dish.id);
      addToStation(dish.bakingStation, dish.bakingTimeSec, item.qty, dish.id);
      addToStation(dish.assemblyStation, dish.assemblyTimeSec, item.qty, dish.id);

      const dishPerUnit = (dish.prepTimeSec || 0) + (dish.bakingTimeSec || 0) + (dish.assemblyTimeSec || 0) || 60;
      const timeSec = dishPerUnit * item.qty;

      const row = document.createElement('div');
      row.className = 'combo-item';

      const dishLabel = document.createElement('span');
      dishLabel.className = 'combo-dish-label';
      dishLabel.textContent = `${dish.emoji} ${dish.name}`;

      const multi = document.createElement('span');
      multi.className = 'combo-multi';
      multi.textContent = '×';

      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.min = '1';
      qtyInput.value = item.qty;
      qtyInput.className = 'combo-qty-input';
      qtyInput.addEventListener('change', () => {
        item.qty = Math.max(1, parseInt(qtyInput.value) || 1);
        rerender();
        onChange();
      });

      const timeSpan = document.createElement('span');
      timeSpan.className = 'combo-item-time';
      timeSpan.textContent = fmtSec(timeSec);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '🗑';
      removeBtn.addEventListener('click', () => {
        combo.items.splice(itemIdx, 1);
        rerender();
        onChange();
      });

      row.appendChild(dishLabel);
      row.appendChild(multi);
      row.appendChild(qtyInput);
      row.appendChild(timeSpan);
      row.appendChild(removeBtn);
      itemsWrap.appendChild(row);
    });

    card.appendChild(itemsWrap);

    const addRow = document.createElement('div');
    addRow.className = 'combo-add-row';
    const dishSelect = document.createElement('select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Добавить блюдо…';
    dishSelect.appendChild(defaultOpt);
    dishes.forEach(d => {
      if (combo.items.some(i => i.dishId === d.id)) return;
      const dishPerUnit = (d.prepTimeSec || 0) + (d.bakingTimeSec || 0) + (d.assemblyTimeSec || 0) || 60;
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.emoji} ${d.name} (${fmtSec(dishPerUnit)})`;
      dishSelect.appendChild(opt);
    });
    dishSelect.addEventListener('change', () => {
      if (!dishSelect.value) return;
      combo.items.push({ dishId: dishSelect.value, qty: 1 });
      rerender();
      onChange();
    });
    addRow.appendChild(dishSelect);
    card.appendChild(addRow);

    if (combo.items.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'combo-footer';

      const stationBreakdown = _calcStationBreakdown(stationItemsMap, stations, equipment);

      let totalTime = 0;
      for (const sec of Object.values(stationBreakdown)) totalTime += sec;

      const displayPrice = combo.price != null ? combo.price : sumPrice;
      const summary = document.createElement('div');
      summary.className = 'combo-summary';
      summary.innerHTML =
        `<span class="combo-total-count">${totalCount} блюд</span>` +
        `<span class="combo-total-time">⏱ ${fmtSec(totalTime)}</span>` +
        (combo.price != null
          ? `<span class="combo-total-price">${displayPrice.toLocaleString()}₽</span>` +
            `<span class="combo-sum-hint">сумма позиций: ${sumPrice.toLocaleString()}₽</span>`
          : `<span class="combo-total-price">${sumPrice.toLocaleString()}₽</span>`);
      footer.appendChild(summary);

      const stKeys = Object.keys(stationBreakdown);
      if (stKeys.length > 0) {
        const breakdown = document.createElement('div');
        breakdown.className = 'combo-breakdown';
        breakdown.textContent = 'По станциям: ' + stKeys.map(stId =>
          `${stationLabel(stId)} ${fmtSec(stationBreakdown[stId])}`
        ).join(' · ');
        footer.appendChild(breakdown);
      }

      card.appendChild(footer);
    }

    el.appendChild(card);
  });
}

function _calcStationBreakdown(stationItemsMap, stations, equipment) {
  const breakdown = {};

  for (const [stId, entries] of Object.entries(stationItemsMap)) {
    let hasEquipment = false;
    let totalItems = 0;
    let maxTimeSec = 0;
    let eqCapacity = 1;

    for (const e of entries) {
      const eq = getEquipmentForDish(equipment, e.dishId, stId);
      if (eq) {
        hasEquipment = true;
        const cap = getEquipmentCapacity(eq);
        if (cap > eqCapacity) eqCapacity = cap;
      }
      totalItems += e.qty;
      if (e.timeSec > maxTimeSec) maxTimeSec = e.timeSec;
    }

    if (hasEquipment && eqCapacity > 1) {
      const batches = Math.ceil(totalItems / eqCapacity);
      breakdown[stId] = batches * maxTimeSec;
    } else {
      let total = 0;
      for (const e of entries) {
        total += e.timeSec * e.qty;
      }
      breakdown[stId] = total;
    }
  }

  return breakdown;
}
