# Test seed

`tests/seed.local.json` is NOT committed (it holds Su's programme and logs, and this repo is public).
Claude builds it before running tests: list `programme`, `state` and `days` from the tracker artifact with the
ArtifactData tool into a folder, then write one JSON object keyed `"<collection>/<docId>"` → document data.
