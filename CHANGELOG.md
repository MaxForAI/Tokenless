# Changelog

## Unreleased

### Added

- `TOKENLESS_MODE=off|false|0|disabled` now disables Tokenless hook behavior at the hook entrypoints, enabling true OFF benchmark runs.
- `tokenless status` now prints the current Tokenless mode and whether it came from `TOKENLESS_MODE`.
- `tokenless benchmark-copy aurora-10k-tsx` creates fresh ON/OFF benchmark copies and prints matching launch/stat commands.
- `tokenless api-probe start --name <slug>` creates a timestamped API-body directory and prints reusable telemetry exports.
- `npm run eval:cli-smoke` verifies the new CLI surfaces without launching Claude Code.
- Large JS/TS source packets now include bounded project file hints for nearby/imported source, style, and data files.
- Large Python files now use source-oriented read packets with imports, classes, functions, snippets, and nearby file hints.
- Large Vue/Svelte single-file components now use component-oriented read packets with template/script/style sections, interaction hints, snippets, and local component hints.

### Documentation

- Added API-body benchmark results for large CSS visual edits and a 10k-line React/TSX edit.
- Added `docs/benchmarking.md` with true-ON/OFF setup, raw API body capture instructions, and benchmark caveats.

## v0.1.0-mvp

Initial Claude Code MVP for Tokenless context compression.

### Added

- Claude Code plugin scaffold under `plugins/claude-code`.
- Bash PreToolUse hook that caps noisy commands before raw output enters model context.
- Bash PostToolUse and PostToolUseFailure fallback hooks.
- Local `acc` CLI with:
  - `run --agent`
  - `compact`
  - `doctor`
  - `status`
  - `list`
  - `latest`
  - `show`
  - `expand`
  - `print-hooks`
  - `install-hooks --user`
  - `install-hooks --project`
  - `uninstall-hooks --user`
  - `uninstall-hooks --project`
  - `clean`
- Raw artifact storage under the selected `--data-dir`.
- `latest` artifact alias for `show` and `expand`.
- Deterministic reducers for:
  - test logs
  - build and CI logs
  - git diffs
  - search output
  - file trees
  - generic Bash output
- Test-log failure triage with:
  - summary lines
  - failure families
  - first 25 failure index
  - representative failure details
  - relevant file:line hints
- Complex end-to-end test-log eval.
- README quickstart, hook setup, artifact workflow, cleanup, and limitations.

### Verified

- `npm run eval:complex`
- `npm run doctor`
- `npm run tokenless:status`
- `npm run tokenless:install:dry-run`
- `npm run tokenless:uninstall:dry-run`
- `npm run tokenless:clean:dry-run`
- `npm run eval:all`
- Claude Code hook path with `npm run test:complex`

### Known limitations

- Claude Code Bash hook only.
- PreToolUse currently uses `deny` to force rerun through Tokenless because `updatedInput` behavior can be unreliable across Claude Code builds.
- Reducers are deterministic and intentionally conservative.
- Exact-review and high-stakes domains may require explicit artifact expansion.
