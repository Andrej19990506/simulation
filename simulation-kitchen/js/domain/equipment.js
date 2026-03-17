export function getEquipmentCapacity(eq) {
  if (!eq) return 1;
  if (eq.type === 'fryer') {
    const portions = Math.floor((eq.capacityGrams || 3000) / (eq.portionGrams || 300));
    return (eq.count || 1) * Math.max(portions, 1);
  }
  return (eq.count || 1) * (eq.capacityPerUnit || 1);
}

export function getEquipmentForDish(equipmentList, dishId, stationId) {
  if (!equipmentList) return null;
  return equipmentList.find(eq =>
    eq.station === stationId && (eq.linkedDishes || []).includes(dishId)
  ) || null;
}

export function calcBatchTime(totalItems, equipment, timeSec) {
  const capacity = getEquipmentCapacity(equipment);
  const batches = Math.ceil(totalItems / capacity);
  return batches * timeSec;
}

export function migrateEquipment(eq) {
  if (!eq.type) eq.type = 'oven';
  if (!eq.count) eq.count = 1;
  if (eq.type === 'oven' && !eq.capacityPerUnit) eq.capacityPerUnit = 4;
  if (eq.type === 'fryer') {
    if (!eq.capacityGrams) eq.capacityGrams = 3000;
    if (!eq.portionGrams) eq.portionGrams = 300;
  }
  if (!eq.station) eq.station = '';
  if (!eq.linkedDishes) eq.linkedDishes = [];
}
