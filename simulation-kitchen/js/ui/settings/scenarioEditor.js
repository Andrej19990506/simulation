export function renderScenarioSelector(scenarios, activeId, onSelect) {
  const el = document.getElementById('scenarioSelector');
  if (!el) return;
  el.innerHTML = '';

  scenarios.forEach(sc => {
    const card = document.createElement('div');
    card.className = 'scenario-card' + (sc.id === activeId ? ' active' : '');

    const icon = document.createElement('span');
    icon.className = 'scenario-icon';
    icon.textContent = sc.icon;

    const info = document.createElement('div');
    info.className = 'scenario-info';

    const name = document.createElement('div');
    name.className = 'scenario-name';
    name.textContent = sc.label;

    const desc = document.createElement('div');
    desc.className = 'scenario-desc';
    desc.textContent = sc.description;

    info.appendChild(name); info.appendChild(desc);
    card.appendChild(icon); card.appendChild(info);
    card.addEventListener('click', () => { onSelect(sc.id); renderScenarioSelector(scenarios, sc.id, onSelect); });
    el.appendChild(card);
  });
}

export function renderIntensityChart(profile) {
  const el = document.getElementById('intensityChart');
  if (!el || !profile) return;
  el.innerHTML = '';

  const maxLambda = Math.max(...profile.intensity.map(i => i.lambdaPerHour), 1);

  profile.intensity.forEach(band => {
    const pct = (band.lambdaPerHour / maxLambda) * 100;
    const bar = document.createElement('div');
    bar.className = 'intensity-bar';
    bar.style.height = Math.max(pct, 2) + '%';
    bar.setAttribute('data-label', band.from);
    bar.title = `${band.from}-${band.to}: ${band.lambdaPerHour} заказов/час`;
    el.appendChild(bar);
  });
}
