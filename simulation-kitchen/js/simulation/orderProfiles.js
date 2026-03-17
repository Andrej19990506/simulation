export const defaultProfiles = {
  lunch_rush: {
    id: 'lunch_rush',
    name: 'Обеденный час',
    intensity: [
      { from: '00:00', to: '10:00', lambdaPerHour: 2 },
      { from: '10:00', to: '11:00', lambdaPerHour: 15 },
      { from: '11:00', to: '12:00', lambdaPerHour: 40 },
      { from: '12:00', to: '13:00', lambdaPerHour: 55 },
      { from: '13:00', to: '14:00', lambdaPerHour: 45 },
      { from: '14:00', to: '18:00', lambdaPerHour: 20 },
      { from: '18:00', to: '22:00', lambdaPerHour: 35 },
      { from: '22:00', to: '24:00', lambdaPerHour: 5 },
    ],
  },
  evening_peak: {
    id: 'evening_peak',
    name: 'Вечерний пик',
    intensity: [
      { from: '00:00', to: '11:00', lambdaPerHour: 5 },
      { from: '11:00', to: '14:00', lambdaPerHour: 30 },
      { from: '14:00', to: '17:00', lambdaPerHour: 15 },
      { from: '17:00', to: '18:00', lambdaPerHour: 35 },
      { from: '18:00', to: '20:00', lambdaPerHour: 70 },
      { from: '20:00', to: '21:00', lambdaPerHour: 60 },
      { from: '21:00', to: '22:00', lambdaPerHour: 40 },
      { from: '22:00', to: '24:00', lambdaPerHour: 8 },
    ],
  },
  full_day: {
    id: 'full_day',
    name: 'Полный день',
    intensity: [
      { from: '00:00', to: '10:00', lambdaPerHour: 3 },
      { from: '10:00', to: '11:00', lambdaPerHour: 18 },
      { from: '11:00', to: '14:00', lambdaPerHour: 45 },
      { from: '14:00', to: '17:00', lambdaPerHour: 22 },
      { from: '17:00', to: '21:00', lambdaPerHour: 50 },
      { from: '21:00', to: '22:00', lambdaPerHour: 25 },
      { from: '22:00', to: '24:00', lambdaPerHour: 5 },
    ],
  },
  stress_test: {
    id: 'stress_test',
    name: 'Стресс-тест',
    intensity: [
      { from: '00:00', to: '24:00', lambdaPerHour: 120 },
    ],
  },
  slow_morning: {
    id: 'slow_morning',
    name: 'Тихое утро',
    intensity: [
      { from: '00:00', to: '08:00', lambdaPerHour: 1 },
      { from: '08:00', to: '10:00', lambdaPerHour: 8 },
      { from: '10:00', to: '12:00', lambdaPerHour: 15 },
      { from: '12:00', to: '24:00', lambdaPerHour: 10 },
    ],
  },
};

export function getProfile(id) {
  return defaultProfiles[id] || defaultProfiles.lunch_rush;
}

function timeToMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

export function getLambdaForTime(profile, date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const found = profile.intensity.find(i => {
    const from = timeToMinutes(i.from);
    const to = timeToMinutes(i.to);
    return minutes >= from && minutes < to;
  }) || profile.intensity[profile.intensity.length - 1];
  return found.lambdaPerHour;
}
