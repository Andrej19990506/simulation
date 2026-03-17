import { fmtSec } from '../helpers.js';
import { getEquipmentCapacity } from '../../domain/equipment.js';

export function renderEquipmentEditor(equipment, dishes, combos, stations, onChange) {
  const el = document.getElementById('equipmentEditor');
  if (!el) return;
  el.innerHTML = '';

  const rerender = () => renderEquipmentEditor(equipment, dishes, combos, stations, onChange);

  equipment.forEach((eq, eqIdx) => {
    const card = document.createElement('div');
    card.className = 'equipment-card';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-close';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Удалить оборудование';
    delBtn.addEventListener('click', () => { equipment.splice(eqIdx, 1); rerender(); onChange(); });
    card.appendChild(delBtn);

    const header = document.createElement('div');
    header.className = 'eq-header';

    const emojiInput = document.createElement('input');
    emojiInput.className = 'eq-emoji-input';
    emojiInput.value = eq.emoji || (eq.type === 'fryer' ? '🍟' : '🔥');
    emojiInput.style.width = '36px';
    emojiInput.addEventListener('change', () => { eq.emoji = emojiInput.value; onChange(); });

    const nameInput = document.createElement('input');
    nameInput.className = 'eq-name-input';
    nameInput.value = eq.name;
    nameInput.placeholder = 'Название';
    nameInput.addEventListener('change', () => { eq.name = nameInput.value; onChange(); });

    const typeBadge = document.createElement('span');
    typeBadge.className = 'eq-type-badge';
    typeBadge.textContent = eq.type === 'fryer' ? 'ФРИТЮР' : 'ПЕЧЬ';

    header.appendChild(emojiInput);
    header.appendChild(nameInput);
    header.appendChild(typeBadge);
    card.appendChild(header);

    const configGrid = document.createElement('div');
    configGrid.className = 'eq-config-grid';

    if (eq.type === 'fryer') {
      _addField(configGrid, 'Количество', eq.count, 1, 20, (v) => { eq.count = v; rerender(); onChange(); });
      _addField(configGrid, 'Вместимость (г)', eq.capacityGrams, 100, 50000, (v) => { eq.capacityGrams = v; rerender(); onChange(); });
      _addField(configGrid, 'Порция (г)', eq.portionGrams, 50, 5000, (v) => { eq.portionGrams = v; rerender(); onChange(); });
    } else {
      _addField(configGrid, 'Количество печей', eq.count, 1, 20, (v) => { eq.count = v; rerender(); onChange(); });
      _addField(configGrid, 'Вместимость (шт)', eq.capacityPerUnit, 1, 20, (v) => { eq.capacityPerUnit = v; rerender(); onChange(); });
    }

    card.appendChild(configGrid);

    const stationRow = document.createElement('div');
    stationRow.className = 'eq-station-row';
    const stLabel = document.createElement('span');
    stLabel.className = 'eq-field-label';
    stLabel.textContent = 'Станция (кто отвечает):';
    const stSelect = document.createElement('select');
    stSelect.className = 'eq-station-select';
    const stNone = document.createElement('option');
    stNone.value = '';
    stNone.textContent = '— не привязана —';
    stSelect.appendChild(stNone);
    (stations || []).forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = `${st.emoji} ${st.name}`;
      if (st.id === eq.station) opt.selected = true;
      stSelect.appendChild(opt);
    });
    stSelect.addEventListener('change', () => { eq.station = stSelect.value; onChange(); });
    stationRow.appendChild(stLabel);
    stationRow.appendChild(stSelect);
    card.appendChild(stationRow);

    const dishesSection = document.createElement('div');
    dishesSection.className = 'eq-dishes-section';
    const dishTitle = document.createElement('div');
    dishTitle.className = 'eq-section-title';
    dishTitle.textContent = 'Привязанные блюда:';
    dishesSection.appendChild(dishTitle);

    const dishGrid = document.createElement('div');
    dishGrid.className = 'eq-dish-grid';
    (dishes || []).forEach(dish => {
      const isLinked = (eq.linkedDishes || []).includes(dish.id);
      const chip = document.createElement('label');
      chip.className = 'eq-dish-chip' + (isLinked ? ' linked' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isLinked;
      cb.addEventListener('change', () => {
        if (!eq.linkedDishes) eq.linkedDishes = [];
        if (cb.checked) {
          if (!eq.linkedDishes.includes(dish.id)) eq.linkedDishes.push(dish.id);
        } else {
          eq.linkedDishes = eq.linkedDishes.filter(id => id !== dish.id);
        }
        rerender();
        onChange();
      });
      chip.appendChild(cb);
      chip.appendChild(document.createTextNode(` ${dish.emoji} ${dish.name}`));
      dishGrid.appendChild(chip);
    });
    dishesSection.appendChild(dishGrid);
    card.appendChild(dishesSection);

    const summary = _buildSummary(eq, dishes, combos);
    card.appendChild(summary);

    el.appendChild(card);
  });
}

function _addField(container, label, value, min, max, onUpdate) {
  const wrap = document.createElement('div');
  wrap.className = 'eq-field';
  const lbl = document.createElement('span');
  lbl.className = 'eq-field-label';
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.min = min;
  inp.max = max;
  inp.value = value || min;
  inp.className = 'eq-field-input';
  inp.addEventListener('change', () => { onUpdate(parseInt(inp.value) || min); });
  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  container.appendChild(wrap);
}

function _buildSummary(eq, dishes, combos) {
  const section = document.createElement('div');
  section.className = 'eq-summary';

  const totalCap = getEquipmentCapacity(eq);
  const linked = (eq.linkedDishes || []).filter(id => (dishes || []).some(d => d.id === id));

  let capText;
  if (eq.type === 'fryer') {
    const portionsPerUnit = Math.floor((eq.capacityGrams || 3000) / (eq.portionGrams || 300));
    capText = `${eq.count} × ${portionsPerUnit} порц. = ${totalCap} порций одновременно`;
  } else {
    capText = `${eq.count} × ${eq.capacityPerUnit} шт. = ${totalCap} шт. одновременно`;
  }

  const capLine = document.createElement('div');
  capLine.className = 'eq-summary-line eq-summary-capacity';
  capLine.textContent = `📊 Вместимость: ${capText}`;
  section.appendChild(capLine);

  if (linked.length === 0) {
    const noLink = document.createElement('div');
    noLink.className = 'eq-summary-line';
    noLink.textContent = 'Нет привязанных блюд';
    section.appendChild(noLink);
    return section;
  }

  const linkedCombos = (combos || []).filter(combo =>
    combo.items.some(item => linked.includes(item.dishId))
  );

  linkedCombos.forEach(combo => {
    let totalItems = 0;
    let maxTimeSec = 0;
    combo.items.forEach(item => {
      if (!linked.includes(item.dishId)) return;
      const dish = (dishes || []).find(d => d.id === item.dishId);
      if (!dish) return;
      totalItems += item.qty;
      const time = _getDishTimeForEquipment(dish, eq);
      if (time > maxTimeSec) maxTimeSec = time;
    });

    if (totalItems === 0 || maxTimeSec === 0) return;

    const batches = Math.ceil(totalItems / totalCap);
    const totalTime = batches * maxTimeSec;

    const line = document.createElement('div');
    line.className = 'eq-summary-line';
    line.innerHTML = `<strong>📦 ${combo.name}</strong>: ${totalItems} шт. → ` +
      `${batches} ${_batchWord(batches)} × ${fmtSec(maxTimeSec)} = <strong>${fmtSec(totalTime)}</strong>`;
    section.appendChild(line);
  });

  linked.forEach(dishId => {
    const dish = (dishes || []).find(d => d.id === dishId);
    if (!dish) return;
    const time = _getDishTimeForEquipment(dish, eq);
    if (time <= 0) return;

    const line = document.createElement('div');
    line.className = 'eq-summary-line eq-summary-dish';
    line.textContent = `${dish.emoji} ${dish.name}: ${fmtSec(time)} за цикл`;
    section.appendChild(line);
  });

  return section;
}

function _getDishTimeForEquipment(dish, eq) {
  if (eq.type === 'oven') {
    return dish.bakingTimeSec || dish.prepTimeSec || 0;
  }
  return dish.prepTimeSec || 0;
}

function _batchWord(n) {
  if (n === 1) return 'цикл';
  if (n >= 2 && n <= 4) return 'цикла';
  return 'циклов';
}
