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
 * # Card aspect ratio (width / height). Controls how tall the card grows
 * # as it gets wider, e.g. with the "full width" layout option. Set this
 * # to match the aspect ratio of your background images to avoid them
 * # being cropped top/bottom (default 16 / 9).
 * aspect_ratio: 16 / 9
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
 *
 * # Flow thresholds (kW) — minimum power to show a flow line
 * threshold_solar:   0.05
 * threshold_home:    0.05
 * threshold_battery: 0.03
 * threshold_grid:    0.40
 * threshold_ev:      0.05
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

// ── Default aspect ratio (width / height) ────────────────
const DEFAULT_ASPECT_RATIO = '16 / 9';

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
    height: auto;
    aspect-ratio: var(--efc-aspect-ratio, 16 / 9);
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
    object-fit: cover;
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

  .node-icon  { width: 36px; height: 36px; display: block; --mdc-icon-size: 36px; }

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
      <ha-icon class="node-icon" icon="mdi:solar-power-variant"></ha-icon>
      <span class="node-label">Solar</span>
      <span class="node-value" id="val-solar">–</span>
    </div>
  </div>

  <div class="node" id="node-home">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#4fc3f7"></span>
      <ha-icon class="node-icon" icon="mdi:home-lightning-bolt"></ha-icon>
      <span class="node-label">Home</span>
      <span class="node-value" id="val-home">–</span>
    </div>
  </div>

  <div class="node" id="node-powerwall">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#66bb6a"></span>
      <div class="batt-gauge"><div class="gauge-nub"></div><div class="gauge-body"><div class="gauge-fill" id="gauge-battery-fill" style="height:0%"></div></div></div>
      <ha-icon class="node-icon" id="batt-icon" icon="mdi:battery-medium"></ha-icon>
      <span class="node-label">Battery</span>
      <span class="node-sub" id="val-batt-pct">–%</span>
      <span class="node-value" id="val-battery">–</span>
    </div>
  </div>

  <div class="node" id="node-grid">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#ba68c8"></span>
      <ha-icon class="node-icon" icon="mdi:transmission-tower"></ha-icon>
      <span class="node-label">Grid</span>
      <span class="node-value" id="val-grid">–</span>
      <span class="node-sub" id="val-grid-dir">idle</span>
    </div>
  </div>

  <div class="node" id="node-ev">
    <div class="node-bubble">
      <span class="pulse-ring" style="color:#26c6da"></span>
      <div class="batt-gauge"><div class="gauge-nub"></div><div class="gauge-body"><div class="gauge-fill" id="gauge-ev-fill" style="height:0%"></div></div></div>
      <ha-icon class="node-icon" icon="mdi:car-electric"></ha-icon>
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

  static getConfigElement() {
    return document.createElement('energy-flow-card-editor');
  }

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
    const ratio = this._config.aspect_ratio || DEFAULT_ASPECT_RATIO;
    this.style.setProperty('--efc-aspect-ratio', ratio);

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

  _thresholds() {
    const c = this._config;
    return {
      solar:   c.threshold_solar   !== undefined ? c.threshold_solar   : THRESHOLD_SOLAR,
      home:    c.threshold_home    !== undefined ? c.threshold_home    : THRESHOLD_HOME,
      battery: c.threshold_battery !== undefined ? c.threshold_battery : THRESHOLD_BATTERY,
      grid:    c.threshold_grid    !== undefined ? c.threshold_grid    : THRESHOLD_GRID,
      ev:      c.threshold_ev      !== undefined ? c.threshold_ev      : THRESHOLD_EV,
    };
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

    const t = this._thresholds();
    const solarActive   = solar    >  t.solar;
    const battCharging  = powerwall < -t.battery;
    const battDischarge = powerwall >  t.battery;
    const gridImport    = grid     >  t.grid;
    const gridExport    = grid     < -t.grid;
    const evCharging    = evPower  >  t.ev;

    // Allocate home's load across sources (solar first, then battery
    // discharge, with anything left over coming from the grid). This lets
    // grid -> home show up even while the battery/EV are also drawing
    // from the grid at the same time.
    const solarToHome   = Math.min(Math.max(solar, 0), home);
    const battToHome    = battDischarge ? Math.min(powerwall, Math.max(home - solarToHome, 0)) : 0;
    const homeShortfall = home - solarToHome - battToHome;

    s.flows = {
      solarHome: solarActive  && solarToHome > t.home,
      solarBatt: solarActive  && battCharging && !gridImport,
      solarGrid: solarActive  && gridExport,
      battHome:  battDischarge && battToHome > t.home,
      gridHome:  gridImport   && homeShortfall > t.home,
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
      const pct = Math.round(powerwallPct / 10) * 10;
      let icon;
      if (battCharging) {
        icon = pct <= 10 ? 'mdi:battery-charging-10' :
               pct <= 20 ? 'mdi:battery-charging-20' :
               pct <= 30 ? 'mdi:battery-charging-30' :
               pct <= 40 ? 'mdi:battery-charging-40' :
               pct <= 50 ? 'mdi:battery-charging-50' :
               pct <= 60 ? 'mdi:battery-charging-60' :
               pct <= 70 ? 'mdi:battery-charging-70' :
               pct <= 80 ? 'mdi:battery-charging-80' :
               pct <= 90 ? 'mdi:battery-charging-90' : 'mdi:battery-charging-100';
      } else {
        icon = pct <= 10 ? 'mdi:battery-10' :
               pct <= 20 ? 'mdi:battery-20' :
               pct <= 30 ? 'mdi:battery-30' :
               pct <= 40 ? 'mdi:battery-40' :
               pct <= 50 ? 'mdi:battery-50' :
               pct <= 60 ? 'mdi:battery-60' :
               pct <= 70 ? 'mdi:battery-70' :
               pct <= 80 ? 'mdi:battery-80' :
               pct <= 90 ? 'mdi:battery-90' : 'mdi:battery';
      }
      battIconEl.setAttribute('icon', icon);
    }
    sr.getElementById('gauge-battery-fill').style.height = Math.min(Math.max(powerwallPct, 0), 100) + '%';
    sr.getElementById('gauge-ev-fill').style.height      = Math.min(Math.max(evBattPct,    0), 100) + '%';

    this._toggleActive('node-solar',     solarActive);
    this._toggleActive('node-home',      home > t.home);
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

// ── Visual config editor ─────────────────────────────────────────────────────

class EnergyFlowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }

  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  _render() {
    const c    = this._config;
    const ent  = c.entities    || {};
    const npos = c.nodes       || {};
    const nlbl = c.node_labels || {};

    const NODE_KEYS = ['solar','home','powerwall','grid','ev'];
    const ENT_KEYS  = ['solar','home','powerwall','powerwall_pct','grid','ev_power','ev_pct'];
    const ENT_LABELS = {
      solar:         'Solar power',
      home:          'Home load',
      powerwall:     'Battery power',
      powerwall_pct: 'Battery level (%)',
      grid:          'Grid power',
      ev_power:      'EV power',
      ev_pct:        'EV battery level (%)',
    };
    const DEF_ENT = {
      solar:         'sensor.solar_power',
      home:          'sensor.home_load',
      powerwall:     'sensor.battery_power',
      powerwall_pct: 'sensor.battery_level',
      grid:          'sensor.grid_power',
      ev_power:      'sensor.ev_charging_power',
      ev_pct:        'sensor.ev_battery_level',
    };
    const DEF_LBL = { solar:'Solar', home:'Home', powerwall:'Battery', grid:'Grid', ev:'EV' };
    const DEF_POS = {
      solar:     { left:48, top:20 }, home: { left:55, top:50 },
      powerwall: { left:15, top:60 }, grid: { left:15, top:25 }, ev: { left:80, top:65 },
    };

    const entRows = ENT_KEYS.map(k => `
      <label>${ENT_LABELS[k]}
        <input data-ent="${k}" type="text" value="${ent[k] || ''}" placeholder="${DEF_ENT[k]}" />
      </label>`).join('');

    const lblRows = NODE_KEYS.map(k => `
      <label>${DEF_LBL[k]}
        <input data-lbl="${k}" type="text" value="${nlbl[k] || ''}" placeholder="${DEF_LBL[k]}" />
      </label>`).join('');

    const posRows = NODE_KEYS.map(k => `
      <label>${DEF_LBL[k]} left (%)
        <input data-pos="${k}" data-axis="left" type="number" min="0" max="100"
          value="${npos[k] !== undefined ? npos[k].left : DEF_POS[k].left}" />
      </label>
      <label>${DEF_LBL[k]} top (%)
        <input data-pos="${k}" data-axis="top" type="number" min="0" max="100"
          value="${npos[k] !== undefined ? npos[k].top : DEF_POS[k].top}" />
      </label>`).join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        h4 {
          margin: 16px 0 6px; font-size: 12px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--secondary-text-color);
          border-bottom: 1px solid var(--divider-color); padding-bottom: 4px;
        }
        .grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; }
        label  { display: flex; flex-direction: column; font-size: 12px; color: var(--primary-text-color); gap: 4px; }
        input[type=text], input[type=number] {
          padding: 6px 8px; border-radius: 4px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 13px; width: 100%; box-sizing: border-box;
        }
        input:focus { outline: 2px solid var(--primary-color); border-color: transparent; }
        input[type=range] { width: 100%; margin-top: 4px; }
        .range-row { display: flex; align-items: center; gap: 8px; }
        .range-val { font-size: 13px; min-width: 34px; color: var(--primary-text-color); }
        .toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 0; font-size: 13px; color: var(--primary-text-color);
        }
        input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; }
      </style>

      <h4>Background images</h4>
      <div class="grid">
        <label>Day
          <input id="bg" type="text" value="${c.background || ''}" placeholder="/local/day.jpg" />
        </label>
        <label>Night
          <input id="bg_night" type="text" value="${c.background_night || ''}" placeholder="/local/night.jpg" />
        </label>
        <label>Day rain
          <input id="bg_day_rain" type="text" value="${c.background_day_rain || ''}" placeholder="/local/day-rain.jpg" />
        </label>
        <label>Night rain
          <input id="bg_night_rain" type="text" value="${c.background_night_rain || ''}" placeholder="/local/night-rain.jpg" />
        </label>
        <label>Day heavy rain
          <input id="bg_day_heavy" type="text" value="${c.background_day_heavy_rain || ''}" placeholder="/local/day-heavy-rain.jpg" />
        </label>
        <label>Night heavy rain
          <input id="bg_night_heavy" type="text" value="${c.background_night_heavy_rain || ''}" placeholder="/local/night-heavy-rain.jpg" />
        </label>
      </div>
      <label>Weather entity
        <input id="weather_entity" type="text" value="${c.weather_entity || ''}" placeholder="weather.home" />
      </label>

      <h4>Appearance</h4>
      <label>Aspect ratio (width / height)
        <input id="aspect_ratio" type="text" value="${c.aspect_ratio || ''}" placeholder="16 / 9" />
      </label>
      <label>Node opacity
        <div class="range-row">
          <input id="node_opacity" type="range" min="0" max="1" step="0.05"
            value="${c.node_opacity !== undefined ? c.node_opacity : 0.4}" />
          <span class="range-val" id="opacity-val">${c.node_opacity !== undefined ? c.node_opacity : 0.4}</span>
        </div>
      </label>
      <div class="toggle-row">
        <span>Node pulse animation</span>
        <input id="node_animation" type="checkbox" ${c.node_animation !== false ? 'checked' : ''} />
      </div>

      <h4>Entity IDs</h4>
      <div class="grid">${entRows}</div>

      <h4>Node labels</h4>
      <div class="grid3">${lblRows}</div>

      <h4>Node positions (% of card width / height)</h4>
      <div class="grid">${posRows}</div>

      <h4>Thresholds (kW)</h4>
      <div class="grid">
        <label>Solar
          <input data-thr="solar" type="number" min="0" step="0.01"
            value="${c.threshold_solar   !== undefined ? c.threshold_solar   : 0.05}" />
        </label>
        <label>Home
          <input data-thr="home" type="number" min="0" step="0.01"
            value="${c.threshold_home    !== undefined ? c.threshold_home    : 0.05}" />
        </label>
        <label>Battery
          <input data-thr="battery" type="number" min="0" step="0.01"
            value="${c.threshold_battery !== undefined ? c.threshold_battery : 0.03}" />
        </label>
        <label>Grid
          <input data-thr="grid" type="number" min="0" step="0.01"
            value="${c.threshold_grid    !== undefined ? c.threshold_grid    : 0.40}" />
        </label>
        <label>EV
          <input data-thr="ev" type="number" min="0" step="0.01"
            value="${c.threshold_ev      !== undefined ? c.threshold_ev      : 0.05}" />
        </label>
      </div>
    `;

    const fire = () => this._fire(this._buildConfig());

    ['bg','bg_night','bg_day_rain','bg_day_heavy','bg_night_rain','bg_night_heavy','weather_entity','aspect_ratio']
      .forEach(id => this.shadowRoot.getElementById(id).addEventListener('change', fire));

    const opEl  = this.shadowRoot.getElementById('node_opacity');
    const opVal = this.shadowRoot.getElementById('opacity-val');
    opEl.addEventListener('input',  () => { opVal.textContent = parseFloat(opEl.value).toFixed(2); });
    opEl.addEventListener('change', fire);

    this.shadowRoot.getElementById('node_animation').addEventListener('change', fire);

    this.shadowRoot.querySelectorAll('[data-ent]').forEach(el => el.addEventListener('change', fire));
    this.shadowRoot.querySelectorAll('[data-lbl]').forEach(el => el.addEventListener('change', fire));
    this.shadowRoot.querySelectorAll('[data-pos]').forEach(el => el.addEventListener('change', fire));
    this.shadowRoot.querySelectorAll('[data-thr]').forEach(el => el.addEventListener('change', fire));
  }

  _buildConfig() {
    const sr  = this.shadowRoot;
    const cfg = { ...this._config };

    const bgMap = [
      ['bg',             'background'],
      ['bg_night',       'background_night'],
      ['bg_day_rain',    'background_day_rain'],
      ['bg_day_heavy',   'background_day_heavy_rain'],
      ['bg_night_rain',  'background_night_rain'],
      ['bg_night_heavy', 'background_night_heavy_rain'],
      ['weather_entity', 'weather_entity'],
      ['aspect_ratio',   'aspect_ratio'],
    ];
    bgMap.forEach(([id, key]) => {
      const val = sr.getElementById(id).value.trim();
      if (val) cfg[key] = val; else delete cfg[key];
    });

    cfg.node_opacity   = parseFloat(sr.getElementById('node_opacity').value);
    cfg.node_animation = sr.getElementById('node_animation').checked;

    const entities = {};
    sr.querySelectorAll('[data-ent]').forEach(el => {
      const val = el.value.trim();
      if (val) entities[el.dataset.ent] = val;
    });
    if (Object.keys(entities).length) cfg.entities = entities; else delete cfg.entities;

    const labels = {};
    sr.querySelectorAll('[data-lbl]').forEach(el => {
      const val = el.value.trim();
      if (val) labels[el.dataset.lbl] = val;
    });
    if (Object.keys(labels).length) cfg.node_labels = labels; else delete cfg.node_labels;

    const nodes = {};
    sr.querySelectorAll('[data-pos]').forEach(el => {
      const key  = el.dataset.pos;
      const axis = el.dataset.axis;
      if (!nodes[key]) nodes[key] = {};
      nodes[key][axis] = parseFloat(el.value);
    });
    if (Object.keys(nodes).length) cfg.nodes = nodes; else delete cfg.nodes;

    const THR_DEFAULTS = { solar: 0.05, home: 0.05, battery: 0.03, grid: 0.40, ev: 0.05 };
    this.shadowRoot.querySelectorAll('[data-thr]').forEach(el => {
      const key = el.dataset.thr;
      const val = parseFloat(el.value);
      const cfgKey = 'threshold_' + key;
      if (!isNaN(val) && val !== THR_DEFAULTS[key]) cfg[cfgKey] = val;
      else delete cfg[cfgKey];
    });

    return cfg;
  }

  _fire(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

customElements.define('energy-flow-card-editor', EnergyFlowCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'energy-flow-card',
  name:        'Energy Flow Card',
  description: 'Animated energy flow visualiser for Solar, Battery, Grid and EV',
  preview:     false,
});
