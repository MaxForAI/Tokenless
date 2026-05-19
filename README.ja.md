<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" width="360" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>1つのコマンドで Claude Code の token 消費を 50%+ 削減。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#インストール">インストール</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#出力プロファイル">プロファイル</a> ·
  <a href="#benchmark-evidence">Benchmark Evidence</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#プライバシーと安全性">プライバシー</a> ·
  <a href="docs/benchmarking.md">詳細な検証方法</a>
</p>

---

## Quick start

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless install-commands --user
tokenless launch
```

Then use Claude Code normally. Switch profiles anytime:

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Claude Code が高くつく理由は、コードを書きすぎることだけではありません。log、file read、diff、長い reply が次の request に何度も持ち込まれるからです。

Tokenless はその問題を解決します。

Raw evidence はあなたの machine に残し、Claude には compact な context だけを送ります。必要なときだけ元の output を展開できます。

## なぜ Tokenless か

Claude Code は tool output、file read、task/plan history、assistant reply を後続の API request に持ち越します。長い session ほど context が大きくなります。

Tokenless は主に次を削減します。

- 大きな tool output: test log、build log、search result、tree output、diff、大きな file read、大きな edit/write result。
- Agent trajectory overhead: repeated exploration、Task/Plan tool history、大きな raw file payload。
- Response verbosity: `chat` と `coding` profiles で assistant output を短くします。

## Before / After

| 通常の Claude Code | Tokenless 使用時 |
| --- | --- |
| 大きな file/log output が将来の context に繰り返し入る。 | raw output はローカルに保存し、compact packet だけを送る。 |
| 長い final reply が次の request history に残る。 | `chat` / `coding` profiles で reply を短く保つ。 |
| exploration や task-plan history が context を増やす。 | launcher は Task/Plan tools をデフォルトで抑制する。 |

例:

```text
TOKENLESS-READ-PACKET/0.1
file: /path/to/src/App.tsx
artifact_id: ctx_20260518_abc123
summary: imports, symbols, snippets, nearby files, exact expansion commands
```

## Benchmark Evidence

Tokenless combines two evidence layers: real Claude Code API-body measurements and external research on brevity, prompt compression, and context compression.

### Real Claude Code runs

| Scenario | Baseline | Tokenless | Reduction |
| --- | ---: | ---: | ---: |
| 5-turn CRM vibe coding, `off` vs `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6-turn natural conversation, `off` vs `chat` | 7,223 response tokens | 1,442 | 80.0% |
| 10k-line React/TSX edit | 917,137 request tokens | 545,456 | 40.5% |
| Multifile React dashboard | 628,261 request tokens | 512,521 | 18.4% |

Detailed methodology and raw run notes are in [docs/benchmarking.md](docs/benchmarking.md) and [docs/style-benchmark.md](docs/style-benchmark.md).

### Research backing

- [Brevity Constraints Reverse Performance Hierarchies in Language Models](https://arxiv.org/abs/2604.00025): brevity constraints improved large-model accuracy by 26.3 percentage points on inverse-scaling problems.
- [Prompt Compression in the Wild](https://arxiv.org/abs/2604.02985): real speedups are possible when compression ratio, workload, and hardware match.
- [LLMLingua](https://arxiv.org/abs/2310.05736) and [LongLLMLingua](https://arxiv.org/abs/2310.06839): prompt and long-context compression can reduce cost and latency while preserving key information.
- [Selective Context](https://arxiv.org/abs/2310.06201): pruning redundant context reported 50% context-cost reduction.
- [Gist Tokens](https://arxiv.org/abs/2304.08467): learned prompt compression reached up to 26x prompt compression.

## Roadmap

Tokenless currently focuses on Claude Code context growth from tool output, file reads, and response verbosity. Next areas:

- User prompt compression: compress repeated prompt patterns while preserving original constraints and recoverability.
- Router-side optimization: reduce duplicated context and style overhead before requests reach the model backend.
- Broader workflow support: keep Claude Code as the primary target, then evaluate adapters for other agentic coding tools.

## インストール

GitHub からインストール:

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless は現在 GitHub 経由で配布されています。public npm registry にはまだ公開されていません。

ローカル開発:

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

状態確認:

```bash
tokenless status --user
```

## 出力プロファイル

Tokenless には 3 つの public profile があります。

| Profile | 動作 |
| --- | --- |
| `chat` | Default。短く読みやすい自然言語 response。出力 style のみ変更。 |
| `coding` | Coding workflow 向けの dense structured response。出力 style のみ変更。 |
| `off` | Tokenless hard-off。style injection と compression hooks の両方を無効化。 |

設定:

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Claude Code slash commands:

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

選択した profile は `~/.tokenless/style.json` に保存され、Claude Code の再起動後も維持されます。

## Raw evidence の展開

最新 artifact:

```bash
tokenless latest --data-dir ~/.tokenless
```

キーワードで展開:

```bash
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
```

行番号で展開:

```bash
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

## よく使うコマンド

```bash
tokenless --help
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless api-usage --since 24h
```

## プライバシーと安全性

- Tokenless はローカルで動作します。
- Raw artifacts はローカルディスクに保存されます。
- 別の LLM や cloud summarization service を呼びません。
- Reducers は deterministic です。
- 失敗した output や risky output はそのまま通します。
- Legal、financial、medical、security、strict code review では raw evidence を明示的に展開してください。

## 制限

- 主な integration target は Claude Code hooks です。
- API-body token counts は推定値であり、正確な billing token ではありません。
- 小さな output を無理に圧縮すると、逆に長くなる場合があります。
- Read packet は evidence index であり、重要な編集前の exact line expansion の代替ではありません。

## このリポジトリに Star を

Tokenless は token を節約し、raw evidence も保持します。Star は無料です。Fair trade.

[![Star History Chart](https://api.star-history.com/svg?repos=MaxForAI/Tokenless&type=Date)](https://star-history.com/#MaxForAI/Tokenless&Date)

## Acknowledgements

Tokenless is an independent implementation and does not use code from [caveman](https://github.com/JuliusBrussee/caveman). We acknowledge caveman as part of the broader open-source conversation around shorter, lower-token agent output.

## License

MIT。自由に使用、変更、配布できます。

## Contributors

- Max Liu
- Codex, AI coding assistant
