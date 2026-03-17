/**
 * Дефолтные конфиги симуляции: станции и слоты по филиалам.
 * Используются при первом запуске и для сброса пресетов.
 */

export const DEFAULT_STATIONS = [
  "orders",
  "items",
  "oven",
  "fryer",
  "assembly"
];

export const DEFAULT_SLOTS_CONFIG = {
  "branch-1": [
    {
      id: "slot-1",
      startsAt: "2026-03-16T18:00:00Z",
      endsAt: "2026-03-16T18:30:00Z",
      capacity: { orders: 10, oven: 600, fryer: 300 },
      used: { orders: 2, oven: 120, fryer: 60 },
      version: 0
    },
    {
      id: "slot-2",
      startsAt: "2026-03-16T18:30:00Z",
      endsAt: "2026-03-16T19:00:00Z",
      capacity: { orders: 8, oven: 480, fryer: 240 },
      used: {},
      version: 0
    }
  ]
};

export const DEFAULT_ORDER_LOAD = {
  orders: 1,
  oven: 180,
  fryer: 60
};
