<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" width="360" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>Une seule commande pour réduire l'usage de tokens Claude Code de 50%+.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#profils-de-sortie">Profils</a> ·
  <a href="#benchmark-evidence">Benchmark Evidence</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#confidentialité-et-sécurité">Confidentialité</a> ·
  <a href="docs/benchmarking.md">Méthode complète</a>
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

Claude Code devient coûteux quand chaque log, lecture de fichier, diff et longue réponse continue d'être transporté dans la requête suivante.

Tokenless corrige ce problème.

Il garde les preuves brutes sur votre machine, envoie à Claude une version compacte, puis vous laisse développer la sortie originale seulement quand vous en avez besoin.

## Pourquoi Tokenless

Les sessions Claude Code deviennent coûteuses parce que les sorties d'outils, lectures de fichiers, historiques Task/Plan et réponses longues sont transportés dans les requêtes API suivantes.

Tokenless cible trois sources de croissance:

- Sorties d'outils volumineuses: logs de tests, logs de build, résultats de recherche, arbres de fichiers, diffs, gros fichiers, gros résultats edit/write.
- Overhead de trajectoire agent: exploration répétée, historique Task/Plan, gros payloads de fichiers bruts.
- Verbosité des réponses: les profils `chat` et `coding` raccourcissent les réponses de Claude.

## Before / After

| Claude Code normal | Claude Code avec Tokenless |
| --- | --- |
| Les gros fichiers ou logs reviennent dans le contexte futur. | Les données brutes restent locales, Claude reçoit un paquet compact. |
| Les longues réponses finales deviennent de l'historique dans la requête suivante. | Les profils `chat` et `coding` gardent les réponses courtes. |
| L'exploration et l'historique de plan augmentent le contexte. | Le launcher réduit par défaut l'overhead Task/Plan. |

Exemple:

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

## Installation

Installer depuis GitHub:

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless est actuellement distribué via GitHub. Il n'est pas encore publié sur le registry npm public.

Développement local:

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

Vérifier l'installation:

```bash
tokenless status --user
```

## Profils de sortie

Tokenless propose trois profils publics:

| Profil | Comportement |
| --- | --- |
| `chat` | Défaut. Réponses courtes, lisibles, en langage naturel. Change uniquement le style de sortie. |
| `coding` | Réponses denses et structurées pour les workflows de coding. Change uniquement le style de sortie. |
| `off` | Hard-off complet. Désactive style injection et compression hooks. |

Définir un profil:

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Raccourcis Claude Code:

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

Le profil choisi est stocké dans `~/.tokenless/style.json` et persiste après redémarrage de Claude Code.

## Développer la preuve brute

Voir le dernier artifact:

```bash
tokenless latest --data-dir ~/.tokenless
```

Développer par mot-clé:

```bash
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
```

Développer par lignes:

```bash
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

## Commandes utiles

```bash
tokenless --help
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless api-usage --since 24h
```

## Confidentialité et sécurité

- Tokenless s'exécute localement.
- Les artifacts bruts restent sur le disque local.
- Tokenless n'appelle pas un autre LLM ni un service cloud de résumé.
- Les reducers sont déterministes.
- Les sorties risquées ou échouées passent sans compression.
- Pour le juridique, financier, médical, sécurité et revue de code stricte, développez explicitement la preuve brute.

## Limites

- L'intégration principale cible Claude Code hooks.
- Les token counts API-body sont des estimations, pas une facturation exacte.
- Les petites sorties peuvent devenir légèrement plus longues si elles sont compressées de force.
- Un read packet est un index de preuves, pas un substitut à l'expansion exacte des lignes avant une modification risquée.

## Star this repo

Tokenless économise des tokens et garde les preuves brutes. Une star ne coûte rien. Échange équitable.

[![Star History Chart](https://api.star-history.com/svg?repos=MaxForAI/Tokenless&type=Date)](https://star-history.com/#MaxForAI/Tokenless&Date)

## Acknowledgements

Tokenless is an independent implementation and does not use code from [caveman](https://github.com/JuliusBrussee/caveman). We acknowledge caveman as part of the broader open-source conversation around shorter, lower-token agent output.

## License

MIT. Libre d'utiliser, modifier et distribuer.

## Contributors

- Max Liu
- Codex, AI coding assistant
