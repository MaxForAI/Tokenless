# Fuzzy UI edit benchmark

This benchmark measures a vague natural-language UI editing task in a real Claude Code session.

It is intentionally different from a precise selector edit. When the user names the exact selector, Claude Code can often localize with search and partial reads. Tokenless is most useful when the agent does not know where to look yet.

## Task

The task was run against two copies of the same large CSS file, one with Tokenless hooks enabled and one with Tokenless hooks disabled.

Prompt:

```text
<large-css-file>

This page looks a bit ordinary. Make the overall visual quality feel more premium.
Focus on cards, buttons, background depth, and hover feedback.
Do not make it purple. Do not make it green.
Keep the cyber/technical cyan and orange direction.
Decide which styles need to change.
```

## Measurement

Measurement source:

- Claude Code raw API body logging through `OTEL_LOG_RAW_API_BODIES`
- `tokenless api-probe stats`

Metric:

- Estimated request-body tokens from raw API request files.
- This is not exact billed-token savings. Claude cache reads/writes can change billing.
- The metric is still useful because it measures what was actually sent in request bodies.

## Result

```text
Tokenless ON:
request files: 15
request estimated tokens: 519,293

Tokenless OFF:
request files: 57
request estimated tokens: 2,822,541

Net request-body delta:
2,822,541 - 519,293 = 2,303,248 estimated tokens saved

Reduction:
81.6%
```

Packet evidence from the Tokenless ON run:

```text
TOKENLESS-READ-PACKET: request=19
artifacts_observed_in_requests: 3
artifacts_with_local_stats: 3
unique_saved_tokens: 178,173
request_saved_estimate: 1,123,296
```

Raw edit payload leak checks from the Tokenless ON run:

```text
originalFile: request=0
structuredPatch: request=0
oldString: request=0
newString: request=0
```

## Interpretation

Tokenless reduced request-body size in this fuzzy UI edit because the agent did not know the exact selectors up front. Without Tokenless, the session produced many more API requests and repeatedly carried large context.

This does not mean Tokenless always saves tokens for large files.

Observed split:

- Precise selector edit: Claude Code can often search and partially read, so Tokenless may add overhead.
- Fuzzy natural-language edit: Tokenless can reduce repeated large-file context by turning large reads into compact packets.

Product claim to use:

```text
In a real Claude Code fuzzy UI edit on a large CSS file, Tokenless reduced estimated API request-body tokens by 81.6%: 2.82M -> 519K.
```

Safer technical wording:

```text
Tokenless reduced estimated request-body tokens by 2.3M in this run. This is measured from raw API request bodies, not billing records.
```

## Reproduction outline

Prepare two equivalent files:

```bash
cp /path/to/large.css /path/to/style-fuzzy-on.css
cp /path/to/large.css /path/to/style-fuzzy-off.css
```

Run Tokenless ON:

```bash
cd /path/to/Tokenless

node plugins/claude-code/bin/tokenless install-hooks --user

mkdir -p ~/.tokenless/api-bodies-fuzzy-on-$(date +%Y%m%d-%H%M%S)
export TOKENLESS_API_ON_DIR=$(ls -td ~/.tokenless/api-bodies-fuzzy-on-* | head -1)
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:$TOKENLESS_API_ON_DIR

claude
```

Run Tokenless OFF:

```bash
cd /path/to/Tokenless

node plugins/claude-code/bin/tokenless uninstall-hooks --user

mkdir -p ~/.tokenless/api-bodies-fuzzy-off-$(date +%Y%m%d-%H%M%S)
export TOKENLESS_API_OFF_DIR=$(ls -td ~/.tokenless/api-bodies-fuzzy-off-* | head -1)
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:$TOKENLESS_API_OFF_DIR

claude
```

Inspect both runs:

```bash
cd /path/to/Tokenless

node plugins/claude-code/bin/tokenless api-probe stats \
  --dir "$TOKENLESS_API_ON_DIR" \
  --data-dir ~/.tokenless

node plugins/claude-code/bin/tokenless api-probe stats \
  --dir "$TOKENLESS_API_OFF_DIR" \
  --data-dir ~/.tokenless
```

Compare:

```text
off_request_estimated_tokens - on_request_estimated_tokens = net request-body tokens saved
```
