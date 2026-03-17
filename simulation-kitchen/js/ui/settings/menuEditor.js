import { migrateDish } from '../../domain/dishes.js';
import { fmtSec } from '../helpers.js';

const FOOD_EMOJIS = [
  { label: 'Пиццы и хлеб', items: ['🍕', '🥖', '🥐', '🍞', '🫓', '🥯', '🥨', '🧀', '🫕'] },
  { label: 'Мясо и птица', items: ['🍖', '🍗', '🥩', '🥓', '🌭', '🍔', '🫔', '🌮', '🌯', '🥙'] },
  { label: 'Морепродукты', items: ['🍣', '🍤', '🦐', '🦞', '🦀', '🐟', '🐠', '🦑'] },
  { label: 'Азиатская', items: ['🍜', '🍝', '🍲', '🍛', '🍚', '🍙', '🍘', '🥟', '🥠', '🥡'] },
  { label: 'Салаты и овощи', items: ['🥗', '🥬', '🥒', '🍅', '🥕', '🌽', '🥦', '🧅', '🧄', '🥑'] },
  { label: 'Закуски', items: ['🥚', '🍳', '🧇', '🥞', '🫘', '🥜', '🫒', '🥫', '🧈'] },
  { label: 'Фри и снэки', items: ['🍟', '🥔', '🧆', '🥘', '🫙'] },
  { label: 'Десерты', items: ['🍰', '🎂', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🧊'] },
  { label: 'Напитки', items: ['☕', '🍵', '🧃', '🥤', '🍺', '🍷', '🥂', '🧋', '🫖'] },
  { label: 'Фрукты', items: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🥝', '🍑', '🥭'] },
  { label: 'Другое', items: ['🍽️', '🥣', '🥄', '🔪', '🧑‍🍳', '📦', '🛒'] },
];

function _createEmojiPicker(currentEmoji, onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'emoji-picker-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'emoji-picker-btn';
  btn.textContent = currentEmoji || '🍽️';
  btn.title = 'Выбрать эмодзи';

  const popup = document.createElement('div');
  popup.className = 'emoji-picker-popup';

  for (const group of FOOD_EMOJIS) {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'emoji-group-label';
    groupLabel.textContent = group.label;
    popup.appendChild(groupLabel);

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    for (const em of group.items) {
      const emBtn = document.createElement('button');
      emBtn.type = 'button';
      emBtn.className = 'emoji-item';
      if (em === currentEmoji) emBtn.classList.add('selected');
      emBtn.textContent = em;
      emBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.textContent = em;
        popup.classList.remove('open');
        onSelect(em);
      });
      grid.appendChild(emBtn);
    }
    popup.appendChild(grid);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = popup.classList.contains('open');
    document.querySelectorAll('.emoji-picker-popup.open').forEach(p => p.classList.remove('open'));
    if (!wasOpen) popup.classList.add('open');
  });

  wrap.appendChild(btn);
  wrap.appendChild(popup);
  return wrap;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.emoji-picker-popup.open').forEach(p => p.classList.remove('open'));
});

const STAGE_DEFS = [
  { key: 'prep',     stationKey: 'station',         timeKey: 'prepTimeSec',     label: 'Готовка',     required: true },
  { key: 'baking',   stationKey: 'bakingStation',   timeKey: 'bakingTimeSec',   label: 'Выпекание',   required: false },
  { key: 'assembly', stationKey: 'assemblyStation', timeKey: 'assemblyTimeSec', label: 'Сборка',      required: false },
];

export function renderMenuEditor(dishes, stations, onChange) {
  const el = document.getElementById('menuEditor');
  if (!el) return;
  el.innerHTML = '';

  dishes.forEach((dish, idx) => {
    migrateDish(dish);

    const card = document.createElement('div');
    card.className = 'dish-card';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-close';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Удалить блюдо';
    delBtn.addEventListener('click', () => {
      dishes.splice(idx, 1);
      renderMenuEditor(dishes, stations, onChange);
      onChange();
    });
    card.appendChild(delBtn);

    const header = document.createElement('div');
    header.className = 'dish-header';

    const emojiPicker = _createEmojiPicker(dish.emoji || '🍽️', (em) => {
      dish.emoji = em;
      onChange();
    });

    const nameInput = document.createElement('input');
    nameInput.className = 'dish-name-input';
    nameInput.value = dish.name;
    nameInput.placeholder = 'Название блюда';
    nameInput.addEventListener('change', () => { dish.name = nameInput.value; onChange(); });

    const priceWrap = document.createElement('div');
    priceWrap.className = 'dish-price-wrap';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.value = dish.price;
    priceInput.addEventListener('change', () => { dish.price = parseInt(priceInput.value) || 0; onChange(); });
    const rub = document.createElement('span');
    rub.textContent = '₽';
    priceWrap.appendChild(priceInput);
    priceWrap.appendChild(rub);

    header.appendChild(emojiPicker);
    header.appendChild(nameInput);
    header.appendChild(priceWrap);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'dish-body';
    const ingLabel = document.createElement('label');
    ingLabel.textContent = 'Рецепт / ингредиенты';
    const ingInput = document.createElement('input');
    ingInput.type = 'text';
    ingInput.value = dish.ingredients || '';
    ingInput.placeholder = 'тесто, соус, сыр, помидоры…';
    ingInput.addEventListener('change', () => { dish.ingredients = ingInput.value; onChange(); });
    body.appendChild(ingLabel);
    body.appendChild(ingInput);
    card.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'dish-footer';

    for (const stageDef of STAGE_DEFS) {
      const row = document.createElement('div');
      row.className = 'dish-stage-row';

      const label = document.createElement('span');
      label.className = 'dish-stage-label';
      label.textContent = stageDef.label;
      row.appendChild(label);

      const stSelect = document.createElement('select');
      stSelect.className = 'dish-stage-station';

      if (!stageDef.required) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— нет —';
        stSelect.appendChild(emptyOpt);
      }
      stations.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.emoji + ' ' + s.name;
        if (s.id === dish[stageDef.stationKey]) opt.selected = true;
        stSelect.appendChild(opt);
      });
      stSelect.addEventListener('change', () => {
        dish[stageDef.stationKey] = stSelect.value;
        if (!stSelect.value) dish[stageDef.timeKey] = 0;
        onChange();
      });
      row.appendChild(stSelect);

      const timeWrap = document.createElement('div');
      timeWrap.className = 'dish-stage-time';
      const tInput = document.createElement('input');
      tInput.type = 'number';
      tInput.min = '0';
      tInput.value = dish[stageDef.timeKey] || 0;
      tInput.placeholder = '0';
      const timeFmt = document.createElement('span');
      timeFmt.className = 'dish-time-fmt';
      timeFmt.textContent = fmtSec(dish[stageDef.timeKey] || 0);
      tInput.addEventListener('input', () => {
        const v = Math.max(0, parseInt(tInput.value) || 0);
        dish[stageDef.timeKey] = v;
        timeFmt.textContent = fmtSec(v);
      });
      tInput.addEventListener('change', onChange);
      timeWrap.appendChild(tInput);
      timeWrap.appendChild(timeFmt);
      row.appendChild(timeWrap);

      footer.appendChild(row);
    }

    card.appendChild(footer);
    el.appendChild(card);
  });
}
