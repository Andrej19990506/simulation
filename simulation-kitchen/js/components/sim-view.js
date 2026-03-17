import { html } from 'lit';
import { BaseComponent } from './base-component.js';
import './sim-slots-panel.js';
import './sim-kitchen-panel.js';
import './sim-feed-panel.js';

export class SimView extends BaseComponent {
  static properties = {
    kitchen: { type: Object },
    simNow: { type: Object },
    slotsByBranch: { type: Object },
    branchId: { type: String },
    stats: { type: Object },
    _activePanel: { state: true },
  };

  constructor() {
    super();
    this.kitchen = null;
    this.simNow = null;
    this.slotsByBranch = {};
    this.branchId = '';
    this.stats = {};
    this._activePanel = 'kitchen';
  }

  get feedPanel() {
    return this.querySelector('sim-feed-panel');
  }

  get slotsPanel() {
    return this.querySelector('sim-slots-panel');
  }

  get kitchenPanel() {
    return this.querySelector('sim-kitchen-panel');
  }

  _setPanel(panel) {
    this._activePanel = panel;
  }

  updated() {
    this.querySelector('sim-slots-panel')?.requestUpdate();
    this.querySelector('sim-kitchen-panel')?.requestUpdate();
    this.querySelector('sim-feed-panel')?.requestUpdate();
  }

  render() {
    const panels = [
      { id: 'slots', icon: '📅', label: 'Слоты' },
      { id: 'kitchen', icon: '🍳', label: 'Кухня' },
      { id: 'feed', icon: '🔥', label: 'Мониторинг' },
    ];

    return html`
      <div class="sim-main">
        <sim-slots-panel
          class="${this._activePanel === 'slots' ? 'panel-active' : ''}"
          .slotsByBranch=${this.slotsByBranch}
          .branchId=${this.branchId}
          .simNow=${this.simNow}
          .kitchen=${this.kitchen}>
        </sim-slots-panel>

        <sim-kitchen-panel
          class="${this._activePanel === 'kitchen' ? 'panel-active' : ''}"
          .kitchen=${this.kitchen}
          .simNow=${this.simNow}>
        </sim-kitchen-panel>

        <sim-feed-panel
          class="${this._activePanel === 'feed' ? 'panel-active' : ''}"
          .kitchen=${this.kitchen}
          .simNow=${this.simNow}
          .stats=${this.stats}
          .slotsByBranch=${this.slotsByBranch}
          .branchId=${this.branchId}>
        </sim-feed-panel>
      </div>

      <nav class="sim-mobile-tabs">
        ${panels.map(p => html`
          <button class="sim-mobile-tab ${this._activePanel === p.id ? 'active' : ''}"
                  @click=${() => this._setPanel(p.id)}>
            <span class="sim-mobile-tab-icon">${p.icon}</span>
            ${p.label}
          </button>`)}
      </nav>`;
  }
}

customElements.define('sim-view', SimView);
