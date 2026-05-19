<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" width="360" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>One command to cut token usage by up to 50%+.</strong>
</p>

<p align="center">
  <a href="#verified-results"><img alt="vibe coding request reduction" src="https://img.shields.io/badge/vibe%20coding-47.3%25%20less%20request%20tokens-2dd4bf?style=for-the-badge"></a>
  <a href="#output-profiles"><img alt="chat response reduction" src="https://img.shields.io/badge/chat-80.0%25%20less%20response%20tokens-4ade80?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#before--after">Before / After</a> ·
  <a href="#installation">Install</a> ·
  <a href="#output-profiles">Profiles</a> ·
  <a href="#verified-results">Benchmarks</a> ·
  <a href="docs/benchmarking.md">Full benchmark guide</a>
</p>

---

Tokenless is a Claude Code plugin for reducing API context growth during coding workflows. It intercepts noisy tool output before it enters model context, stores the raw output locally, and sends Claude a compact evidence packet.

It also provides output profiles that make Claude responses shorter for everyday chat and denser for coding sessions.

Tokenless is not an LLM summarizer and does not send data to a separate service. Reducers are deterministic and local. Raw artifacts stay on disk and can be expanded only when needed.

Current packet format: `TOKENLESS-PACKET/0.1`.

## Before / After

| Normal Claude Code | Claude Code with Tokenless |
| --- | --- |
| Reads a large file or log into future context repeatedly. | Stores the raw output locally and sends a compact packet. |
| Verbose final replies become part of the next request history. | `chat` and `coding` profiles keep replies short. |
| Agent trajectory can grow through repeated exploration and task-plan history. | Launcher trims Task/Plan tools by default; packets reduce large read context. |

Example large-read replacement:

| Raw context | Tokenless context |
| --- | --- |
| Full file/log output is carried through API requests. | `TOKENLESS-READ-PACKET/0.1` with artifact id, imports, symbols, snippets, nearby files, and exact expansion commands. |

## Why Tokenless

Claude Code sessions can become expensive because tool outputs, file reads, task-plan history, and verbose assistant replies are repeatedly carried through future API requests. Tokenless targets three sources of growth:

- Large tool output: test logs, build logs, search results, tree output, diffs, large reads, and large successful edit/write results.
- Agent trajectory overhead: repeated request context, high-overhead Task/Plan tools, and large raw file payloads.
- Response verbosity: optional `chat` and `coding` profiles reduce assistant output tokens.

## Verified results

These are real Claude Code API-body measurements. The primary metric is estimated request-body tokens from raw API request logs, not local hook-side savings estimates.

| Scenario | Baseline | Tokenless | Reduction |
| --- | ---: | ---: | ---: |
| Large CSS visual edit | 1,017,642 request tokens | 403,995-473,354 | ~54-60% |
| 10k-line React/TSX edit | 917,137 request tokens | 545,456 | 40.5% |
| Multifile React dashboard | 628,261 request tokens | 512,521 | 18.4% |
| Task/Plan tools enabled vs default launcher | 1,524,894 request tokens | 1,087,753 | 28.7% |
| 5-turn CRM vibe coding, `off` vs `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6-turn natural conversation, `off` vs `chat` | 7,223 response tokens | 1,442 | 80.0% |

The 5-turn CRM vibe-coding run is the strongest current product benchmark: a non-specialist user gave vague iterative product-polish prompts. The public `coding` profile reduced request tokens by 47.3%, response tokens by 44.4%, and request count by 39.3% versus clean `off`.

The 6-turn natural-conversation run did not use file tools or packet reducers. It isolates the `chat` profile: response tokens dropped by 80.0%, and total API-body tokens dropped by 7.7%.

Detailed methodology and raw run notes are in [docs/benchmarking.md](docs/benchmarking.md) and [docs/style-benchmark.md](docs/style-benchmark.md).

## Installation

Install from GitHub:

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless is currently distributed through GitHub. It has not been published to the public npm registry yet.

For local development from a checkout:

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

If Claude Code is not available as `claude` on your `PATH`, set `CLAUDE_BIN`:

```bash
CLAUDE_BIN=/path/to/claude tokenless launch
```

Check installation status:

```bash
tokenless status --user
```

## Output profiles

Tokenless has three public profiles:

| Profile | Behavior |
| --- | --- |
| `chat` | Default. Short, readable natural-language responses. Only changes output style. |
| `coding` | Dense structured responses for coding workflows. Only changes output style. |
| `off` | Full Tokenless hard-off. Disables style injection and compression hooks. |

Set a profile:

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Claude Code slash command shortcuts:

```text
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

The selected profile is stored at `~/.tokenless/style.json` by default and persists across Claude Code restarts.

`TOKENLESS_MODE=off` remains available as an environment-level hard-off switch for benchmark runs.

## How it works

For noisy commands and large outputs:

```text
Claude requests a noisy tool call
  -> Tokenless intercepts it with Claude Code hooks
  -> The original command or output is processed locally
  -> Raw stdout/stderr or file content is saved as an artifact
  -> Claude receives a compact TOKENLESS-* packet
  -> Claude expands only the relevant artifact slice if needed
```

Example read packet:

```text
TOKENLESS-READ-PACKET/0.1
file: /path/to/src/App.tsx
artifact_id: ctx_20260518_abc123
summary: large TSX source packet with imports, declarations, snippets, and nearby files
```

Expand raw evidence when needed:

```bash
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

The shorter `acc` command remains available as a compatibility alias. `tokenless` is the preferred public command.

## What Tokenless handles

Tokenless currently handles:

- Test logs: `npm test`, `pytest`, `go test`, `cargo test`.
- Build and CI logs: `npm run build`, `docker build`, `kubectl logs`.
- Diffs and history: `git diff`, `git log`.
- Search and tree output: `rg`, `grep -R`, `find`, `tree`, `ls -R`.
- Large low-risk reads: CSS, HTML, JSON, logs, docs, generated files, large JS/TS/Python source files, and large Vue/Svelte components.
- Large successful edit/write tool results: conservative `TOKENLESS-EDIT-PACKET` and `TOKENLESS-WRITE-PACKET`.
- Unexpectedly large Bash output through fallback compression.

Small bounded commands, such as `rg -m 20`, `find ... | head`, `cat file | grep`, and `tree | head`, pass through directly. Small reads are not compressed by default.

## Read packets

Read packets cap large low-risk file reads as `TOKENLESS-READ-PACKET/0.1`.

Default policy:

- Compress low-risk reads over roughly 4,000 estimated tokens: CSS, HTML, JSON, logs, docs, lockfiles, generated files.
- Compress large JS/TS/React/Python source reads over roughly 30,000 estimated tokens with source-oriented packets.
- Compress large Vue/Svelte single-file components over roughly 12,000 estimated tokens with component-oriented packets.
- Do not compress small files.
- Do not compress source families such as `.go`, `.rs`, `.java`, `.swift`, or `.cpp` by default.

Read packets are indexes, not edit proof. If Claude needs exact code or style, it should expand the relevant lines first:

```bash
tokenless expand ctx_abc --around ".target-card" --data-dir ~/.tokenless
tokenless expand ctx_abc --lines 520:535 --data-dir ~/.tokenless
```

For CSS, SCSS, Less, HTML, HTM, and SVG files, read packets include deterministic editable summaries: variables, color palettes, likely editable selectors, media and animation rules, sections, ids/classes, interactive elements, assets, and headings.

Large-file gate behavior:

- Tokenless blocks raw access to large low-risk files until a read packet exists.
- The hook prints the required next command, usually `tokenless read --agent --data-dir ~/.tokenless <file>`.
- Read packets record file size and modified time.
- If the file changes after packet creation, the packet is stale and Tokenless asks for a fresh packet.
- For several related changes, expand the relevant lines and use one bounded edit while the packet is current.

## Edit and write packets

Tokenless can cap large successful `Edit`, `MultiEdit`, and low-risk `Write` tool results.

The policy is intentionally conservative:

- Successful `Edit` / `MultiEdit` output over roughly 3,000 estimated tokens can become `TOKENLESS-EDIT-PACKET/0.1`.
- Successful low-risk `Write` output over roughly 5,000 estimated tokens can become `TOKENLESS-WRITE-PACKET/0.1`.
- Failed or risky outputs are never compressed.
- Source-code `Write` outputs are not compressed by default.
- Raw tool output is stored locally before replacement.

Risk signals that pass through unchanged include:

```text
Error
Failed
old_string
not found
multiple matches
ambiguous
permission denied
conflict
No changes
partial
```

Edit/write packets do not claim semantic correctness. They only confirm the tool completed successfully, preserve the raw artifact, and mark previous read packets for that file as stale.

## Launcher behavior

`tokenless launch` starts Claude Code with normal read, edit, write, and bash tools available, but disables high-overhead Task/Plan tools by default:

```text
TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode
```

This reduces fixed tool-schema overhead and prevents task-list history from being repeatedly carried through API request context.

Opt back into Task/Plan tools for a session:

```bash
TOKENLESS_ALLOW_TASK_TOOLS=1 tokenless launch
```

## Slash commands

Install user-level Claude Code slash commands:

```bash
tokenless install-commands --user
```

Installed commands:

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

`/tokenless` shows hook status, active mode, profile, savings, packet counts, pending gates, and latest artifact.

Restart Claude Code after installing slash commands. If you previously installed older Tokenless commands, clean them up with:

```bash
tokenless uninstall-commands --user
tokenless install-commands --user
```

## Common CLI commands

```bash
tokenless --help
tokenless status --user
tokenless latest --data-dir ~/.tokenless
tokenless list --data-dir ~/.tokenless
tokenless stats --data-dir ~/.tokenless
tokenless show latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless style status
tokenless style coding
tokenless api-usage --since 24h
```

`tokenless stats` separates local savings by source:

- `hook`: real Claude Code hook-path compression.
- `eval`: local evaluation fixtures.
- `smoke`: manual probes, doctor checks, and ad hoc compression runs.
- `legacy`: records created before source tagging.

## Benchmarking

For API-body verification, enable raw Claude Code API body capture:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES="file:<api-body-dir>"
```

Inspect captured request/response bodies:

```bash
node plugins/claude-code/bin/tokenless api-probe stats \
  --dir "<api-body-dir>" \
  --data-dir ~/.tokenless
```

A valid clean `off` run must show:

```text
TOKENLESS-READ-PACKET: request=0
TOKENLESS-EDIT-PACKET: request=0
TOKENLESS-WRITE-PACKET: request=0
request_saved_estimate: 0
```

Raw API bodies can contain full prompts, tool outputs, and sensitive local context. Keep capture disabled unless you are verifying what enters model context.

## Development and validation

Run the main smoke checks:

```bash
npm run eval:complex
npm run eval:read
npm run eval:edit
npm run eval:cli-smoke
npm run doctor
```

Run all synthetic and captured cases:

```bash
npm run eval:all
```

Check hook install state:

```bash
npm run tokenless:status
npm run tokenless:install:dry-run
npm run tokenless:repair-hooks:dry-run
npm run tokenless:uninstall:dry-run
```

Test the actual Claude Code hook path inside Claude Code:

```bash
npm run test:complex
```

Expected behavior:

```text
PreToolUse caps the noisy command
Claude reruns node .../bin/acc run --agent ...
Claude receives TOKENLESS-PACKET/0.1
Raw artifact can be expanded with tokenless expand latest
```

## Cleanup

Artifacts are stored under the selected `--data-dir`, usually `~/.tokenless/artifacts`.

Preview cleanup:

```bash
npm run tokenless:clean:dry-run
```

Delete old artifacts:

```bash
tokenless clean --data-dir ~/.tokenless --older-than 7d
```

Keep only the newest 100 artifacts:

```bash
tokenless clean --data-dir ~/.tokenless --keep 100
```

## Privacy and safety model

- Tokenless runs locally.
- Raw artifacts stay on local disk under the configured data directory.
- Tokenless does not call a separate LLM or cloud summarization service.
- Reducers are deterministic and intentionally conservative.
- Risky failed outputs pass through unchanged.
- Exact legal, financial, medical, security, and code-review work may require explicit artifact expansion.

## Limitations

- Claude Code hooks are the primary integration target.
- Reducers are policy-based and may miss some noisy outputs.
- Small outputs can expand slightly if forced through Tokenless; classifiers avoid common bounded commands, but the policy is not perfect.
- Read packets are useful evidence, not a substitute for exact line expansion before high-risk edits.
- API-body token counts are estimates, not exact billed-token accounting.

## Contributors

- Max Liu
- Codex, AI coding assistant
