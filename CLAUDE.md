# Back Programme Tracker: master copy

This repository is the **only source** for both apps:
- **Tracker**: published to the Claude artifact https://claude.ai/artifact/Q4swQcjvgx34f9PQ9KenXz from `dist/tracker.html`.
- **Offline app**: served by GitHub Pages from this repo's root (`index.html`, `sw.js`, `manifest.webmanifest`, icons).

The repo is **public**. Never commit Su's programme, logs, notes or test seeds. Programme and logs live in the
artifact's database (see the project doc `claude/Tracker_App_Data_Map_2026-11-14.md`).

## Every change, in this order
1. `git pull`. Then read the live artifact (Artifact tool, `read`) and confirm its script matches `dist/tracker.html`.
   If it doesn't, someone published outside this repo: bring that change into `src/` first, never overwrite it.
2. Edit only `src/` (`src/app.js` is the app, `src/head.html` the styles and shell, `src/localdb.js` the offline storage).
   Bump `APP_VERSION` in `src/app.js`.
3. `python3 build.py` (writes `dist/tracker.html`, `index.html`, and a new cache name in `sw.js`).
4. Build `tests/seed.local.json` (see `tests/make_seed.md`) and run `node tests/smoke.js`. All must pass.
5. Commit and push, then publish `dist/tracker.html` to the artifact URL above (omit `capabilities` to keep them).

## Rules that have bitten before
- Slot ids in the programme are never renamed.
- Saves are merge-only (`update`), never whole-day `set`, and every database call has a timeout.
- Ticks are hierarchical: set → exercise → block/session. There are no Done/Undo/Stopped buttons or knee score;
  Su puts pain and stopped sets in notes.
