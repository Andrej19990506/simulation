export function renderStationsEditor(stations, onChange) {
  const el = document.getElementById('stationsEditor');
  if (!el) return;
  el.innerHTML = '';

  stations.forEach((st, idx) => {
    const item = document.createElement('div');
    item.className = 'editor-item';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'emoji';
    emojiSpan.textContent = st.emoji;

    const info = document.createElement('div');
    info.className = 'info';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';

    const nameInput = document.createElement('input');
    nameInput.value = st.name;
    nameInput.style.width = '120px';
    nameInput.addEventListener('change', () => { st.name = nameInput.value; onChange(); });

    const slotsLabel = document.createElement('span');
    slotsLabel.style.cssText = 'font-size:11px;color:#8892b0';
    slotsLabel.textContent = 'поваров:';

    const slotsInput = document.createElement('input');
    slotsInput.type = 'number';
    slotsInput.min = '1';
    slotsInput.value = st.parallelSlots;
    slotsInput.style.width = '40px';
    slotsInput.addEventListener('change', () => { st.parallelSlots = parseInt(slotsInput.value) || 1; onChange(); });

    row.appendChild(nameInput);
    row.appendChild(slotsLabel);
    row.appendChild(slotsInput);
    info.appendChild(row);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-remove';
    delBtn.textContent = '🗑';
    delBtn.title = 'Удалить станцию';
    delBtn.addEventListener('click', () => { stations.splice(idx, 1); renderStationsEditor(stations, onChange); onChange(); });

    item.appendChild(emojiSpan);
    item.appendChild(info);
    item.appendChild(delBtn);
    el.appendChild(item);
  });
}
