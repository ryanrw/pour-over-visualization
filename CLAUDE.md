# Pour-over Visualization

Static web app (no build step) showing a 2.5D cutaway of a pour-over dripper from bloom to drawdown: coarse vs fines agitation per pour, and color-coded extraction (sour / sweet / bitter / astringent / burnt). UI text is Thai.

## Deploy
- Repo: `ryanrw/pour-over-visualization` (branch `main`)
- Vercel project: `pour-over-visualization` in team `ryanwillpowers-projects`
- Prod URL: https://pour-over-visualization.vercel.app
- No build step. Push to `main` → Vercel serves `index.html` + `src/` as static files.

## Structure
- `index.html`: markup only. Loads `src/style.css` and `src/ui.js` (ES module). Head has description, favicon, and Open Graph / Twitter card meta (absolute URLs to the prod domain).
- `assets/`: `favicon.svg` (coffee cup) with PNG fallbacks (`favicon-32.png`, `apple-touch-icon.png`), and `og-image.png` (1200×630 link preview: title + a mid-pour capture of the canvas). The preview is a static screenshot; regenerate it if the scene's look changes a lot.
- `src/style.css`: theme tokens on `:root` (light + dark via `prefers-color-scheme` / `data-theme`). Fonts: Anuphan (body), Chakra Petch (headings/numbers) from Google Fonts.
- `src/sim.js`: pure simulation, no DOM. Exports `DOSE`, the config tables, `simulate`, `shares`.
  - `COMP`: 5 compounds with rate `k`, temp sensitivity `sens`, soluble mass `S`, color.
  - `PERC`: perceived-intensity weights used for taste shares.
  - `DRIPPERS`, `FILTERS`, `GRIND`, `PROCESS`: config tables (geometry, flow factors, availability `A`, recommended temp).
  - `simulate(cfg)`: 0.5 s ticks. Tracks free water, absorbed water (up to 2× dose, soaked up at `ABSORB_RATE` slowing as the bed saturates, so some water drips through during bloom), agitation, fines migration (clogs flow), first-order extraction per compound for main particles and fines, and mass balance of dissolved solids → cup. Returns `steps` (bloom / pour / drawdown) and `frames`.
  - `shares(arr)`: perceived taste share.
- `src/render.js`: canvas drawing. Owns render state (`R`, `geom`, particles, effects); `load(R, cfg)` rebuilds geometry and particles for a new result. Also exports colour helpers (`mix`, `rgba`, `clamp`, `hueOf`) and `stepShort`.
  - Virtual scene 470×520, scaled to the `.viz` box. Cone geometry `geom.w(y)`, volume→height lookup `volToH`.
  - Particles in cylindrical coords (r, θ, y), projected with a 0.3 vertical squash. Agitation field: down in the center, up along walls, plus swirl. Fines settle toward the bottom as `mig` grows.
  - Effects: compound "wisps", CO₂ bubbles in bloom, drips, ripples, kettle stream.
  - Server shows stacked layers per step (intentionally unmixed for teaching).
- `src/ui.js`: UI state (`state`), controls, timeline, panel text (`narrate`, `verdict`), HUD, and the `requestAnimationFrame` loop.
  - Phone-width screens (≤640 px) get a one-time `<dialog>` suggesting a tablet or computer; dismissal is stored in localStorage (`mobileHintSeen`).
  - Playback: nothing plays on load or after a control change; a play overlay over the scene waits for a click. The overlay plays all steps from the start (`playAll`), and the "เล่นทั้งหมด" button follows that state ("หยุด" while running). Prev/next/timeline play one step then stop. Whenever playback rests at a step boundary the overlay returns as "เล่นใหม่ตั้งแต่ต้น" (hidden while paused mid-step). Step duration `animDur = clamp(simSeconds/3.5, 8, 26)` real seconds at 1×.

## Decisions to keep
- Dose fixed at 15 g. Ratio options 1:5, 1:10, 1:15, 1:20.
- Pours 1–10 including bloom. Pours = 1 means a single pour with all water (no separate bloom).
- Default temp is 90 °C even though Natural recommends 88 °C (user's request). Choosing a process auto-sets its recommended temp.
- Switch drippers: valve closed during bloom (immersion, held to 45 s), open afterwards.
- CT-62 and UFO v3 geometry/flow are approximations, not measured specs.
- Model is conceptual; EY/TDS are for showing direction of change, not real values.

## Refactor rules (still apply to structural changes)
- Behavior and visuals must stay identical. Compare screenshots before and after (desktop and ~390 px mobile).
- Keep it a static site with no build step unless a build step becomes clearly necessary. Ask before adding a bundler or framework.
- Commit in small steps so each step can be reverted.

## Working guidelines
- Run `node --test` after any change to `sim.js`.
- Physics/extraction constants live in the config tables at the top of `sim.js`. Change them there, not inline.
- When changing model behavior, state which reference numbers move and why.
- UI copy is Thai. Keep new UI text in Thai and consistent with existing wording.
- Don't auto-play on load or on control changes: the user starts playback from the overlay. Picking a single step (prev/next/timeline) must stop at the end of that step.

## Testing
- Reference configs (default = V60 dripper, V60 filter, 3 pours, medium, 90 °C, bloom 2×, 1:15, natural):
  - default → EY ~18.6%, total time ~2:30, ~7 g drips through during bloom
  - default + fine grind + 94 °C → EY ~22–23%, astringent/burnt shares go up
  - default + coarse grind + 86 °C → EY ~13.5%, sour-led
  - Hario Switch → valve closed through bloom (45 s), no drain during bloom. With bloom 2× the bloom step ends at exactly 45 s (all water absorbed); with a bigger bloom it runs longer while the excess drains.
  - ratio 1:5 → low EY (high TDS); pours = 1 → single step + drawdown
- `test/sim.test.js` (`node --test`) checks the reference configs, mass-balance invariants, and golden numbers for 18 configs. Golden values lock exact output: if a model change is intended, update them and state which numbers moved and why.
- Visual check: ES modules don't load over `file://`, so serve the folder (e.g. `python3 -m http.server`) and open `http://localhost:8000` (desktop and ~390 px mobile width).
