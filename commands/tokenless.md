---
description: Show Tokenless status, savings, latest artifact, and style controls
argument-hint: "[style <status|chat|coding|off>]"
allowed-tools: Bash
---

If the first argument is `style`, handle it as a style command:

Run `tokenless style <style> --data-dir ~/.tokenless` if a style is provided.
Run `tokenless style status --data-dir ~/.tokenless` if no style is provided.
Then report the printed `effective_style`, `style_source`, and restart note.

Valid styles: `chat`, `coding`, `off`.

Do not run stats/latest for style commands.

Otherwise, show a compact Tokenless dashboard.

This repository template assumes `tokenless` is available on PATH. The installer writes a user-level command with an absolute local CLI path.

Run:

```bash
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
```

Then answer compactly:

```text
Tokenless:
- hooks: installed|not installed
- mode: on|off and source
- style: chat|coding|off and source
- local_saved: <tokens_saved> tokens
- local_ratio: <compression_ratio>
- sources: hook=<saved>, eval=<saved>, smoke=<saved>
- read/edit/write packets: <counts and saved tokens>
- gates: pending=<n>
- latest: <artifact_id or none>
- expand: <exact expand command if latest exists>
```

Do not expand raw artifacts unless the user asks for details.
