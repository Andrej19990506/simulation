export function getDishStages(dish) {
  const stages = [];
  if ((dish.prepTimeSec || 0) > 0) {
    stages.push({ type: 'prep', station: dish.station || 'prep', timeSec: dish.prepTimeSec });
  }
  if ((dish.bakingTimeSec || 0) > 0 && dish.bakingStation) {
    stages.push({ type: 'baking', station: dish.bakingStation, timeSec: dish.bakingTimeSec });
  }
  if ((dish.assemblyTimeSec || 0) > 0 && dish.assemblyStation) {
    stages.push({ type: 'assembly', station: dish.assemblyStation, timeSec: dish.assemblyTimeSec });
  }
  if (stages.length === 0) {
    stages.push({ type: 'prep', station: dish.station || 'prep', timeSec: 60 });
  }
  return stages;
}

export function getDishTotalTime(dish) {
  return (dish.prepTimeSec || 0)
       + (dish.bakingTimeSec || 0)
       + (dish.assemblyTimeSec || 0)
       || 60;
}

export function getDishPrimaryStation(dish) {
  if (dish.station) return dish.station;
  return 'prep';
}

export function getCookDishTime(cook, dish) {
  if (cook.dishTimes && cook.dishTimes[dish.id] != null) {
    return cook.dishTimes[dish.id];
  }
  return Math.round(getDishTotalTime(dish) * (cook.speed || 1.0));
}

export function migrateDish(dish) {
  if (dish.recipe && dish.recipe.length > 0) {
    dish.prepTimeSec = dish.recipe.reduce((s, step) => s + step.timeSec, 0);
    const stationTimes = {};
    for (const step of dish.recipe) {
      stationTimes[step.station] = (stationTimes[step.station] || 0) + step.timeSec;
    }
    let maxStation = dish.recipe[0].station;
    let maxTime = 0;
    for (const [st, t] of Object.entries(stationTimes)) {
      if (t > maxTime) { maxTime = t; maxStation = st; }
    }
    dish.station = maxStation;
    if (!dish.ingredients) dish.ingredients = '';
    delete dish.recipe;
  }

  if (!dish.prepTimeSec) dish.prepTimeSec = 60;
  if (!dish.station) dish.station = 'prep';
  if (dish.ingredients == null) dish.ingredients = '';
  if (dish.bakingTimeSec == null) dish.bakingTimeSec = 0;
  if (dish.bakingStation == null) dish.bakingStation = '';
  if (dish.assemblyTimeSec == null) dish.assemblyTimeSec = 0;
  if (dish.assemblyStation == null) dish.assemblyStation = '';
}
