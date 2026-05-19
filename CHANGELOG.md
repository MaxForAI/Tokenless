# Changelog

## v0.3.1 - 2026-05-19

### Documentation

- Added localized README files for Chinese, Japanese, French, and Spanish.
- Added a first-screen Quick start section.
- Reworked the benchmark section into `Benchmarks & Evidence`, combining real Claude Code API-body results with related compression and brevity research.
- Restored the faucet logo and added star, license, and acknowledgements sections.
- Fixed README benchmark badge anchors after the benchmark section rename.

## v0.3.0 - 2026-05-19

### Changed

- Reworked Claude Code slash commands into one top-level `/tokenless` status command plus picker-friendly profile commands.
- Reworked the public style surface to `chat`, `coding`, and `off`, with `chat` as the default readable compression mode and `coding` as the dense structured coding mode.
- Made public `off` a full Tokenless hard-off profile: it disables both output style injection and compression hooks, while `chat` and `coding` only change output style.
- Added picker-friendly `/tokenless-style-chat`, `/tokenless-style-coding`, and `/tokenless-style-off` commands for Claude Code.
- Stopped installing placeholder or overly granular slash commands; uninstall now also removes older `/tokenless-mode`, `/tokenless-latest`, `/tokenless-expand`, and `/tokenless-doctor` files if present.
- Polished the public README, logo, benchmark framing, and install/profile documentation for launch.

### Added

- Added a `UserPromptSubmit` hook that injects a short style reminder only when a Tokenless style profile is active.
- Added `tokenless style` CLI status/set commands backed by `~/.tokenless/style.json`.
- Documented a clean 6-turn non-coding conversation benchmark where public `chat` reduced response tokens by 80.0% and total API-body tokens by 7.7% versus clean `off`.
- Documented a 5-turn CRM vibe-coding benchmark where the public `coding` profile reduced request tokens by 47.3%, requests by 39.3%, and response tokens by 44.4% versus clean `off`.
- Added `tokenless style-benchmark start <style>` to print repeatable API-body capture, prompt, and stats commands for output-style experiments.

## v0.2.1 - 2026-05-18

### Changed

- Prepared npm publishing by removing the private package flag.
- Added an npm `files` whitelist so local API body captures, benchmark scratch directories, and private launcher scripts stay out of published packages.

## v0.2.0 - 2026-05-18

### Added

- `tokenless launch` starts Claude Code through a Tokenless Lean session by default.
- Lean launch mode disables high-overhead Claude Code Task/Plan tools while keeping normal read, edit, write, and bash tools available.
- `TOKENLESS_ALLOW_TASK_TOOLS=1 tokenless launch` restores Claude Code's native task list and plan-mode UI for a session.
- `TOKENLESS_MODE=off|false|0|disabled` now disables Tokenless hook behavior at the hook entrypoints, enabling true OFF benchmark runs.
- `tokenless status` now prints the current Tokenless mode and whether it came from `TOKENLESS_MODE`.
- `tokenless benchmark-copy aurora-10k-tsx` creates fresh ON/OFF benchmark copies and prints matching launch/stat commands.
- `tokenless api-probe start --name <slug>` creates a timestamped API-body directory and prints reusable telemetry exports.
- `npm run eval:cli-smoke` verifies the new CLI surfaces without launching Claude Code.
- Large JS/TS source packets now include bounded project file hints for nearby/imported source, style, and data files.
- Large Python files now use source-oriented read packets with imports, classes, functions, snippets, and nearby file hints.
- Large Vue/Svelte single-file components now use component-oriented read packets with template/script/style sections, interaction hints, snippets, and local component hints.
- Large existing `Write` overwrites are blocked before execution unless explicitly allowed, pushing agents toward bounded edits.
- Large successful `Edit`, `MultiEdit`, and low-risk `Write` results emit compact edit/write packets while preserving raw artifacts locally.

### Documentation

- Added API-body benchmark results for large CSS visual edits and a 10k-line React/TSX edit.
- Added API-body benchmark results for the multifile React dashboard Lean launcher and Tokenless ON/OFF runs.
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
