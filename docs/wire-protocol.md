# Tokenless Wire Protocol concept

This document captures the product idea discussed on 2026-05-19: Tokenless can
reduce model cost not only by compressing tool output and input context, but
also by shaping model-visible output into a shared compact protocol.

## Working hypothesis

Frontier models from different providers are converging in instruction-following
ability. If the semantic gap between them is small enough, a compact shared
protocol can be understood across models:

```text
TLW1|ok=1|act=edit|chg=3|val=smoke:pass|risk=hooks-restart|next=none
```

This is not encryption. A better term is:

```text
shared semantic compression protocol
```

or:

```text
model-readable wire format
```

The goal is to encode the same information with fewer output tokens, while
remaining stable enough for another model, agent, script, or human operator to
decode.

## User insight

The user hypothesis:

- If large models have similar semantic decoding ability, the same compact
  protocol should be understood by GPT, Claude, Gemini, Qwen, DeepSeek, and
  similar models.
- Different models may pay different tokenization costs to read or emit the
  protocol, but if the returned information is equivalent, a sufficiently dense
  input/output format becomes a good engineering practice.
- The most token-efficient response may not be the most natural human-readable
  response.
- Therefore Tokenless should experiment with a protocol that asks the model to
  return the information it considers necessary in the densest stable format.

## Assistant framing

The assistant framing:

- Avoid calling this encryption unless there is a real secret key and security
  model.
- Prefer a compact, versioned, debuggable protocol over an opaque cipher.
- Extreme symbolic density can backfire if it tokenizes poorly, is unstable
  across providers, or becomes impossible to debug.
- Good protocol design should optimize for:
  - short output
  - stable cross-model interpretation
  - ASCII-only portability
  - versioning
  - partial human readability
  - easy parse success measurement

## Product layers

Tokenless now has three compression layers:

```text
tool-output/input compression  -> TOKENLESS-READ/EDIT/WRITE/PACKET
human-readable output style    -> lean / silent
machine-readable output style  -> wire / TLW1
```

Recommended public modes:

| Style | Purpose |
| --- | --- |
| `off` | Normal model output. |
| `lean` | Default balanced human-readable output compression. |
| `silent` | Maximum human-readable output compression. |
| `wire` | Experimental machine-readable output compression. |

## TLW1 MVP

TLW1 is intentionally small:

```text
TLW1|ok=<0|1>|act=<answer|edit|review|plan|block>|chg=<none|n|paths>|val=<none|pass|fail>|risk=<none|short>|next=<none|short>|msg=<short>
```

Field meanings:

| Field | Meaning |
| --- | --- |
| `ok` | `1` success or usable answer, `0` blocked/failure. |
| `act` | Main action type. |
| `chg` | Change scope, file count, or compact path list. |
| `val` | Validation status. |
| `risk` | Main residual risk, or `none`. |
| `next` | Next action, or `none`. |
| `msg` | Short answer payload when needed. |

Examples:

```text
TLW1|ok=1|act=answer|chg=none|val=none|risk=none|next=none|msg=lean saves ~34%, silent ~45%
```

```text
TLW1|ok=1|act=edit|chg=3|val=cli-smoke:pass|risk=restart-hooks|next=install-hooks
```

```text
TLW1|ok=0|act=block|chg=none|val=none|risk=missing-api-dir|next=rerun-probe
```

## Why not make `wire` default?

`wire` is not the right default for normal users:

- It is less pleasant to read.
- It can hide nuance.
- It needs parser and cross-model reliability testing.
- It may save visible output tokens but shift cost to later interpretation.

Default remains `lean`. `wire` should be used first for:

- agent-to-agent status
- CI and automation summaries
- benchmark result summaries
- coding-agent final status
- hook output summaries

## Experiment plan

Measure `wire` against `off`, `lean`, and `silent`.

Metrics:

| Metric | Description |
| --- | --- |
| `response_tokens` | Estimated response body tokens from API-body capture. |
| `parse_success` | Whether output matches TLW1 grammar. |
| `semantic_complete` | Whether required fields contain enough information. |
| `human_debuggable` | Whether a human can recover intent without extra tools. |
| `cross_model_consistency` | Whether different models emit equivalent TLW1 records. |

Initial benchmark:

```text
styles: off, lean, silent, wire
prompts: same six-prompt mixed set from docs/style-benchmark.md
capture: tokenless api-probe raw API bodies
compare: response estimated_tokens and manual semantic completeness
```

Cross-model benchmark:

```text
models: Claude, GPT, Gemini, Qwen, DeepSeek where available
input: identical TLW1 SessionStart/UserPromptSubmit rules
output: TLW1 records
score: parse_success + semantic_complete + response_tokens
```

## Current MVP implementation

`/tokenless style wire` writes `style.json` with `wire`.

The `UserPromptSubmit` hook injects this rule:

```text
TOKENLESS STYLE ACTIVE (wire). Use Tokenless Wire Protocol TLW1. Output one ASCII line when possible, no Markdown, no prose. Format: TLW1|ok=<0|1>|act=<answer|edit|review|plan|block>|chg=<none|n|paths>|val=<none|pass|fail>|risk=<none|short>|next=<none|short>|msg=<short>. Keep values short. Use msg for the answer if needed. If user asks for normal prose, safety warning, high-stakes advice, or multi-step ambiguity, temporarily answer normal concise text.
```

This is deliberately prompt-only. No parser or enforcement layer exists yet.

## Next implementation steps

1. Add a TLW1 parser and local validation command.
2. Add `tokenless wire check <text|file>` for parse success.
3. Add API-body style benchmark helper for `off/lean/silent/wire/dense/dense2`.
4. Add cross-model prompt fixture.
5. Decide whether `wire` stays public or becomes an experimental flag.

## D1 dense MVP

`dense` mode removes human readability as a primary constraint. It tests whether
models can reliably emit and later decode a denser semantic code than TLW1.

Hook rule:

```text
TOKENLESS STYLE ACTIVE (dense). Frontier experiment: optimize for minimum output tokens and low latency, not human readability. Use Tokenless Dense Protocol D1. No Markdown, no prose, no labels beyond D1 form. Emit one ASCII line. Forms: D1a <ans>; D1e <chg>|<val>|<risk>|<next>|<msg>; D1r <risk>|<fix>|<finding>; D1p <s1;s2;s3>; D1b <blocker>|<next>. Omit default 0/none fields when safe. Use dense abbreviations and symbols; preserve code/API names exactly. If safety/high-stakes/irreversible ambiguity, temporarily use concise normal text.
```

D1 forms:

| Form | Meaning |
| --- | --- |
| `D1a <ans>` | Direct answer. |
| `D1e <chg>|<val>|<risk>|<next>|<msg>` | Edit/status report. |
| `D1r <risk>|<fix>|<finding>` | Review finding. |
| `D1p <s1;s2;s3>` | Plan. |
| `D1b <blocker>|<next>` | Blocked state. |

Example:

```text
D1a useMemo=exp pure calc/ref-stab; skip cheap/prim/churn/correctness-crutch
```

```text
D1r skew,tz,untrusted-exp|UTCms+leeway+sig-first|missing/NaN exp reject; nbf check
```

The experiment compares:

```text
off
lean
silent
wire
dense
```

Measured result from the six-prompt Claude Code API-body run:

| Style | Response tokens | Responses | Avg / response | Change vs off |
| --- | ---: | ---: | ---: | ---: |
| `off` | 2,168 | 6 | 361 | baseline |
| `lean` | 1,433 | 6 | 239 | -33.9% |
| `silent` | 1,189 | 6 | 198 | -45.2% |
| `wire` | 1,347 | 6 | 225 | -37.9% |
| `dense` | 1,192 | 6 | 199 | -45.0% |
| `dense2` | 1,085 | 6 | 181 | -50.0% |

`dense` did not beat `silent` on estimated response tokens, but it tied it
within 3 tokens and subjectively felt faster in interactive use.

Actual dense outputs showed semantic-code behavior:

```text
D1a use:expensive_calc(>1ms)|ref_stable_for_deps|prevent_child_memo_break; skip:cheap_ops|primitives|deps_change_every_render|no_referential_consumer; cost:cache+deps_cmp≈overhead_of_recompute_for_trivial
```

```text
D1e filter+metric_cards+table_state+btn_feedback|UX_consistent/loading+empty+error_states|regression_in_legacy_filters_if_url_params_shared|manual_QA_cross_browser+a11y_check|done_pending_review
```

```text
D1r clock_skew_client_vs_server→false_accept/reject|use_server_time+leeway(30-60s)+refresh_window|missing:tz/unit(s vs ms)mismatch,exp==now边界(<=vs<),token撤销/黑名单未查,签名未验先比时间,exp缺失当永久有效,刷新token复用,时区或UTC假设错
```

Current interpretation:

- `silent` remains the strongest human-readable minimum-output mode.
- `dense2` is the current strongest model-readable semantic-code mode by
  response tokens.
- `dense` remains the D1 baseline and subjectively felt fast, but D2 now wins
  on measured output size.
- `wire` is more structured and parse-friendly, but its fixed field overhead is
  higher than `dense` / `dense2`.
- Future dense work should measure latency and decode success, not just output
  token count.

## D2 dense MVP

`dense2` keeps D1 available for comparison and tests a more compressed action
template:

```text
TOKENLESS STYLE ACTIVE (dense2). Use Tokenless Dense Protocol D2. Goal: min output tokens + low latency, not human readability. No prose, no Markdown, no legend, no abbreviation expansion. Emit one ASCII line. Forms: D2a <core>;!<avoid>;?<cond>. D2e <chg>|<val>|<risk>|<next>. D2r <risk>|<fix>|<edge>. D2p <s1>;<s2>;<s3>. D2b <why>|<next>. Omit default fields: none/pass/no-risk/no-next. Use compact ASCII only: ->,!,?,+,/,=. Preserve code/API names exactly. Prefer abbrev: exp,calc,ref,stab,dep,chg,val,nx,rej,sig,skew,ctx,req,res,err. If safety/high-stakes/irreversible ambiguity, temporarily use concise normal text.
```

Examples:

```text
D2a useMemo=expCalc/refStab;!cheap/prim/churn;?depsStable
```

```text
D2a err=typed+topCatch+stderr+exitCode;!swallow/process.exit-midAsync;?--json/DEBUG/SIGINT
```

```text
D2e filter+cards+table+btn|manualQA+a11y
```

```text
D2r skew/unit/sig/expMissing|UTCms+leeway+sigFirst+rejectBadExp|nbf/revoke/midReqExpire
```

Comparison target:

```text
dense  = D1 baseline
dense2 = D2 action-template candidate
```

Measured D2 result:

- `dense2` reduced response tokens by 50.0% versus `off`.
- `dense2` beat `silent` by 8.7%.
- `dense2` beat D1 `dense` by 9.0%.
- This supports the hypothesis that a non-human-natural-language semantic code
  can outperform the strongest human-readable compression style.
