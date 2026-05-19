<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" width="360" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>一行命令，让 Claude Code 的 token 消耗减少 50%+。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#输出模式">输出模式</a> ·
  <a href="#benchmark-与证据">Benchmark 与证据</a> ·
  <a href="#路线图">路线图</a> ·
  <a href="#隐私和安全">隐私和安全</a> ·
  <a href="docs/benchmarking.md">完整测试方法</a>
</p>

---

## 快速开始

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless install-commands --user
tokenless launch
```

然后正常使用 Claude Code。随时切换模式：

```bash
tokenless style chat     # 可读、简短回复
tokenless style coding   # 更高密度的 coding 输出
tokenless style off      # 完全关闭
```

Claude Code 变贵，通常不是因为你写了太多代码，而是因为日志、文件读取、diff 和长回复会不断进入下一轮请求。

Tokenless 解决这个问题。

它把完整原始证据留在本地，只把压缩后的上下文发给 Claude；需要细节时，再展开原始输出。

## 为什么需要 Tokenless

Claude Code 会把工具输出、文件读取、任务计划历史和助手回复继续带进后续 API 请求。时间一长，上下文会快速变大。

Tokenless 主要压缩三类增长：

- 大型工具输出：测试日志、构建日志、搜索结果、目录树、diff、大文件读取、大型 edit/write 结果。
- Agent 轨迹开销：重复探索、Task/Plan 工具历史、大型原始文件载荷。
- 回复冗长：`chat` 和 `coding` 模式让 Claude 的回复更短。

## Before / After

| 普通 Claude Code | 使用 Tokenless |
| --- | --- |
| 大文件或日志会反复进入后续上下文。 | 原始内容留在本地，只发送紧凑证据包。 |
| 冗长最终回复会继续变成下一轮请求历史。 | `chat` / `coding` 模式控制回复长度。 |
| 反复探索和计划会推高请求体大小。 | 默认 launcher 会减少 Task/Plan 工具开销。 |

示例：

```text
TOKENLESS-READ-PACKET/0.1
file: /path/to/src/App.tsx
artifact_id: ctx_20260518_abc123
summary: imports, symbols, snippets, nearby files, exact expansion commands
```

## Benchmark 与证据

Tokenless 的证据分两层：一层是真实 Claude Code API-body benchmark，另一层是外部研究对“短输出、上下文压缩、减少冗余”这个方向的支持。

### 真实 Claude Code 测试

这些数据来自真实 Claude Code API body。主指标是 raw API request/response body 的估算 token 数，不是本地 hook 侧的宣传估算。

| 场景 | 基线 | Tokenless | 降幅 |
| --- | ---: | ---: | ---: |
| 5 轮 CRM vibe coding，`off` 对比 `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6 轮自然对话，`off` 对比 `chat` | 7,223 response tokens | 1,442 | 80.0% |
| 大型 CSS 视觉编辑 | 1,017,642 request tokens | 403,995-473,354 | ~54-60% |
| 10k 行 React/TSX 编辑 | 917,137 request tokens | 545,456 | 40.5% |
| 多文件 React dashboard | 628,261 request tokens | 512,521 | 18.4% |

最强的产品 benchmark 是 5 轮 CRM vibe-coding：非专业用户用模糊自然语言反复要求产品打磨。`coding` 模式相比 clean `off`，request tokens 降低 47.3%，response tokens 降低 44.4%，请求次数降低 39.3%。

`chat` 的自然对话测试没有触发文件工具和 packet reducer，因此隔离了输出风格本身：response tokens 降低 80.0%。

完整方法和原始记录见 [docs/benchmarking.md](docs/benchmarking.md) 和 [docs/style-benchmark.md](docs/style-benchmark.md)。

### 研究支持

这些论文不能证明 Tokenless 在每个会话里都一定有效，但它们支持一个核心前提：上下文长度和回复长度是可以工程化控制的变量；更少的文字有时更便宜、更快，甚至更准确。

| 论文 | 和 Tokenless 的关系 |
| --- | --- |
| [Brevity Constraints Reverse Performance Hierarchies in Language Models](https://arxiv.org/abs/2604.00025) | 限制大模型回答长度，在一类 inverse-scaling 问题上让准确率提升 26.3 个百分点。Verbose 不总是更好。 |
| [Prompt Compression in the Wild](https://arxiv.org/abs/2604.02985) | 当工作负载、压缩率和硬件匹配时，prompt compression 可以带来真实端到端加速，同时质量统计上不变。 |
| [LLMLingua](https://arxiv.org/abs/2310.05736) | prompt compression 可以在高压缩率下保留语义完整性并降低推理成本。 |
| [LongLLMLingua](https://arxiv.org/abs/2310.06839) | 长上下文压缩可以提升关键信息感知，同时降低成本和延迟。 |
| [Selective Context](https://arxiv.org/abs/2310.06201) | 剪掉冗余上下文，实现 50% context cost、36% memory、32% inference time 降低，质量损失较小。 |
| [Gist Tokens](https://arxiv.org/abs/2304.08467) | 训练模型把 prompt 压缩成可复用 token，最高达到 26x prompt compression 和 40% FLOPs 降低。 |

## 路线图

Tokenless 现在主要处理 Claude Code 里的工具输出、文件读取和回复冗长带来的上下文膨胀。下一步会继续做：

- 用户 prompt 压缩：识别用户输入里的重复模式，在不丢失约束的前提下压缩意图，并保留原始 prompt 可回溯。
- Router 侧优化：在请求进入模型后端之前，减少重复上下文和风格控制开销。
- 更广的工作流支持：Claude Code 仍然是第一目标，之后评估其他 coding agent 工具里类似的上下文膨胀问题。

## 安装

从 GitHub 安装：

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless 目前通过 GitHub 分发，尚未发布到公开 npm registry。

从源码本地开发：

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

检查状态：

```bash
tokenless status --user
```

## 输出模式

Tokenless 有三个公开模式：

| 模式 | 行为 |
| --- | --- |
| `chat` | 默认模式。简短、可读的自然语言回复。只改变输出风格。 |
| `coding` | 面向 coding 工作流的高密度结构化回复。只改变输出风格。 |
| `off` | 完全关闭 Tokenless。禁用风格注入和压缩 hooks。 |

设置模式：

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Claude Code 快捷命令：

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

配置默认保存到 `~/.tokenless/style.json`，重启 Claude Code 后仍然生效。

## 如何展开原始证据

查看最新 artifact：

```bash
tokenless latest --data-dir ~/.tokenless
```

按关键词展开：

```bash
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
```

按行号展开：

```bash
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

## 常用命令

```bash
tokenless --help
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless api-usage --since 24h
```

## 隐私和安全

- Tokenless 在本地运行。
- 原始 artifacts 保存在本地磁盘。
- Tokenless 不调用额外 LLM，也不调用云总结服务。
- 压缩 reducer 是确定性的。
- 风险输出和失败输出默认不压缩。
- 法律、金融、医疗、安全和严格代码审查场景，应该主动展开原始证据。

## 限制

- 当前主要集成目标是 Claude Code hooks。
- API-body token 数是估算，不是精确账单 token。
- 小输出如果被强行压缩，可能反而变长。
- Read packet 是证据索引，不是替代精确行号阅读。

## 为这个仓库点星

Tokenless 帮你省 token，也保留原始证据。点星不花钱。公平交易。

[![Star History Chart](https://api.star-history.com/svg?repos=MaxForAI/Tokenless&type=Date)](https://star-history.com/#MaxForAI/Tokenless&Date)

## 致谢

Tokenless 是独立实现，没有使用 [caveman](https://github.com/JuliusBrussee/caveman) 的代码。但 caveman 推动了“更短、更省 token 的 agent 输出”这个开源讨论，值得在这里致谢。
## 许可证

MIT。可以自由使用、修改和发布。

## 贡献者

- Max Liu
- Codex, AI coding assistant
