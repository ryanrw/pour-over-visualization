# Pour-over Visualization

Single-file web app (`index.html`) showing a 2.5D cutaway of a pour-over dripper from bloom to drawdown: coarse vs fines agitation per pour, and color-coded extraction (sour / sweet / bitter / astringent / burnt). UI text is Thai.

## Deploy
- Repo: `ryanrw/pour-over-visualization` (branch `main`)
- Vercel project: `pour-over-visualization` in team `ryanwillpowers-projects`
- Prod URL: https://pour-over-visualization.vercel.app
- No build step. Push to `main` → Vercel deploys `index.html` as a static page.

## Structure (all inside index.html)
- `<style>`: theme tokens on `:root` (light + dark via `prefers-color-scheme` / `data-theme`). Fonts: Anuphan (body), Chakra Petch (headings/numbers) from Google Fonts.
- `<script id="sim">`: pure simulation, no DOM. Can be tested in Node by extracting this script.
  - `COMP`: 5 compounds with rate `k`, temp sensitivity `sens`, soluble mass `S`, color.
  - `PERC`: perceived-intensity weights used for taste shares.
  - `DRIPPERS`, `FILTERS`, `GRIND`, `PROCESS`: config tables (geometry, flow factors, availability `A`, recommended temp).
  - `simulate(cfg)`: 0.5 s ticks. Tracks free water, absorbed water (2× dose), agitation, fines migration (clogs flow), first-order extraction per compound for main particles and fines, and mass balance of dissolved solids → cup. Returns `steps` (bloom / pour / drawdown) and `frames`.
  - `shares(arr)`: perceived taste share.
- Second `<script>`: canvas rendering + UI.
  - Virtual scene 470×520, scaled to the `.viz` box. Cone geometry `geom.w(y)`, volume→height lookup `volToH`.
  - Particles in cylindrical coords (r, θ, y), projected with a 0.3 vertical squash. Agitation field: down in the center, up along walls, plus swirl. Fines settle toward the bottom as `mig` grows.
  - Effects: compound "wisps", CO₂ bubbles in bloom, drips, ripples, kettle stream.
  - Server shows stacked layers per step (intentionally unmixed for teaching).
  - Playback: default is step-by-step (prev/next/timeline plays one step then stops). "เล่นทั้งหมด" (`playAll`) runs through to the end. Step duration `animDur = clamp(simSeconds/3.5, 8, 26)` real seconds at 1×.

## Decisions to keep
- Dose fixed at 15 g. Ratio options 1:5, 1:10, 1:15, 1:20.
- Pours 1–10 including bloom. Pours = 1 means a single pour with all water (no separate bloom).
- Default temp is 90 °C even though Natural recommends 88 °C (user's request). Choosing a process auto-sets its recommended temp.
- Switch drippers: valve closed during bloom (immersion, held to 45 s), open afterwards.
- CT-62 and UFO v3 geometry/flow are approximations, not measured specs.
- Model is conceptual; EY/TDS are for showing direction of change, not real values.

## Planned refactor (do this first, before new features)
The project is going to be developed seriously, so split the single file before adding features:
- `index.html`: markup only, loads the files below.
- `src/style.css`: all CSS, keep the theme tokens on `:root`.
- `src/sim.js`: everything currently in `<script id="sim">`. Pure functions, no DOM, export `simulate`, `shares` and the config tables (ES modules).
- `src/render.js`: canvas drawing (dripper, particles, effects, server, kettle).
- `src/ui.js`: controls, timeline, panel text (`narrate`, `verdict`), playback state.
- `test/sim.test.js`: tests for `simulate()` using Node's built-in test runner (`node --test`), no extra dependencies unless needed.

Refactor rules:
- Behavior and visuals must stay identical. Compare screenshots before and after (desktop and ~390 px mobile).
- Lock in current numbers first: write tests for the reference configs below before moving code, then confirm they still pass after.
- Keep it a static site with no build step unless a build step becomes clearly necessary. Ask before adding a bundler or framework.
- Commit in small steps (one file extraction per commit) so each step can be reverted.

## Working guidelines
- Run `node --test` after any change to `sim.js`.
- Physics/extraction constants live in the config tables at the top of `sim.js`. Change them there, not inline.
- When changing model behavior, state which reference numbers move and why.
- UI copy is Thai. Keep new UI text in Thai and consistent with existing wording.
- Don't reintroduce auto-advance as the default: step-by-step is intentional.

## Testing
- Reference configs (default = V60 dripper, V60 filter, 3 pours, medium, 90 °C, bloom 2×, 1:15, natural):
  - default → EY ~19%, total time ~2:30
  - default + fine grind + 94 °C → EY ~22–23%, astringent/burnt shares go up
  - default + coarse grind + 86 °C → EY ~14%, sour-led
  - Hario Switch → valve closed through bloom (45 s), no drain during bloom
  - ratio 1:5 → low EY (high TDS); pours = 1 → single step + drawdown
- Until the refactor is done: extract `<script id="sim">` and run `simulate()` in Node.
- Visual check: open `index.html` in a browser (desktop and ~390 px mobile width).
