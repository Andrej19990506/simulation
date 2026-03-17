import { html } from 'lit';
import { BaseComponent } from './base-component.js';

export class SettingsView extends BaseComponent {
  static properties = {
    _activeTab: { state: true },
  };

  constructor() {
    super();
    this._activeTab = 'tabKitchen';
  }

  get tabs() {
    return [
      { id: 'tabKitchen', icon: '🏪', label: 'Кухня' },
      { id: 'tabEquipment', icon: '🔥', label: 'Оборудование' },
      { id: 'tabMenu', icon: '📋', label: 'Меню и рецепты' },
      { id: 'tabSlots', icon: '📅', label: 'Слоты' },
      { id: 'tabProfile', icon: '⚡', label: 'Профиль нагрузки' },
    ];
  }

  _switchTab(tabId) {
    this._activeTab = tabId;
  }

  render() {
    return html`
      <div class="profile-bar" id="profileBar"></div>

      <div class="settings-tabs">
        ${this.tabs.map(t => html`
          <button class="tab ${this._activeTab === t.id ? 'active' : ''}"
                  @click=${() => this._switchTab(t.id)}>
            ${t.icon} ${t.label}
          </button>`)}
      </div>

      <!-- Tab: Kitchen -->
      <div class="tab-content ${this._activeTab === 'tabKitchen' ? 'active' : ''}" id="tabKitchen">
        <div class="settings-grid">
          <section class="card">
            <h3>👨‍🍳 Повара</h3>
            <p class="card-desc">Команда, навыки, скорость и время по блюдам</p>
            <div id="cooksEditor"></div>
            <button class="btn btn-sm" id="btnAddCook">+ Добавить повара</button>
          </section>

          <section class="card">
            <h3>🔧 Станции</h3>
            <p class="card-desc">Рабочие зоны и назначение поваров</p>
            <div id="stationsEditor"></div>
            <button class="btn btn-sm" id="btnAddStation">+ Добавить станцию</button>
          </section>

          <section class="card">
            <h3>⚙️ Параметры</h3>
            <p class="card-desc">Общие настройки симуляции</p>
            <div class="form-group">
              <label>Филиал (Branch ID)</label>
              <input id="cfgBranchId" value="branch-1">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Guard Window (мин)</label>
                <input id="cfgMinPrep" type="number" value="5" min="0">
              </div>
              <div class="form-group">
                <label>Max Slots to Check</label>
                <input id="cfgMaxSlots" type="number" value="50" min="1">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Скорость симуляции (x)</label>
                <input id="cfgTimeScale" type="number" value="120" min="1" max="3600">
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- Tab: Equipment -->
      <div class="tab-content ${this._activeTab === 'tabEquipment' ? 'active' : ''}" id="tabEquipment">
        <div id="equipmentEditor"></div>
        <div style="padding: 0 20px 16px; display:flex; gap:8px;">
          <button class="btn btn-sm" id="btnAddOven">+ Добавить печь</button>
          <button class="btn btn-sm" id="btnAddFryer">+ Добавить фритюр</button>
        </div>
      </div>

      <!-- Tab: Menu -->
      <div class="tab-content ${this._activeTab === 'tabMenu' ? 'active' : ''}" id="tabMenu">
        <div class="menu-grid" id="menuEditor"></div>
        <div style="padding: 0 20px 16px;">
          <button class="btn btn-sm" id="btnAddDish">+ Добавить блюдо</button>
        </div>
        <div class="combos-section">
          <div class="combos-header-row">
            <div>
              <h3>📦 Наборы блюд</h3>
              <p class="card-desc">Группировка блюд с расчётом времени и стоимости</p>
            </div>
            <button class="btn btn-sm" id="btnAddCombo">+ Новый набор</button>
          </div>
          <div id="combosEditor"></div>
        </div>
      </div>

      <!-- Tab: Slots -->
      <div class="tab-content ${this._activeTab === 'tabSlots' ? 'active' : ''}" id="tabSlots">
        <div class="settings-grid">
          <section class="card">
            <h3>📅 Генерация слотов</h3>
            <p class="card-desc">Автоматически создать слоты на рабочий день</p>
            <div class="form-row">
              <div class="form-group">
                <label>Начало рабочего дня</label>
                <input id="slotGenStart" type="time" value="10:00">
              </div>
              <div class="form-group">
                <label>Конец рабочего дня</label>
                <input id="slotGenEnd" type="time" value="22:00">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Длительность слота (мин)</label>
                <input id="slotGenDuration" type="number" value="30" min="5" max="120">
              </div>
              <div class="form-group">
                <label>Дата</label>
                <input id="slotGenDate" type="date">
              </div>
            </div>
            <div class="divider"></div>
            <h4>💰 Лимит слота</h4>
            <div id="slotCapacityEditor"></div>
            <div class="divider"></div>
            <button class="btn" id="btnGenerateSlots">🔄 Сгенерировать слоты</button>
          </section>
          <section class="card">
            <h3>📋 Текущие слоты</h3>
            <p class="card-desc">Список сгенерированных слотов</p>
            <div id="slotsPreview" class="slots-preview"></div>
            <div class="slots-summary" id="slotsSummary"></div>
          </section>
        </div>
      </div>

      <!-- Tab: Profile -->
      <div class="tab-content ${this._activeTab === 'tabProfile' ? 'active' : ''}" id="tabProfile">
        <div class="settings-grid">
          <section class="card">
            <h3>⚡ Сценарий нагрузки</h3>
            <p class="card-desc">Выберите профиль интенсивности заказов</p>
            <div id="scenarioSelector"></div>
          </section>
          <section class="card">
            <h3>📊 Профиль интенсивности</h3>
            <p class="card-desc">Заказов в час по времени суток</p>
            <div id="intensityChart" class="intensity-chart"></div>
          </section>
        </div>
      </div>`;
  }
}

customElements.define('settings-view', SettingsView);
