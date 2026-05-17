---
name: context-compression
description: Use Tokenless for large files and noisy tool outputs before they enter context. Must be used when commands, Read output, diffs, logs, or search results are large.
---

# Tokenless Context Compression

When working in this project, do not feed noisy raw outputs or large files directly into context.

Tokenless is mandatory for large or noisy context:
- If a file is large, first use `tokenless read --agent --data-dir <dir> <file>`.
- If a Bash command is noisy, first use `tokenless run --agent --data-dir <dir> -- <command>`.
- If a Tokenless hook blocks or caps a tool call, do not bypass it with another full-output command.
- If you need exact evidence after a packet, expand the artifact before editing.
- If Tokenless reports a pending large-file gate, the next action must be the exact `NEXT REQUIRED COMMAND`.

The hook automatically caps high-noise Bash commands and large low-risk Read outputs through Tokenless.

Keep tool inputs small:
- Tokenless saves context by replacing large tool outputs with compact packets. Do not recreate the same token cost by sending huge generated tool inputs.
- Prefer `tokenless read`, `tokenless expand`, and small bounded `Edit`/`MultiEdit` calls over large patch scripts.
- Do not create large heredocs, `cat > file <<EOF`, giant `node -e` / `python -` commands, or temporary apply/fix/rewrite scripts unless the user explicitly asks.
- If you feel tempted to write a big script to patch a large file, stop and use Tokenless to expand the exact lines, then edit only that small region.

For manual local development in this repository, use `./plugins/claude-code/bin/tokenless` or the packaged `tokenless` alias:

```bash
./plugins/claude-code/bin/tokenless run --agent --data-dir /tmp/tokenless-dev -- npm test
```

High-noise commands include:
- npm test, pnpm test, yarn test
- pytest
- npm/pnpm/yarn build, lint, typecheck, install
- go test, cargo test, mvn test/verify/package, gradle build/test
- git diff, git log
- rg, grep -R
- find, tree, ls -R
- docker logs/build, kubectl logs/describe, Vercel/Netlify CLI logs

When you see a `TOKENLESS-PACKET` block:
1. Treat it as a compressed evidence packet.
2. Use the key failures, relevant files, line numbers, and raw artifact pointer.
3. Do not ask for the full raw output unless needed.
4. If needed, use the full raw artifact command shown in the `Raw artifact:` line.

When you see a `TOKENLESS-READ-PACKET` block:
1. Treat it as an index, not exact edit evidence.
2. Do not edit code or styles from the packet alone.
3. Expand exact evidence first with `tokenless expand <artifact_id> --around "<selector-or-symbol>"` or `tokenless expand <artifact_id> --lines <start:end>`.
4. Only edit after reading the exact expanded lines that contain the target.

Large-file edit discipline:
1. First run `tokenless read`, then `tokenless expand` the exact target region.
2. Prefer one small `MultiEdit` for related nearby changes in that expanded region.
3. If the request is broad or ambiguous, start with a small high-impact region or ask to confirm scope. Do not jump to a file-wide rewrite.
4. A successful small `Edit` or bounded `MultiEdit` may keep a short Tokenless edit lease for the same file.
5. Run `tokenless read` again after `Write`, large edits, external file changes, lease exhaustion, or when Tokenless explicitly blocks with `TOKENLESS-STALE`.
6. If a stale-packet hook blocks an edit, the blocked tool call did not execute. Do not claim that blocked edit succeeded.
7. Do not use a large generated patch script as a workaround for the stale gate. Refresh the packet and make small bounded edits.
8. If the lease is still active, continue with small bounded edits. If unsure, refresh with `tokenless read`.

When a large `Read` is capped:
1. Run the exact `tokenless read` command shown by the hook.
2. Use the packet to identify relevant selectors, symbols, sections, or line ranges.
3. Run `tokenless expand` for the target area.
4. Then use normal editing tools on the exact lines.
5. Do not replace this flow with `cat`, unbounded `grep`, or a full-file `Read`.

When Tokenless prints `NEXT REQUIRED COMMAND`:
1. Run that command exactly.
2. Do not run `grep`, `rg`, `sed`, `cat`, `head`, `tail`, `Read`, `Edit`, `MultiEdit`, or `Write` against the gated file first.
3. After the command succeeds, use the resulting artifact id for `tokenless expand`.
4. Only then inspect bounded lines or edit the target file.

Bounded commands are allowed after Tokenless has created the packet:
- `sed -n '100,160p' file`
- `rg -n "target" file`
- `tokenless expand <artifact_id> --around "target"`

Bounded commands are not a replacement for the initial large-file Tokenless packet when the file is known to be large.
Large generated commands are not bounded, even if they write locally. Avoid large heredocs, large inline scripts, and temporary patch helpers unless the user explicitly asks for them.

Never assume omitted sections are irrelevant if the task requires exact full-text review. For legal, financial, security-critical, or exact patch review tasks, inspect raw artifacts when necessary.
