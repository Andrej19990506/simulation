import { getDishTotalTime } from '../../domain/dishes.js';
import { fmtSec } from '../helpers.js';

export function renderCooksEditor(cooks, stations, dishes, onChange) {
  const el = document.getElementById('cooksEditor');
  if (!el) return;
  el.innerHTML = '';

  cooks.forEach((cook, idx) => {
    if (!cook.dishTimes) cook.dishTimes = {};
    if (cook.speed == null) cook.speed = 1.0;

    const item = document.createElement('div');
    item.className = 'editor-item';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'stretch';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:8px';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'emoji';
    emojiSpan.textContent = cook.emoji;

    const info = document.createElement('div');
    info.className = 'info';
    info.style.flex = '1';

    const nameInput = document.createElement('input');
    nameInput.value = cook.name;
    nameInput.placeholder = 'Имя повара';
    nameInput.style.width = '120px';
    nameInput.addEventListener('change', () => { cook.name = nameInput.value; onChange(); });

    const skills = document.createElement('div');
    skills.className = 'skills-grid';
    stations.forEach(st => {
      const chip = document.createElement('span');
      chip.className = 'skill-chip' + (cook.stations.includes(st.id) ? ' active' : '');
      chip.textContent = st.emoji + ' ' + st.name;
      chip.addEventListener('click', () => {
        const i2 = cook.stations.indexOf(st.id);
        if (i2 >= 0) cook.stations.splice(i2, 1);
        else cook.stations.push(st.id);
        chip.classList.toggle('active');
        onChange();
      });
      skills.appendChild(chip);
    });

    const speedRow = document.createElement('div');
    speedRow.className = 'cook-speed';
    speedRow.innerHTML = '<span>Скорость:</span>';
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range'; speedSlider.min = '0.5'; speedSlider.max = '2.0'; speedSlider.step = '0.1'; speedSlider.value = cook.speed;
    const speedVal = document.createElement('span');
    speedVal.className = 'speed-val';
    speedVal.textContent = `x${cook.speed}`;
    speedSlider.addEventListener('input', () => {
      cook.speed = parseFloat(speedSlider.value);
      speedVal.textContent = `x${cook.speed.toFixed(1)}`;
      onChange();
    });
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedVal);

    info.appendChild(nameInput);
    info.appendChild(skills);
    info.appendChild(speedRow);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-remove';
    delBtn.textContent = '🗑';
    delBtn.title = 'Удалить повара';
    delBtn.addEventListener('click', () => { cooks.splice(idx, 1); renderCooksEditor(cooks, stations, dishes, onChange); onChange(); });

    topRow.appendChild(emojiSpan);
    topRow.appendChild(info);
    topRow.appendChild(delBtn);
    item.appendChild(topRow);

    if (dishes && dishes.length > 0) {
      const dtSection = document.createElement('details');
      dtSection.className = 'cook-dish-times';
      const summary = document.createElement('summary');
      summary.textContent = `⏱ Время по блюдам (${Object.keys(cook.dishTimes).length} настроено)`;
      dtSection.appendChild(summary);

      dishes.forEach(dish => {
        const baseTime = getDishTotalTime(dish);
        const row = document.createElement('div');
        row.className = 'cook-dish-row';

        const label = document.createElement('span');
        label.className = 'dish-label';
        label.textContent = `${dish.emoji} ${dish.name}`;

        const input = document.createElement('input');
        input.type = 'number'; input.min = '0';
        input.placeholder = Math.round(baseTime * cook.speed);
        input.value = cook.dishTimes[dish.id] != null ? cook.dishTimes[dish.id] : '';
        input.addEventListener('change', () => {
          const v = input.value.trim();
          if (v === '') delete cook.dishTimes[dish.id];
          else cook.dishTimes[dish.id] = parseInt(v) || 0;
          summary.textContent = `⏱ Время по блюдам (${Object.keys(cook.dishTimes).length} настроено)`;
          onChange();
        });

        const base = document.createElement('span');
        base.className = 'base-time';
        base.textContent = `(${fmtSec(baseTime)})`;

        row.appendChild(label); row.appendChild(input); row.appendChild(base);
        dtSection.appendChild(row);
      });

      item.appendChild(dtSection);
    }

    el.appendChild(item);
  });
}
