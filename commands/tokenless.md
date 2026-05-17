---
description: Show Tokenless local compression savings and latest artifact
allowed-tools: Bash
---

Show local Tokenless status, compression savings, and latest artifact.

This repository template assumes `tokenless` is available on PATH. The installer writes a user-level command with an absolute local CLI path.

Run:

```bash
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless status --user
tokenless api-usage --since 24h
tokenless api-probe stats --dir ~/.tokenless/api-bodies-realtest --data-dir ~/.tokenless
```

Then answer compactly:

```text
Tokenless:
- hooks: installed|not installed
- calls: <n>
- local_saved: <tokens_saved> tokens (hook-local before -> after; good for product/demo)
- local_ratio: <compression_ratio>
- source: hook=<calls/saved>, eval=<calls/saved>, smoke=<calls/saved>
- real_hook: <hook calls and saved tokens>
- api_confirmed: unique_artifacts=<n>, unique_saved=<n>, request_saved_estimate=<n>, caveat=not billing
- api_evidence: request_tokens=<n>, read_packet=<request matches>, edit_packet=<request matches>, raw_edit_payload=<request matches>
- read_packet: <read-packet calls and saved tokens if present; API-confirmed when request matches exist>
- edit_packet: <edit-packet calls and saved tokens if present; hook-local unless API request matches exist>
- write_packet: <write-packet calls and saved tokens if present; hook-local unless API request matches exist>
- gates: pending=<n>, packet_index=<n>
- api_24h: <total_tokens> tokens
- latest: <artifact_id or none>
- expand: <exact expand command if latest exists>
```

Do not expand raw artifacts unless the user asks for details.
