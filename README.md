# Back Programme Tracker

Source for Su's back-rehab tracker (a Claude artifact) and its offline companion (this site).

- **Offline app:** https://randompcnameforme-droid.github.io/back-tracker-offline/. Open in Chrome and choose **Install**.
  Set-up and weekly refresh: tracker **Library › Offline app › Copy update**, then here **Send › paste › Load update**.
  Sending logs: here **Send › Send to tracker**, then tap the box in the tracker and choose **Paste**.
- **Building:** `python3 build.py`. **Testing:** `node tests/smoke.js`. See `CLAUDE.md` for the change process.
- Code only. No programme or log data is stored in this repository.
