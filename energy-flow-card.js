/**
 * energy-flow-card.js
 * Custom Lovelace card — Animated Energy Flow Visualiser
 *
 * Displays real-time energy flow between Solar, Home, Battery, Grid and EV
 * with animated bezier flow lines, node pulse animations, battery gauges,
 * and weather-based background image switching.
 *
 * Installation:
 *   1. Copy energy-flow-card.js to /config/www/
 *   2. Add as a Lovelace resource: /local/energy-flow-card.js (type: module)
 *   3. Add a card with type: custom:energy-flow-card
 *
 * Full YAML config reference:
 *
 * type: custom:energy-flow-card
 *
 * # Background images (weather/time based switching)
 * background:                /local/my-day.jpg
 * background_night:          /local/my-night.jpg
 * background_day_rain:       /local/my-day-rain.jpg
 * background_day_heavy_rain: /local/my-day-heavy-rain.jpg
 * background_night_rain:     /local/my-night-rain.jpg
 * background_night_heavy_rain: /local/my-night-heavy-rain.jpg
 *
 * # Weather entity for background switching (optional)
 * weather_entity: weather.your_location
 *
 * # Node opacity (0.0 = fully transparent, 1.0 = fully opaque)
 * node_opacity: 0.4
 *
 * # Node pulse animation (true/false)
 * node_animation: true
 *
 * # Node labels (override default text on each node)
 * node_labels:
 *   solar:     Solar
 *   home:      Home
 *   powerwall: Battery
 *   grid:      Grid
 *   ev:        EV
 *
 * # Node positions as % of card width/height
 * nodes:
 *   solar:     { left: 48, top: 20 }
 *   home:      { left: 55, top: 50 }
 *   powerwall: { left: 15, top: 60 }
 *   grid:      { left: 15, top: 25 }
 *   ev:        { left: 80, top: 65 }
 *
 * # Entity IDs
 * entities:
 *   solar:         sensor.solar_power
 *   home:          sensor.home_load
 *   powerwall:     sensor.battery_power      # negative = charging, positive = discharging
 *   powerwall_pct: sensor.battery_level
 *   grid:          sensor.grid_power         # negative = export, positive = import
 *   ev_power:      sensor.ev_charging_power
 *   ev_pct:        sensor.ev_battery_level
 */

// ── Flow thresholds (kW) ─────────────────────────────────
const THRESHOLD_SOLAR    = 0.05;
const THRESHOLD_HOME     = 0.05;
const THRESHOLD_BATTERY  = 0.03;
const THRESHOLD_GRID     = 0.40;
const THRESHOLD_EV       = 0.05;

// ── Default node labels ──────────────────────────────────
const DEFAULT_LABELS = {
  solar:     'Solar',
  home:      'Home',
  powerwall: 'Battery',
  grid:      'Grid',
  ev:        'EV',
};

// ── Default node positions ───────────────────────────────
const DEFAULT_NODES = {
  solar:     { left: 48, top: 20 },
  home:      { left: 55, top: 50 },
  powerwall: { left: 15, top: 60 },
  grid:      { left: 15, top: 25 },
  ev:        { left: 80, top: 65 },
};

// ── Default entity IDs (override in YAML) ────────────────
const DEFAULT_ENTITIES = {
  solar:         'sensor.solar_power',
  home:          'sensor.home_load',
  powerwall:     'sensor.battery_power',
  powerwall_pct: 'sensor.battery_level',
  grid:          'sensor.grid_power',
  ev_power:      'sensor.ev_charging_power',
  ev_pct:        'sensor.ev_battery_level',
};

// ── Node colours ─────────────────────────────────────────
const COLORS = {
  solar:     { r: 245, g: 200, b: 66  },
  home:      { r: 79,  g: 195, b: 247 },
  powerwall: { r: 102, g: 187, b: 106 },
  grid:      { r: 186, g: 104, b: 200 },
  ev:        { r: 38,  g: 198, b: 218 },
};

const TEMPLATE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;600;700&family=Share+Tech+Mono&display=swap');

  :host {
    display: block;
    width: 100%;
    height: 100%;
    --solar-color:     #f5c842;
    --home-color:      #4fc3f7;
    --powerwall-color: #66bb6a;
    --grid-color:      #ba68c8;
    --ev-color:        #26c6da;
    --font-main:       'Rajdhani', sans-serif;
    --font-mono:       'Share Tech Mono', monospace;
  }

  #scene {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    border-radius: var(--ha-card-border-radius, 12px);
  }

  #bg {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: contain;
    object-position: center center;
    filter: brightness(0.85) saturate(1.1);
    z-index: 0;
  }

  #scene::before {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 35%, rgba(0,5,15,0.25) 100%);
    z-index: 1;
    pointer-events: none;
  }

  #canvas {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    display: block;
    z-index: 2;
    pointer-events: none;
  }

  .node {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    z-index: 10;
    transform: translate(-50%, -50%);
    cursor: default;
  }

  .node-bubble {
    position: relative;
    width: 110px; height: 110px;
    border-radius: 12px;
    background: rgba(10, 14, 22, 0.4);
    border: 2px solid rgba(255,255,255,0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: border-color 0.4s, box-shadow 0.4s;
    gap: 2px;
    overflow: visible;
  }

  .node:hover .node-bubble {
    transform: scale(1.07);
    transition: transform 0.2s ease, border-color 0.4s, box-shadow 0.4s;
  }

  .node-icon  { width: 28px; height: 28px; display: block; }

  .node-label {
    font-family: var(--font-main);
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,0.65);
  }

  .node-value {
    font-family: var(--font-mono);
    font-size: 18px; font-weight: 400;
    color: #fff; line-height: 1;
  }

  .node-unit {
    font-family: var(--font-main);
    font-size: 11px; font-weight: 400;
    opacity: 0.85; margin-left: 2px;
  }

  .node-sub {
    font-family: var(--font-mono);
    font-size: 18px; font-weight: 400;
    letter-spacing: 0.06em;
    color: inherit;
  }

  /* ── Node colours ── */
  #node-solar     .node-bubble { border-color: rgba(245,200,66,0.5);  box-shadow: 0 0 0px 0px rgba(245,200,66,0);   }
  #node-home      .node-bubble { border-color: rgba(79,195,247,0.5);  box-shadow: 0 0 0px 0px rgba(79,195,247,0);   }
  #node-powerwall .node-bubble { border-color: rgba(102,187,106,0.5); box-shadow: 0 0 0px 0px rgba(102,187,106,0);  }
  #node-grid      .node-bubble { border-color: rgba(186,104,200,0.5); box-shadow: 0 0 0px 0px rgba(186,104,200,0);  }
  #node-ev        .node-bubble { border-color: rgba(38,198,218,0.5);  box-shadow: 0 0 0px 0px rgba(38,198,218,0);   }

  #node-solar.active     .node-bubble { border-color: rgba(245,200,66,0.9);  box-shadow: 0 0 20px 4px rgba(245,200,66,0.35);  }
  #node-home.active      .node-bubble { border-color: rgba(79,195,247,0.9);  box-shadow: 0 0 20px 4px rgba(79,195,247,0.35);  }
  #node-powerwall.active .node-bubble { border-color: rgba(102,187,106,0.9); box-shadow: 0 0 20px 4px rgba(102,187,106,0.35); }
  #node-grid.active      .node-bubble { border-color: rgba(186,104,200,0.9); box-shadow: 0 0 20px 4px rgba(186,104,200,0.35); }
  #node-ev.active        .node-bubble { border-color: rgba(38,198,218,0.9);  box-shadow: 0 0 20px 4px rgba(38,198,218,0.35);  }

  #node-solar     .node-icon  { color: #f5c842; }
  #node-home      .node-icon  { color: #4fc3f7; }
  #node-powerwall .node-icon  { color: #66bb6a; }
  #node-grid      .node-icon  { color: #ba68c8; }
  #node-ev        .node-icon  { color: #26c6da; }

  #node-solar     .node-value { color: #f5c842; }
  #node-home      .node-value { color: #4fc3f7; }
  #node-powerwall .node-value { color: #66bb6a; }
  #node-grid      .node-value { color: #ba68c8; }
  #node-ev        .node-value { color: #26c6da; }

  /* ── Battery gauge ── */
  .batt-gauge {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 18px; height: 64px;
    pointer-events: none;
  }
  #node-powerwall .batt-gauge { color: #66bb6a; right: -28px; left: auto; }
  #node-ev        .batt-gauge { color: #26c6da; left: -28px;  right: auto; }

  .gauge-nub {
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    width: 10px; height: 5px;
    border: 2px solid currentColor;
    border-bottom: none;
    border-radius: 2px 2px 0 0;
  }
  .gauge-body {
    position: absolute;
    top: 5px; left: 0; right: 0; bottom: 0;
    border: 2px solid currentColor;
    border-radius: 3px;
    overflow: hidden;
  }
  .gauge-fill {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: currentColor;
    opacity: 0.8;
    transition: height 0.8s ease;
  }

  /* ── Status bar ── */
  #status-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    z-index: 20;
    display: flex; align-items: center;
    justify-content: flex-start;
    padding: 8px 16px;
    background: rgba(5,8,16,0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid rgba(255,255,255,0.07);
    flex-wrap: wrap; gap: 8px;
  }

  .status-block { display: flex; align-items: center; gap: 8px; font-family: var(--font-main); }

  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #4caf50;
    box-shadow: 0 0 6px 2px rgba(76,175,80,0.6);
    flex-shrink: 0;
  }
  .status-dot.warn { background: #ff9800; box-shadow: 0 0 6px 2px rgba(255,152,0,0.6); }
  .status-dot.err  { background: #f44336; box-shadow: 0 0 6px 2px rgba(244,67,54,0.6); }

  .status-text { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.55); letter-spacing: 0.04em; }

  .status-divider {
    width: 1px; height: 16px;
    background: rgba(255,255,255,0.15);
    margin: 0 4px; flex-shrink: 0;
  }

  .flow-tag {
    font-family: var(--font-main);
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 20px;
    border: 1px solid transparent;
    opacity: 0.4;
    transition: opacity 0.4s, border-color 0.4s, color 0.4s;
  }
  .flow-tag.active { opacity: 1; }
  .flow-tag.solar  { color: #f5c842; border-color: rgba(245,200,66,0.5);  }
  .flow-tag.batt   { color: #66bb6a; border-color: rgba(102,187,106,0.5); }
  .flow-tag.grid   { color: #ba68c8; border-color: rgba(186,104,200,0.5); }
  .flow-tag.ev     { color: #26c6da; border-color: rgba(38,198,218,0.5);  }

  /* ── Pulse ring ── */
  @keyframes pulse-ring {
    0%   { transform: scale(1);   opacity: 0.7; }
    100% { transform: scale(1.7); opacity: 0;   }
  }
  .pulse-ring {
    position: absolute; inset: -2px;
    border-radius: 14px;
    border: 1px solid currentColor;
    pointer-events: none;
    opacity: 0;
    animation: none;
  }
  .node.active .pulse-ring {
    opacity: 0.7;
    animation: pulse-ring 1.8s ease-out infinite;
  }
</style>

<div id="scene">
  <img id="bg" src="" alt="">
  <canvas id="canvas"></canvas>

  <div class="node" id="node-solar">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#f5c842"></span>
      <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#f5c842"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <span class="node-label">Solar</span>
      <span class="node-value" id="val-solar">–</span>
    </div>
  </div>

  <div class="node" id="node-home">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#4fc3f7"></span>
      <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#4fc3f7"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
      <span class="node-label">Home</span>
      <span class="node-value" id="val-home">–</span>
    </div>
  </div>

  <div class="node" id="node-powerwall">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#66bb6a"></span>
      <div class="batt-gauge"><div class="gauge-nub"></div><div class="gauge-body"><div class="gauge-fill" id="gauge-battery-fill" style="height:0%"></div></div></div>
      <svg class="node-icon" id="batt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#66bb6a"><rect x="2" y="7" width="18" height="11" rx="2"/><path d="M22 11v3"/><line x1="6" y1="11" x2="6" y2="14" stroke-width="2.5"/><line x1="10" y1="11" x2="10" y2="14" stroke-width="2.5"/></svg>
      <span class="node-label">Battery</span>
      <span class="node-sub" id="val-batt-pct">–%</span>
      <span class="node-value" id="val-battery">–</span>
    </div>
  </div>

  <div class="node" id="node-grid">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#ba68c8"></span>
      <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#ba68c8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="rgba(186,104,200,0.2)"/></svg>
      <span class="node-label">Grid</span>
      <span class="node-value" id="val-grid">–</span>
      <span class="node-sub" id="val-grid-dir">idle</span>
    </div>
  </div>

  <div class="node" id="node-ev">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#26c6da"></span>
      <div class="batt-gauge"><div class="gauge-nub"></div><div class="gauge-body"><div class="gauge-fill" id="gauge-ev-fill" style="height:0%"></div></div></div>
      <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#26c6da"><rect x="1" y="10" width="22" height="8" rx="2"/><path d="M5 10V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><circle cx="7" cy="18" r="1.5" fill="currentColor"/><circle cx="17" cy="18" r="1.5" fill="currentColor"/><line x1="9" y1="13" x2="11" y2="13" stroke-width="2"/><line x1="13" y1="13" x2="15" y2="13" stroke-width="2"/></svg>
      <span class="node-label">EV</span>
      <span class="node-sub" id="val-ev-pct">–%</span>
      <span class="node-value" id="val-ev">–</span>
    </div>
  </div>

  <div id="status-bar">
    <div class="status-block">
      <div class="status-dot" id="status-dot"></div>
      <span class="status-text" id="status-text">Connecting…</span>
    </div>
    <div class="status-divider"></div>
    <span class="flow-tag solar" id="tag-solar-home">Solar → Home</span>
    <span class="flow-tag solar" id="tag-solar-batt">Solar → Battery</span>
    <span class="flow-tag solar" id="tag-solar-grid">Solar → Grid</span>
    <span class="flow-tag batt"  id="tag-batt-home">Battery → Home</span>
    <span class="flow-tag grid"  id="tag-grid-home">Grid → Home</span>
    <span class="flow-tag grid"  id="tag-grid-batt">Grid → Battery</span>
    <span class="flow-tag ev"    id="tag-solar-ev">Solar → EV</span>
    <span class="flow-tag ev"    id="tag-batt-ev">Battery → EV</span>
    <span class="flow-tag ev"    id="tag-grid-ev">Grid → EV</span>
  </div>
</div>
`;

class EnergyFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config   = {};
    this._hass     = null;
    this._tick     = 0;
    this._rafId    = null;
    this._rendered = false;
    this._state    = {
      solar: 0, home: 0, powerwall: 0, powerwallPct: 0,
      grid: 0, evPower: 0, evBattPct: 0,
      flows: {
        solarHome: false, solarBatt: false, solarGrid: false,
        battHome:  false, gridHome:  false,
        solarEv:   false, battEv:    false, gridEv: false,
      },
    };
  }

  // ── Lovelace lifecycle ─────────────────────────────────

  setConfig(config) {
    this._config = config;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
    this._applyPositions();
    this._updateBackground();
  }

  set hass(hass) {
    const wasNull = !this._hass;
    this._hass = hass;
    if (wasNull) this._startRender();
    if (this._rendered) this._updateFromHass();
  }

  connectedCallback()    { if (this._hass && !this._rafId) this._startRender(); }
  disconnectedCallback() { this._stopRender(); }
  getCardSize()          { return 6; }

  static getStubConfig() {
    return {
      background:     '/local/day.jpg',
      entities:       DEFAULT_ENTITIES,
      nodes:          DEFAULT_NODES,
      node_labels:    DEFAULT_LABELS,
      node_opacity:   0.4,
      node_animation: true,
    };
  }

  // ── Rendering ──────────────────────────────────────────

  _render() {
    this.shadowRoot.innerHTML = TEMPLATE;
  }

  _applyPositions() {
    const nodeCfg = Object.assign({}, DEFAULT_NODES, this._config.nodes || {});
    for (const [key, pos] of Object.entries(nodeCfg)) {
      const el = this.shadowRoot.getElementById('node-' + key);
      if (el) { el.style.left = pos.left + '%'; el.style.top = pos.top + '%'; }
    }
    const opacity = this._config.node_opacity !== undefined ? this._config.node_opacity : 0.4;
    this.shadowRoot.querySelectorAll('.node-bubble')
      .forEach(b => b.style.background = `rgba(10,14,22,${opacity})`);

    const animate = this._config.node_animation !== undefined ? this._config.node_animation : true;
    this.shadowRoot.querySelectorAll('.pulse-ring')
      .forEach(r => r.style.animationName = animate ? '' : 'none');

    this._applyLabels();
  }

  _applyLabels() {
    const labels = Object.assign({}, DEFAULT_LABELS, this._config.node_labels || {});
    for (const [key, label] of Object.entries(labels)) {
      const el = this.shadowRoot.querySelector(`#node-${key} .node-label`);
      if (el) el.textContent = label;
    }
  }

  _updateBackground() {
    const bg = this.shadowRoot.getElementById('bg');
    if (!bg) return;
    if (!this._hass) {
      bg.src = this._config.background || '';
      return;
    }
    const isDay      = this._hass.states['sun.sun']?.state === 'above_horizon';
    const wxEntity   = this._config.weather_entity || 'weather.home';
    const wx         = this._hass.states[wxEntity]?.state || '';
    const isLightRain = ['rainy', 'snowy-rainy', 'hail', 'lightning-rainy'].includes(wx);
    const isHeavyRain = wx === 'pouring';

    let src;
    if (isDay) {
      if (isHeavyRain)      src = this._config.background_day_heavy_rain;
      else if (isLightRain) src = this._config.background_day_rain;
      else                  src = this._config.background;
    } else {
      if (isHeavyRain)      src = this._config.background_night_heavy_rain;
      else if (isLightRain) src = this._config.background_night_rain;
      else                  src = this._config.background_night || this._config.background;
    }
    bg.src = src || this._config.background || '';
  }

  // ── State updates ──────────────────────────────────────

  _val(key) {
    const entities = Object.assign({}, DEFAULT_ENTITIES, this._config.entities || {});
    const id = entities[key];
    if (!id || !this._hass) return 0;
    const s = this._hass.states[id];
    return s ? parseFloat(s.state) || 0 : 0;
  }

  _updateFromHass() {
    if (!this._hass || !this._rendered) return;

    const solar        = this._val('solar');
    const home         = this._val('home');
    const powerwall    = this._val('powerwall');
    const powerwallPct = this._val('powerwall_pct');
    const grid         = this._val('grid');
    const evPower      = this._val('ev_power');
    const evBattPct    = this._val('ev_pct');

    const s             = this._state;
    s.solar = solar; s.home = home; s.powerwall = powerwall;
    s.powerwallPct = powerwallPct; s.grid = grid;
    s.evPower = evPower; s.evBattPct = evBattPct;

    const solarActive   = solar    >  THRESHOLD_SOLAR;
    const battCharging  = powerwall < -THRESHOLD_BATTERY;
    const battDischarge = powerwall >  THRESHOLD_BATTERY;
    const gridImport    = grid     >  THRESHOLD_GRID;
    const gridExport    = grid     < -THRESHOLD_GRID;
    const evCharging    = evPower  >  THRESHOLD_EV;

    s.flows = {
      solarHome: solarActive  && home > THRESHOLD_HOME,
      solarBatt: solarActive  && battCharging && !gridImport,
      solarGrid: solarActive  && gridExport,
      battHome:  battDischarge,
      gridHome:  gridImport   && !battCharging,
      gridBatt:  gridImport   && battCharging,
      solarEv:   evCharging   && solarActive && !gridImport,
      battEv:    evCharging   && battDischarge,
      gridEv:    evCharging   && gridImport,
    };

    const sr    = this.shadowRoot;
    const fmtKw = v => `${Math.abs(v) < 0.01 ? '0.00' : Math.abs(v).toFixed(2)}<span class="node-unit">kW</span>`;

    sr.getElementById('val-solar').innerHTML      = fmtKw(solar);
    sr.getElementById('val-home').innerHTML       = fmtKw(home);
    sr.getElementById('val-battery').innerHTML    = fmtKw(powerwall);
    const battPctEl = sr.getElementById('val-batt-pct');
    if (battPctEl) battPctEl.textContent = Number(powerwallPct).toFixed(1) + '%';
    sr.getElementById('val-grid').innerHTML       = fmtKw(grid);
    sr.getElementById('val-grid-dir').textContent = gridImport ? 'importing' : gridExport ? 'exporting' : 'idle';
    sr.getElementById('val-ev').innerHTML         = fmtKw(evPower);
    sr.getElementById('val-ev-pct').textContent   = evBattPct.toFixed(0) + '%';

    const battIconEl = sr.getElementById('batt-icon');
    if (battIconEl) {
      if (battCharging) {
        battIconEl.innerHTML = '<rect x="2" y="7" width="18" height="11" rx="2"/><path d="M22 11v3"/><polygon points="12 9 8 14 12 14 10 18 16 12 12 12 14 9" fill="rgba(102,187,106,0.8)" stroke-width="1"/>';
      } else if (battDischarge) {
        battIconEl.innerHTML = '<rect x="2" y="7" width="18" height="11" rx="2"/><path d="M22 11v3"/><line x1="7" y1="12.5" x2="15" y2="12.5" stroke-width="2.5"/><polyline points="12 10 15 12.5 12 15" stroke-width="2"/>';
      } else {
        battIconEl.innerHTML = '<rect x="2" y="7" width="18" height="11" rx="2"/><path d="M22 11v3"/><line x1="6" y1="11" x2="6" y2="14" stroke-width="2.5"/><line x1="10" y1="11" x2="10" y2="14" stroke-width="2.5"/>';
      }
    }
    sr.getElementById('gauge-battery-fill').style.height = Math.min(Math.max(powerwallPct, 0), 100) + '%';
    sr.getElementById('gauge-ev-fill').style.height      = Math.min(Math.max(evBattPct,    0), 100) + '%';

    this._toggleActive('node-solar',     solarActive);
    this._toggleActive('node-home',      home > THRESHOLD_HOME);
    this._toggleActive('node-powerwall', battCharging || battDischarge);
    this._toggleActive('node-grid',      gridImport || gridExport);
    this._toggleActive('node-ev',        evCharging);

    this._setTag('tag-solar-home', s.flows.solarHome);
    this._setTag('tag-solar-batt', s.flows.solarBatt);
    this._setTag('tag-solar-grid', s.flows.solarGrid);
    this._setTag('tag-batt-home',  s.flows.battHome);
    this._setTag('tag-grid-home',  s.flows.gridHome);
    this._setTag('tag-grid-batt',  s.flows.gridBatt);
    this._setTag('tag-solar-ev',   s.flows.solarEv);
    this._setTag('tag-batt-ev',    s.flows.battEv);
    this._setTag('tag-grid-ev',    s.flows.gridEv);

    sr.getElementById('status-dot').className    = 'status-dot';
    sr.getElementById('status-text').textContent = 'Live';

    this._updateBackground();
  }

  _toggleActive(id, on) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.classList.toggle('active', !!on);
  }

  _setTag(id, on) {
    const el = this.shadowRoot.getElementById(id);
    if (el) el.classList.toggle('active', !!on);
  }

  // ── Canvas animation ───────────────────────────────────

  _startRender() {
    if (this._rafId) return;
    const loop = () => {
      this._drawCanvas();
      this._tick += 0.016;
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRender() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  _rectEdge(from, to, hw, hh) {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (!dx && !dy) return from;
    const scale = Math.min(
      dx ? hw / Math.abs(dx) : Infinity,
      dy ? hh / Math.abs(dy) : Infinity
    );
    return { x: from.x + dx * scale, y: from.y + dy * scale };
  }

  _nodeCenter(id) {
    const scene = this.shadowRoot.getElementById('scene');
    const el    = this.shadowRoot.getElementById('node-' + id);
    if (!scene || !el) return { x: 0, y: 0 };
    const sr = scene.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return { x: er.left + er.width / 2 - sr.left, y: er.top + er.height / 2 - sr.top };
  }

  _rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

  _drawFlow(ctx, from, to, cFrom, cTo, active, power) {
    if (!active) return;
    const p0f = this._nodeCenter(from);
    const p3f = this._nodeCenter(to);
    const p0  = this._rectEdge(p0f, p3f, 55, 55);
    const p3  = this._rectEdge(p3f, p0f, 55, 55);
    const dx  = p3.x - p0.x, dy = p3.y - p0.y;
    if (Math.sqrt(dx*dx + dy*dy) < 10) return;

    const cp1 = { x: p0.x + dx*0.4, y: p0.y + dy*0.1 };
    const cp2 = { x: p0.x + dx*0.6, y: p3.y - dy*0.1 };
    const cf  = COLORS[cFrom], ct = COLORS[cTo];

    const speed  = Math.min(Math.max(Math.abs(power) * 8, 3), 22);
    const offset = -(this._tick * speed) % 24;
    const grad   = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
    grad.addColorStop(0,   this._rgba(cf, 0.9));
    grad.addColorStop(0.5, this._rgba(ct, 0.75));
    grad.addColorStop(1,   this._rgba(ct, 0.9));

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p3.x, p3.y);
    ctx.strokeStyle = grad; ctx.lineWidth = 3.5;
    ctx.setLineDash([14, 10]); ctx.lineDashOffset = offset;
    ctx.stroke(); ctx.setLineDash([]);

    const t  = ((this._tick * speed * 0.004) % 1 + 1) % 1, mt = 1 - t;
    const pt = {
      x: mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p3.y,
    };
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = this._rgba(cf, 1); ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }

  _drawCanvas() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const scene = this.shadowRoot.getElementById('scene');
    const w = scene ? scene.offsetWidth  : canvas.clientWidth;
    const h = scene ? scene.offsetHeight : canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const f = this._state.flows, s = this._state;
    this._drawFlow(ctx, 'solar',     'powerwall', 'solar',     'powerwall', f.solarBatt, s.solar);
    this._drawFlow(ctx, 'solar',     'grid',      'solar',     'grid',      f.solarGrid, s.solar);
    this._drawFlow(ctx, 'grid',      'home',      'grid',      'home',      f.gridHome,  Math.abs(s.grid));
    this._drawFlow(ctx, 'grid',      'powerwall', 'grid',      'powerwall', f.gridBatt,  Math.abs(s.grid));
    this._drawFlow(ctx, 'powerwall', 'home',      'powerwall', 'home',      f.battHome,  Math.abs(s.powerwall));
    this._drawFlow(ctx, 'solar',     'home',      'solar',     'home',      f.solarHome, s.solar);
    this._drawFlow(ctx, 'solar',     'ev',        'solar',     'ev',        f.solarEv,   s.solar);
    this._drawFlow(ctx, 'powerwall', 'ev',        'powerwall', 'ev',        f.battEv,    Math.abs(s.powerwall));
    this._drawFlow(ctx, 'grid',      'ev',        'grid',      'ev',        f.gridEv,    Math.abs(s.grid));
  }
}

customElements.define('energy-flow-card', EnergyFlowCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'energy-flow-card',
  name:        'Energy Flow Card',
  description: 'Animated energy flow visualiser for Solar, Battery, Grid and EV',
  preview:     false,
});
