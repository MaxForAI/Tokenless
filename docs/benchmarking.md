# Benchmarking Tokenless

This document records the benchmark protocol used for Tokenless API-body
measurements. The goal is to measure what enters Claude Code API requests, not
just local hook-side compression estimates.

## Measurement source

Use raw Claude Code API body logs:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES="file:<api-body-dir>"
```

Then inspect the captured request bodies:

```bash
node plugins/claude-code/bin/tokenless api-probe stats \
  --dir "<api-body-dir>" \
  --data-dir /Users/mac/.tokenless
```

Important: older variables such as `TOKENLESS_API_BODY_CAPTURE` and
`TOKENLESS_API_BODY_CAPTURE_DIR` do not capture API bodies in the current setup.

## What counts as evidence

Use `api-probe stats` request-token totals as the main comparison:

- `Estimated API body size -> request` is the primary metric.
- `all` is useful as a secondary total including responses.
- `API-confirmed savings estimate` is a counterfactual diagnostic, not exact
  billing.
- `TOKENLESS-READ-PACKET` appearing in request files confirms that read packets
  reached API context.
- `originalFile`, `structuredPatch`, `oldString`, and `newString` should remain
  `0` in request files. Non-zero values indicate raw edit payload leakage.

## True ON and True-OFF

Tokenless ON:

```bash
export TOKENLESS_MODE=on
```

Tokenless OFF:

```bash
export TOKENLESS_MODE=off
```

The OFF run is only valid if all packet evidence is zero:

```text
TOKENLESS-READ-PACKET: request=0
TOKENLESS-EDIT-PACKET: request=0
TOKENLESS-WRITE-PACKET: request=0
API-confirmed savings estimate: 0
```

If OFF still contains `TOKENLESS-READ-PACKET`, abort the run. That is not a true
OFF comparison.

## Benchmark hygiene

- Use an immutable original fixture.
- Create fresh `on/` and `off/` copies for every pair.
- Keep the prompt realistic and fuzzy. Do not give selector-by-selector or
  component-by-component implementation instructions unless the product task
  would naturally be that specific.
- Keep ON and OFF on the same Claude Code version, provider, model aliases, and
  environment.
- Disable unrelated plugins, MCP servers, and non-Tokenless hooks for clean
  comparisons.
- Judge completion quality alongside token numbers. A cheaper run that stops
  before finishing the UI work is not a better result.

## Helper commands

Create fresh ON/OFF copies for the 10k React/TSX fixture:

```bash
node plugins/claude-code/bin/tokenless benchmark-copy aurora-10k-tsx
```

This prints:

- the fresh `on/` and `off/` directories
- the ON/OFF file paths
- matching ON/OFF launch commands
- stats commands
- the true-OFF check

Start an API probe directory without manually constructing the path:

```bash
node plugins/claude-code/bin/tokenless api-probe start --name aurora-10k-tsx-on
```

This creates a timestamped directory under `/Users/mac/.tokenless` and prints the
required environment exports, including `TOKENLESS_API_PROBE_DIR`.

Check the currently visible Tokenless mode:

```bash
TOKENLESS_MODE=off node plugins/claude-code/bin/tokenless status --user
```

The status output includes:

```text
mode: off
mode_source: TOKENLESS_MODE
```

## CSS visual-edit benchmark

Fixture family: Einstein observatory CSS page with a large `style.css`.

Prompt style: fuzzy visual polish request focused on cards, buttons, background
depth, and hover feedback while preserving cyan/orange technology styling.

Stable ON behavior:

- `TOKENLESS-READ-PACKET` caps the large CSS read.
- If the next step is native `Edit`, the agent performs one minimal native
  `Read` only to register editor state.
- The agent then applies 6-10 bounded `Edit` calls.
- It should not repeatedly expand or re-explore the same file.

Representative ON runs:

| API body directory | Request tokens | All tokens | Read-packet appearances |
| --- | ---: | ---: | ---: |
| `api-bodies-observatory-zenmux-editphase-on-20260518-052116` | 403,995 | 410,112 | 10 |
| `api-bodies-observatory-zenmux-editphase-stability2-on-20260518-052643` | 473,354 | 480,283 | 12 |
| `api-bodies-observatory-zenmux-editphase-stability3-on-20260518-053050` | 407,603 | 415,178 | 10 |

True OFF comparison:

| API body directory | Request tokens | All tokens | Read-packet appearances |
| --- | ---: | ---: | ---: |
| `api-bodies-observatory-zenmux-off-20260518-053825` | 1,017,642 | 1,031,745 | 0 |

Result: repeated CSS visual-edit runs reduced request-body tokens from about
1.02M to about 0.40M-0.47M, or roughly 54-60%.

## 10k React/TSX benchmark

Fixture: immutable original at:

```text
/Users/mac/aurora-ops-10k-tsx-original/src/App.tsx
```

The fixture is about 10,001 lines and roughly 76k estimated raw tokens.

Task prompt:

```text
这个 React 控制台页面现在交互和结构有点普通。你帮我把整体产品质感和可用性提升一下，重点是筛选区、指标卡、表格状态展示、侧边事件面板和按钮反馈。不要重写整个文件，不要加新依赖，保留青色和橙色的科技运营台方向。你自己判断需要改哪些代码。
```

Final clean true-OFF run:

| Metric | Value |
| --- | ---: |
| API body directory | `api-bodies-aurora-10k-tsx-realofffix-off-20260518-142438` |
| Request tokens | 917,137 |
| Response tokens | 29,301 |
| All tokens | 946,438 |
| Request files | 21 |
| `TOKENLESS-READ-PACKET` | 0 |
| `request_saved_estimate` | 0 |

Final ON run:

| Metric | Value |
| --- | ---: |
| API body directory | `api-bodies-aurora-10k-tsx-realofffix-on-20260518-144913` |
| Request tokens | 545,456 |
| Response tokens | 33,319 |
| All tokens | 578,775 |
| Request files | 14 |
| `TOKENLESS-READ-PACKET` | 11 |
| `request_saved_estimate` | 815,804 |

Raw leak checks for the ON run:

```text
originalFile: 0
structuredPatch: 0
oldString: 0
newString: 0
```

Result:

```text
Request saved: 371,681 tokens
Request reduction: 40.5%
All saved: 367,663 tokens
All reduction: 38.8%
```

The TSX path is useful but more trajectory-sensitive than CSS. The read packet
can appear in many follow-up requests, so the savings depend heavily on whether
the model edits directly from the packet or continues exploring.

## Multifile React dashboard benchmark

Fixture family: immutable original copied from:

```text
/Users/mac/aurora-ops-multifile-benchmark-original
```

The task is an agentic product-polish pass across a React dashboard with
component files, data, utilities, and a large dashboard stylesheet.

Task prompt:

```text
这个 React 运营控制台现在整体质感和可用性都偏普通。你帮我做一轮产品级提升，重点是筛选区、指标卡、表格状态展示、侧边事件面板、按钮反馈和整体视觉层次。不要重写整个项目，不要加新依赖，保留青色和橙色的科技运营台方向。你自己判断需要改哪些文件和代码。
```

### Default Lean + Tokenless ON/OFF

Both runs used the default `tokenless launch` Lean launcher, which disables
Claude Code Task/Plan tools while keeping normal read, edit, write, and bash
tools available. This isolates Tokenless ON/OFF under the current default
launcher behavior.

Tokenless OFF run:

| Metric | Value |
| --- | ---: |
| API body directory | `api-bodies-aurora-multifile-lean-final-off-20260518222530` |
| Request tokens | 628,261 |
| Response tokens | 29,162 |
| All tokens | 657,423 |
| Request files | 16 |
| `TOKENLESS-READ-PACKET` | 0 |
| `request_saved_estimate` | 0 |

Tokenless ON run:

| Metric | Value |
| --- | ---: |
| API body directory | `api-bodies-aurora-multifile-lean-final-on-20260518222530` |
| Request tokens | 512,521 |
| Response tokens | 20,155 |
| All tokens | 532,676 |
| Request files | 17 |
| `TOKENLESS-READ-PACKET` | 17 |
| `request_saved_estimate` | 647,160 |

Raw leak checks for both runs:

```text
originalFile: 0
structuredPatch: 0
oldString: 0
newString: 0
```

Result:

```text
Request saved: 115,740 tokens
Request reduction: 18.4%
All saved: 124,747 tokens
All reduction: 19.0%
```

The ON run made one more request than the OFF run, but still used fewer request
tokens overall. This confirms that the reduction did not come from simply
stopping earlier.

### Lean mode Task/Plan tool comparison

This comparison measures the launcher-level cost of allowing Claude Code
Task/Plan tools. It is product overhead reduction, not read-packet compression.

| Mode | API body directory | Request tokens | All tokens | Request files |
| --- | --- | ---: | ---: | ---: |
| Task/Plan tools enabled | `api-bodies-aurora-multifile-task-on-` | 1,524,894 | 1,565,109 | 36 |
| Lean default, Task/Plan tools disabled | `api-bodies-aurora-multifile-lean-on-20260518205433` | 1,087,753 | 1,111,762 | 34 |

Result:

```text
Request saved: 437,141 tokens
Request reduction: 28.7%
All saved: 453,347 tokens
All reduction: 29.0%
```

In the Lean run, Task/Plan tool schema and Task/Plan history were absent from
request bodies. In the Task-enabled run, Task/Plan tool schema alone accounted
for about 134k request tokens. The remaining delta came from changed trajectory
and follow-up context size.

## Notes for future README claims

Use conservative public wording:

- CSS visual-edit benchmark: about 54-60% request-token reduction.
- 10k React/TSX single-file edit: about 40% request-token reduction.
- Multifile React dashboard in the default Lean launcher: about 18% request-token
  reduction from Tokenless ON/OFF.
- Lean launcher Task/Plan tool trimming: about 29% request-token reduction in
  the multifile dashboard task family.
- The current strongest evidence is API request-body reduction, not exact billed
  token savings.
- Do not claim universal 80%+ savings from the current data.
