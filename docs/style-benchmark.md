# Tokenless output style benchmark

Tokenless style controls Claude Code response shape. This benchmark isolates
response-token behavior from read/edit/write packet compression by using prompts
that do not trigger Tokenless file reducers.

## Public modes

| Mode | Purpose | Internal basis |
| --- | --- | --- |
| `chat` | Shortest readable natural-language output | Previous `silent` experiment |
| `coding` | Dense structured output for coding workflows | Previous `dense2` D2 experiment |
| `off` | Disable style injection | Baseline |

Legacy experiment names such as `lean`, `silent`, `wire`, `dense`, and `dense2`
are accepted as compatibility aliases, but the public surface is intentionally
limited to `chat`, `coding`, and `off`.

## Result summary

Six-prompt Claude Code API-body run:

| Public mode | Response tokens | Responses | Avg / response | Change vs off |
| --- | ---: | ---: | ---: | ---: |
| `off` | 2,168 | 6 | 361 | baseline |
| `chat` | 1,189 | 6 | 198 | -45.2% |
| `coding` | 1,085 | 6 | 181 | -50.0% |

Decision:

- Use `chat` as the default because it remains human-readable while cutting
  response tokens by 45.2% versus `off`.
- Use `coding` for Claude Code coding workflows where structured dense output is
  acceptable. It is the current lowest-token mode and beats `chat` by 8.7%.

## Historical experiment table

| Experiment | Response tokens | Responses | Avg / response | Note |
| --- | ---: | ---: | ---: | --- |
| `lean` | 1,433 | 6 | 239 | Readable, but 17.0% longer than `silent`/`chat`. |
| `silent` | 1,189 | 6 | 198 | Chosen as public `chat`. |
| `wire` | 1,347 | 6 | 225 | Useful research direction, not kept as product mode. |
| `dense` | 1,192 | 6 | 199 | Subjectively fast, later beaten by D2. |
| `dense2` | 1,085 | 6 | 181 | Chosen as public `coding`. |
| `bullet` | 1,481 | 6 | 247 | Close to `lean`, but weaker than `chat`. |
| `patch` | 2,121 | 6 | 354 | Too narrow for mixed prompts. |
| `terse` | 2,045 | 7 | 292 | Non-comparable total due to extra response. |
| `reviewer` | 2,731 | 6 | 455 | Increased output tokens. |
| `wenyan` | 2,583 | 6 | 431 | Increased output tokens. |

## Running a fresh comparison

Start one style run:

```bash
cd /Users/mac/Documents/TokenCap/Tokenless
node plugins/claude-code/bin/tokenless style-benchmark start chat
```

Then run the printed launch command, enter the printed prompts, and collect
stats with the printed stats command.

Repeat for:

```bash
node plugins/claude-code/bin/tokenless style-benchmark start coding
node plugins/claude-code/bin/tokenless style-benchmark start off
```

Use the same prompt order and a fresh Claude Code session for each mode.
