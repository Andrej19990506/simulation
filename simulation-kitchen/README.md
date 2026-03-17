# Kitchen Slot Simulation (модульная версия)

Симуляция слотов кухни, First Fit AssignSlot и guard window. Разбита на модули для удобной поддержки и развития.

## Структура

```
simulation-kitchen/
  index.html          # Точка входа, разметка, подключение стилей и main.js
  simulation.html     # Монолитная версия (бэкап), всё в одном файле
  styles/
    main.css          # Все стили
  src/
    config.js         # Дефолтные конфиги (станции, слоты, нагрузка заказа)
    state.js          # Состояние: slotsByBranch, simNow; геттеры/сеттеры
    engine.js         # Домен: canFit(), reserve(), assignSlotFirstFit()
    ui.js             # Лог, формы, отрисовка списков, обработчики, initUI()
    main.js           # Точка входа: DOMContentLoaded → initUI()
  README.md
```

## Запуск

Модули подключаются как ES modules (`type="module"`), поэтому лучше открывать через локальный сервер:

```bash
npx serve .
# или
python -m http.server 8080
```

Затем открой в браузере: `http://localhost:3000` (или 8080) и выбери `index.html`.

Если открыть `index.html` через `file://`, браузер может заблокировать загрузку модулей из-за CORS — в таком случае используй `simulation.html` (всё в одном файле) или запусти `serve`.

## Развитие

- **Новые сценарии** — дописывай логику в `engine.js`, UI в `ui.js`.
- **Новые настройки** — пресеты в `config.js`, поля в `index.html` и чтение в `ui.js`.
- **Стили** — только `styles/main.css`.
