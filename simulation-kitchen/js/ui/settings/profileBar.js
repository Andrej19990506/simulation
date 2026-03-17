export function renderProfileManager(opts) {
  const el = document.getElementById('profileBar');
  if (!el) return;
  el.innerHTML = '';

  const { profiles, activeProfile, onSave, onLoad, onDelete, onExport, onImport, onReset } = opts;

  const label = document.createElement('span');
  label.className = 'profile-label';
  label.textContent = '💾 Профиль:';
  el.appendChild(label);

  if (activeProfile) {
    const name = document.createElement('span');
    name.className = 'profile-name';
    name.textContent = activeProfile;
    el.appendChild(name);
  }

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Имя профиля…';
  nameInput.value = activeProfile || '';
  nameInput.id = 'profileNameInput';
  el.appendChild(nameInput);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm';
  saveBtn.textContent = '💾 Сохранить';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { alert('Введите имя профиля'); return; }
    onSave(name);
    nameInput.value = name;
  });
  el.appendChild(saveBtn);

  if (profiles.length > 0) {
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">Загрузить…</option>';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      if (sel.value) { onLoad(sel.value); nameInput.value = sel.value; sel.value = ''; }
    });
    el.appendChild(sel);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-ghost';
    delBtn.textContent = '🗑';
    delBtn.title = 'Удалить текущий профиль';
    delBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name && confirm(`Удалить профиль "${name}"?`)) onDelete(name);
    });
    el.appendChild(delBtn);
  }

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  el.appendChild(spacer);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-sm btn-ghost';
  exportBtn.textContent = '📤 Экспорт';
  exportBtn.addEventListener('click', onExport);
  el.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-sm btn-ghost';
  importBtn.textContent = '📥 Импорт';
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => onImport(reader.result);
      reader.readAsText(file);
    });
    input.click();
  });
  el.appendChild(importBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-sm btn-danger';
  resetBtn.textContent = '↺ Сброс';
  resetBtn.style.cssText = 'padding:4px 10px;font-size:11px';
  resetBtn.addEventListener('click', () => {
    if (confirm('Сбросить все настройки к значениям по умолчанию?')) onReset();
  });
  el.appendChild(resetBtn);
}
