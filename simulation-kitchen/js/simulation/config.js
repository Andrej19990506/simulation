export const SimulationScenarios = {
  lunch_rush: {
    id: 'lunch_rush',
    label: 'Обеденный час',
    description: 'Типичная обеденная нагрузка 11:00-14:00',
    timeScale: 120,
    icon: '🍽️',
  },
  evening_peak: {
    id: 'evening_peak',
    label: 'Вечерний пик',
    description: 'Сильная вечерняя нагрузка 18:00-22:00',
    timeScale: 120,
    icon: '🌙',
  },
  full_day: {
    id: 'full_day',
    label: 'Полный день',
    description: 'Весь рабочий день 10:00-22:00',
    timeScale: 300,
    icon: '📅',
  },
  stress_test: {
    id: 'stress_test',
    label: 'Стресс-тест',
    description: 'Максимальная нагрузка, проверка пределов кухни',
    timeScale: 180,
    icon: '💥',
  },
  slow_morning: {
    id: 'slow_morning',
    label: 'Тихое утро',
    description: 'Низкая нагрузка, для отладки',
    timeScale: 60,
    icon: '☕',
  },
};

export function getScenario(id) {
  return SimulationScenarios[id] || SimulationScenarios.lunch_rush;
}

export function getAllScenarios() {
  return Object.values(SimulationScenarios);
}
