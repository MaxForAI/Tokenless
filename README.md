# Tokenless

Tokenless is a Claude Code plugin for capping noisy tool output before it enters model context.

It is not a generic summarizer. Tokenless keeps raw output as a local artifact and sends Claude a compact evidence packet with enough signal to continue the task.

The current wire format is `TOKENLESS-PACKET/0.1`.

## Contributors

- Max Liu
- Codex, AI coding assistant

## What it handles now

- Test logs: `npm test`, `pytest`, `go test`, `cargo test`
- Build and CI logs: `npm run build`, `docker build`, `kubectl logs`
- Diffs: `git diff`, `git log`
- Search and tree output: `rg`, `grep -R`, `find`, `tree`, `ls -R`
- Large low-risk reads: CSS, HTML, JSON, logs, docs, generated files, large JS/TS/Python source files, and large Vue/Svelte components
- Large successful edit/write tool results: conservative `TOKENLESS-EDIT-PACKET` / `TOKENLESS-WRITE-PACKET`
- Fallback compression for unexpectedly huge Bash output

Small bounded commands such as `rg -m 20`, `find ... | head`, `cat file | grep`, and `tree | head` are allowed through directly. Small reads are not compressed by default. JS/TS/Python source reads are only compressed when they cross the large-source threshold. Vue/Svelte single-file components use a lower threshold because they combine template, script, and style in one file.

## How it works

```text
Claude wants to run a noisy command
  -> PreToolUse caps it before raw output enters context
  -> Claude reruns the Tokenless wrapper
  -> Tokenless executes the original command locally
  -> Tokenless saves raw stdout/stderr as an artifact
  -> Claude receives TOKENLESS-PACKET/0.1
```

The raw output is still available through `tokenless show` and `tokenless expand`. The shorter `acc` command remains as a compatibility alias.

## Read packets

Tokenless can cap large low-risk `Read` outputs as `TOKENLESS-READ-PACKET/0.1`.

Default policy:

- Compress low-risk reads over roughly 4000 estimated tokens: CSS, HTML, JSON, logs, docs, lockfiles, generated files.
- Compress large JS/TS/React/Python source reads over roughly 30000 estimated tokens with source-oriented packets.
- Compress large Vue/Svelte single-file components over roughly 12000 estimated tokens with component-oriented packets.
- Do not compress small files.
- Do not compress other source files such as `.go`, `.rs`, `.java`, `.swift`, `.cpp` by default.

Read packets are indexes, not edit evidence. If a model needs to modify exact code or style, it must expand the relevant lines first:

```bash
tokenless expand ctx_abc --around ".target-card" --data-dir ~/.tokenless
tokenless expand ctx_abc --lines 520:535 --data-dir ~/.tokenless
```

For CSS/SCSS/Less and HTML/HTM/SVG files, read packets include a deterministic editable summary: CSS variables, color palette, likely editable selectors, media/animation rules, HTML sections, ids/classes, interactive elements, assets, and headings. Each section has fixed item limits and omitted counts; raw content remains available through artifacts.

Large-file gate behavior:

- For large low-risk files, Tokenless blocks raw `Read`, `grep`, `rg`, `sed`, `cat`, `head`, `tail`, `Edit`, `MultiEdit`, and `Write` access until a `TOKENLESS-READ-PACKET` exists.
- The required next step is printed in the hook message, usually `tokenless read --agent --data-dir ~/.tokenless <file>`.
- The read packet records file size and modified time.
- If the file changes after the packet is created, the packet is stale. Tokenless blocks the next access and asks for a fresh `tokenless read`.
- There is no broad edit grace window after a file changes. This avoids stale line numbers and accidental edits against old evidence.
- For several related changes in the same area, expand the relevant lines and use one `MultiEdit` while the packet is still current.

The regression check is:

```bash
npm run eval:read
```

## Edit and Write packets

Tokenless can cap large successful `Edit`, `MultiEdit`, and low-risk `Write` tool results.

This is intentionally conservative:

- Successful `Edit` / `MultiEdit` output over roughly 3000 estimated tokens can be replaced with `TOKENLESS-EDIT-PACKET/0.1`.
- Successful low-risk `Write` output over roughly 5000 estimated tokens can be replaced with `TOKENLESS-WRITE-PACKET/0.1`.
- Failed or risky outputs are not compressed.
- Source-code `Write` outputs are not compressed by default.
- Raw tool output is saved as a local artifact before replacement.

Risky outputs are passed through unchanged when they include signals such as:

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

The edit/write packet does not claim the edit is semantically correct. It only confirms the tool completed successfully, records the raw artifact, and tells the agent that any previous read packet for the file should be treated as stale.

## Quick demo

```bash
git clone https://github.com/MaxLiu199909/Tokenless.git
cd Tokenless
npm run eval:complex
```

Expected shape:

```text
TOKENLESS-COMPLEX-TEST/0.1
raw tokens: 16250
compressed tokens: ~1100
ratio: ~7%
pass: yes
```

To test the actual Claude Code hook path, run this inside Claude Code:

```bash
cd Tokenless && npm run test:complex
```

Expected behavior:

```text
PreToolUse caps the command
Claude reruns node .../bin/acc run --agent ...
Claude sees TOKENLESS-PACKET/0.1
```

## CLI

Use the local CLI directly:

```bash
node plugins/claude-code/bin/tokenless --help
```

For npm/global packaging, Tokenless exposes both commands:

```bash
tokenless --help
acc --help
```

`tokenless` is the preferred public command. `acc` remains available as a short compatibility alias and protocol-oriented command.

Recommended local setup from a checkout:

```bash
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

If Claude Code is not available as `claude` on your `PATH`, point Tokenless at
the local Claude binary:

```bash
CLAUDE_BIN=/path/to/claude tokenless launch
```

Start Claude Code through the Tokenless launcher to use the default Lean session
profile:

```bash
tokenless launch
```

`tokenless launch` keeps normal read, edit, write, and bash tools available, but
disables high-overhead Task/Plan tools by default. If you need Claude Code's
native task list and plan-mode UI for a session, opt back in:

```bash
TOKENLESS_ALLOW_TASK_TOOLS=1 tokenless launch
```

Common commands:

```bash
tokenless run --agent --data-dir /tmp/tokenless-test -- npm test
tokenless latest --data-dir ~/.tokenless
tokenless list --data-dir ~/.tokenless
tokenless stats --data-dir ~/.tokenless
tokenless api-usage --since 24h
tokenless show latest --data-dir ~/.tokenless
tokenless expand latest --around "Regression family 44" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless benchmark-copy aurora-10k-tsx
```

`tokenless stats` separates savings by source:

- `hook`: real Claude Code hook-path compression.
- `eval`: local evaluation fixtures.
- `smoke`: manual probes, doctor checks, and ad hoc compression runs.
- `legacy`: older records created before source tagging.

Local Claude Code API usage:

```bash
npm run tokenless:api-usage
npm run tokenless:api-usage:24h
```

Temporary raw API body probe, for local verification only:

```bash
node plugins/claude-code/bin/tokenless api-probe start --name my-benchmark
node plugins/claude-code/bin/tokenless api-probe inspect --dir "$TOKENLESS_API_PROBE_DIR" --keyword originalFile
node plugins/claude-code/bin/tokenless api-probe stats --dir "$TOKENLESS_API_PROBE_DIR"
node plugins/claude-code/bin/tokenless api-probe stop
```

Raw API bodies can contain full prompts, tool outputs, and sensitive local context. Keep this disabled unless you are verifying what enters model context.

### Lean mode: Task/Plan tools

The `tokenless launch` command defaults to a lean Claude Code session: it
disables high-overhead Task/Plan tools (`TaskCreate`, `TaskUpdate`,
`TaskList`, `TaskGet`, `EnterPlanMode`, and `ExitPlanMode`) while keeping normal
execution tools such as read, edit, write, and bash available.

This reduces fixed tool-schema overhead and prevents task-list history from
being repeatedly carried through API request context. If you want Claude Code's
native task list and plan-mode UI back for a session, opt in explicitly:

```bash
node plugins/claude-code/bin/tokenless launch
TOKENLESS_ALLOW_TASK_TOOLS=1 node plugins/claude-code/bin/tokenless launch
```

Use `api-probe stats` to separate API-confirmed evidence from local hook savings:

- API-confirmed evidence comes from raw request/response body files.
- Hook-local savings come from Tokenless artifacts and can include tool outputs that Claude Code does not send back to the API.
- `read-packet` savings are API-confirmed only when `TOKENLESS-READ-PACKET` appears in request files.
- `edit-packet` / `write-packet` savings are hook-local unless `TOKENLESS-EDIT-PACKET` or `TOKENLESS-WRITE-PACKET` appears in request files.
- `originalFile` and `structuredPatch` should normally be zero in request files; non-zero values indicate raw edit payload leakage.

Real Claude Code hook verification:

```bash
npm run tokenless:real-check -- --api-dir ~/.tokenless/api-bodies-realtest --file /Users/mac/einstein-page/style-probe-2.css
```

This prints `TOKENLESS-REAL-CHECK/0.1` with:

- real hook-path savings from `tokenless stats`
- `read-packet`, `edit-packet`, and `write-packet` savings
- pending large-file gates
- read-packet index entries for the target file
- `TOKENLESS-READ-PACKET` and `NEXT REQUIRED COMMAND` matches found in raw API probe files
- `TOKENLESS-EDIT-PACKET`, `TOKENLESS-WRITE-PACKET`, `blocked before execution`, and `stale` matches found in raw API probe files
- recent hook trace lines

## Benchmarks

These are real Claude Code API-body measurements from fuzzy UI-edit tasks. The
main metric is estimated request-body tokens from raw API request logs, not local
hook-side savings estimates.

| Scenario | Baseline request tokens | Optimized request tokens | Request reduction |
| --- | ---: | ---: | ---: |
| Large CSS visual edit, Tokenless OFF -> ON | 1,017,642 | 403,995-473,354 | ~54-60% |
| 10k-line React/TSX edit, Tokenless OFF -> ON | 917,137 | 545,456 | 40.5% |
| Multifile React dashboard, Lean + Tokenless OFF -> ON | 628,261 | 512,521 | 18.4% |
| Multifile React dashboard, Task/Plan tools on -> Lean default | 1,524,894 | 1,087,753 | 28.7% |

The CSS task is the strongest path today: large style files have stable editable
summaries, and repeated runs reduced request-body tokens from about 1.02M to
about 0.40M-0.47M.

The 10k-line React/TSX task shows the large-source path working in a realistic
single-file app edit: request-body tokens dropped from 917,137 to 545,456 in a
clean true-OFF comparison. TSX gains are real but more trajectory-sensitive than
CSS because the model may carry the read packet through many follow-up requests.

The multifile dashboard task is closer to an agentic product-polish run across
components and CSS. In the default Lean launcher, Tokenless ON reduced request
tokens from 628,261 to 512,521. Separately, disabling Claude Code Task/Plan
tools reduced request tokens from 1,524,894 to 1,087,753 in the same task family.

A valid OFF run must show `TOKENLESS-READ-PACKET: request=0` and
`request_saved_estimate: 0`; otherwise it is not a true OFF comparison.

See [docs/benchmarking.md](docs/benchmarking.md) for the benchmark protocol,
raw API capture setup, true-OFF checks, and caveats.

## Claude Code hook setup

Install hooks globally for Claude Code:

```bash
npm run tokenless:install
```

This writes `~/.claude/settings.json`, merges with existing hooks, and creates a timestamped backup if the file already exists.

Optional slash commands:

```bash
npm run tokenless:install-commands
```

This installs user-level Claude Code commands:

```text
/tokenless
/tokenless-mode
```

`/tokenless` shows local compression savings and the latest artifact. `/tokenless-mode` is reserved for future output discipline modes such as terse, caveman, reviewer, and wenyan.

Check install status:

```bash
npm run tokenless:status
```

Detect stale or duplicate hook config:

```bash
npm run doctor
```

Repair stale Tokenless or old ACC hook entries:

```bash
npm run tokenless:repair-hooks:dry-run
npm run tokenless:repair-hooks
```

`repair-hooks` removes stale project-level hook entries that point at old local checkouts and installs the current user-level Tokenless hooks. It creates timestamped backups before writing settings files.

Preview before writing:

```bash
npm run tokenless:install:dry-run
```

Project-only install is still available:

```bash
npm run acc:install-hooks:project
```

Preview uninstall without writing:

```bash
npm run tokenless:uninstall:dry-run
```

Or print a copyable hook block:

```bash
npm run acc:print-hooks
```

The older `npm run acc:*` scripts are kept for compatibility.

For this local checkout, the hook scripts are:

- `plugins/claude-code/scripts/pre_tool_use.js`
- `plugins/claude-code/scripts/post_tool_use.js`
- `plugins/claude-code/scripts/post_tool_failure.js`

Tokenless currently uses a PreToolUse `deny` decision as a safety mechanism because some Claude Code builds do not reliably apply `updatedInput`. The message tells Claude to rerun the compacted command. This prevents raw noisy output from entering context.

## Artifact workflow

After a compressed command, inspect the latest artifact:

```bash
tokenless latest --data-dir ~/.tokenless
```

Expand only the relevant area:

```bash
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
```

This is the core Tokenless loop:

```text
compact first
act on evidence
expand only if needed
never paste the whole raw log back into context
```

## Evaluation

Run all synthetic and captured real cases:

```bash
npm run eval:all
```

Run the complex end-to-end test-log case:

```bash
npm run eval:complex
```

Run the local health check:

```bash
npm run doctor
```

Run read-packet policy checks:

```bash
npm run eval:read
```

Run edit/write packet policy checks:

```bash
npm run eval:edit
```

## MVP verification checklist

Run these from the repo root:

```bash
cd Tokenless
npm run eval:complex
npm run eval:read
npm run eval:edit
npm run doctor
npm run tokenless:status
npm run tokenless:install:dry-run
npm run tokenless:repair-hooks:dry-run
npm run tokenless:uninstall:dry-run
npm run tokenless:clean:dry-run
npm run eval:all
```

Expected results:

```text
eval:complex: pass: yes
eval:read: read-packet policy checks pass
eval:edit: edit/write packet policy checks pass
doctor: all checks [ok]
tokenless:status: prints TOKENLESS-STATUS/0.1
tokenless:install:dry-run: prints TOKENLESS-INSTALL-HOOKS/0.1 and merged settings JSON
tokenless:repair-hooks:dry-run: prints TOKENLESS-REPAIR-HOOKS/0.1
tokenless:uninstall:dry-run: prints TOKENLESS-UNINSTALL-HOOKS/0.1 and removed count
tokenless:clean:dry-run: prints TOKENLESS-CLEAN/0.1 with dry_run: yes
eval:all: all cases pass
```

To verify the actual Claude Code hook path, run inside Claude Code:

```bash
npm run test:complex
```

Expected behavior:

```text
PreToolUse caps the noisy command
Claude reruns node .../bin/acc run --agent ...
Claude receives TOKENLESS-PACKET/0.1
Failure families are visible
Raw artifact can be expanded with tokenless expand latest
```

## Cleanup

Artifacts are stored under the selected `--data-dir`, usually `~/.tokenless/artifacts`.

Preview cleanup:

```bash
npm run tokenless:clean:dry-run
```

Delete old artifacts manually:

```bash
tokenless clean --data-dir ~/.tokenless --older-than 7d
```

Keep only the newest 100:

```bash
tokenless clean --data-dir ~/.tokenless --keep 100
```

## Current limitations

- Claude Code Bash hook only.
- No cloud service and no LLM summarization.
- Reducers are deterministic and intentionally conservative.
- Legal, financial, medical, security, and exact-review tasks may require explicit artifact expansion.
- Small outputs can still expand slightly if forced through Tokenless; the classifier avoids common bounded commands, but the policy is not perfect.
