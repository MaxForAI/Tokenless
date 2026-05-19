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
  <a href="#出力プロファイル">プロファイル</a> ·
  <a href="#検証済み-benchmark">Benchmark</a> ·
  <a href="#プライバシーと安全性">プライバシー</a> ·
  <a href="docs/benchmarking.md">詳細な検証方法</a>
</p>

---

Tokenless は、Claude Code の coding workflow で API context が膨らむ問題を抑えるためのプラグインです。

大きな tool output が model context に入る前に intercept し、元の出力はローカルに保存します。Claude には compact な evidence packet だけを渡し、必要なときだけ元データを行番号やキーワードで展開できます。

Tokenless は LLM summarizer ではありません。別サービスにデータを送信しません。reducer はローカルで決定的に動作します。

現在の packet format: `TOKENLESS-PACKET/0.1`。

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

## 検証済み Benchmark

これらは実際の Claude Code API body から測定した結果です。主指標は raw API request body の推定 token 数であり、ローカル側の savings estimate ではありません。

| シナリオ | Baseline | Tokenless | 削減 |
| --- | ---: | ---: | ---: |
| 5-turn CRM vibe coding, `off` vs `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6-turn natural conversation, `off` vs `chat` | 7,223 response tokens | 1,442 | 80.0% |
| 10k-line React/TSX edit | 917,137 request tokens | 545,456 | 40.5% |
| Multifile React dashboard | 628,261 request tokens | 512,521 | 18.4% |

詳細は [docs/benchmarking.md](docs/benchmarking.md) と [docs/style-benchmark.md](docs/style-benchmark.md) を参照してください。

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

## Contributors

- Max Liu
- Codex, AI coding assistant
