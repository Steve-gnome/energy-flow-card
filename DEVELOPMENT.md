# Development & Deployment Notes

Internal notes for developing and releasing **energy-flow-card**.
User-facing documentation lives in [README.md](README.md).

## Architecture

- Single-file custom Lovelace card (`energy-flow-card.js`, repo root), rendered inside a shadow DOM.
- Animated bezier flow lines drawn on an HTML5 `<canvas>` between the Solar / Home / Battery / Grid / EV nodes.
- Ships a visual config editor (`EnergyFlowCardEditor`) covering entities, labels, node positions, thresholds, background images and per-node tap actions.

## Power-allocation model

Flows are derived from a **source → sink waterfall**, not directly from raw sensor signs.
Sources (solar generation, battery discharge, grid import) are allocated to sinks
(home, EV, battery charge, grid export) in priority order — **home → EV → battery
charge → grid export** — while tracking the remaining capacity of each source. This
lets one source feed several sinks without double-counting, so (for example) the
battery can supply the home **and** export to the grid in the same frame.

Supported flows: solar→home, solar→battery, solar→grid, battery→home, battery→grid,
battery→EV, grid→home, grid→battery, grid→EV, solar→EV.

## Sensor sign conventions

Entities are configurable, but the card assumes these signs:

| Sensor        | Positive    | Negative  |
|---------------|-------------|-----------|
| Battery power | discharging | charging  |
| Grid power    | importing   | exporting |

## Features

- Source→sink power-allocation waterfall with per-flow kW status-bar chips.
- Aspect-ratio config (`aspect_ratio`, default `16 / 9`) plus `getGridOptions()` for the sections view.
- Dynamic battery MDI icons by state-of-charge (10% steps); battery % shown as whole integers.
- Weather/time background switching (day / night + rain / heavy-rain variants).
- Per-node tap actions (`node_actions`): a leading `/` navigates via `history.pushState`; anything else opens in a new tab.
- Cross-platform time handling via `Intl.DateTimeFormat.formatToParts` (WKWebView / iOS-safe).

## Release & deployment (HACS)

The card is distributed through HACS. **HACS installs from the latest release tag, not
from `main`.** To ship a change:

1. Edit `energy-flow-card.js`.
2. Push to `main`.
3. **Publish a new release** — bump the tag (e.g. `v1.0.x`), target `main`, **attach no asset**.
4. In Home Assistant: **HACS → Energy Flow Card → Update**, then refresh the dashboard once.

On Update, HACS rewrites the served `.js` and a matching `.gz`, and bumps the dashboard
resource's `?hacstag` query (automatic cache-busting).

## Gotchas

- **Pushing to `main` alone does nothing** — HACS only sees a new version when a new release tag is published.
- **Pre-compressed `.gz` shadowing:** when an `energy-flow-card.js.gz` sits next to the `.js`, Home Assistant serves the `.gz` to any gzip-capable browser, hiding edits made directly to the `.js`. HACS regenerates a matching `.gz` on Update, which is why releasing through HACS is the supported path and hand-editing the deployed file is not.
- **Don't attach a stale `.js` as a release asset.** A release asset overrides the source file, so a leftover old copy will re-break the card. No-asset releases are simplest — HACS pulls the file from the tagged source.
- **Service-worker caching:** the Home Assistant frontend caches `/hacsfiles/` assets by URL. A plain hard-refresh is often not enough; the fresh `?hacstag` HACS assigns on Update is what reliably busts it.

## Known issues

- Under some conditions the home-load figure may already include EV load; if flows look
  off, sanity-check the configured sensors against an overall energy balance
  (sources in = sinks out).
