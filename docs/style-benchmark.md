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

## Research support

The style benchmark is not only a cost measurement. It tests a broader hypothesis: shorter, denser model output can reduce API cost and sometimes improve answer quality by removing over-elaboration. The current evidence is suggestive, not a universal guarantee.

Relevant papers:

- [Brevity Constraints Reverse Performance Hierarchies in Language Models](https://arxiv.org/abs/2604.00025) (Hakim, 2026) found that brevity constraints improved large-model accuracy by 26.3 percentage points on inverse-scaling problems. This supports the benchmark premise that verbose output is not automatically better; in some settings, less wording can be more correct.
- [Prompt Compression in the Wild](https://arxiv.org/abs/2604.02985) (Kummer et al., 2026) found that prompt compression can deliver real end-to-end speedups when prompt length, compression ratio, and hardware are well matched, while quality remains statistically unchanged across summarization, code generation, and question answering. This supports measuring real API-body and latency behavior rather than assuming compression always helps.
- [LLMLingua](https://arxiv.org/abs/2310.05736) (Jiang et al., 2023) showed that prompt compression can reduce inference cost while preserving semantic integrity under high compression ratios.
- [LongLLMLingua](https://arxiv.org/abs/2310.06839) (Jiang et al., 2024) showed that long-context compression can improve key-information perception while reducing cost and latency.
- [Selective Context](https://arxiv.org/abs/2310.06201) (Li et al., 2023) pruned redundant input context and reported 50% context-cost reduction, 36% memory reduction, and 32% inference-time reduction with only minor quality loss.
- [Gist Tokens](https://arxiv.org/abs/2304.08467) (Mu et al., 2023) trained models to compress prompts into reusable tokens, reaching up to 26x prompt compression and up to 40% FLOPs reduction.

How this maps to Tokenless benchmarks:

- `chat` and `coding` test output brevity and density.
- Read/edit/write packets test context compression for noisy Claude Code tool output.
- True `off` comparisons are still required; research support does not replace API-body measurement.
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

## Clean natural-conversation run

This run uses six ordinary non-coding prompts: explain agents, give practical
criteria for product managers, walk through a user-feedback example, name
specific risks, propose a first-week trial, and summarize the case for a boss.

No file tools or Tokenless packet reducers were involved.

| Mode | Request tokens | Response tokens | All tokens | Requests | Responses |
| --- | ---: | ---: | ---: | ---: | ---: |
| `off` | 142,748 | 7,223 | 149,971 | 7 | 7 |
| `chat` | 136,926 | 1,442 | 138,368 | 7 | 7 |

Result:

- Response tokens: -5,781, or -80.0%.
- Request tokens: -5,822, or -4.1%.
- All API-body tokens: -11,603, or -7.7%.
- Packet evidence stayed zero on both sides, so this isolates style behavior.

Interpretation:

- `chat` should be positioned as response-token and readability-cost reduction.
- In non-coding conversations, total savings are smaller than response savings
  because each turn still carries the accumulated conversation in the request.
- The clean run had equal request/response counts, unlike interrupted or
  contaminated conversation runs.

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
