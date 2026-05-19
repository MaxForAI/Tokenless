<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" width="360" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>Un solo comando para reducir el uso de tokens de Claude Code en 50%+.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#instalación">Instalación</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#perfiles-de-salida">Perfiles</a> ·
  <a href="#benchmark-evidence">Benchmark Evidence</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#privacidad-y-seguridad">Privacidad</a> ·
  <a href="docs/benchmarking.md">Guía completa</a>
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

Claude Code se vuelve caro cuando cada log, lectura de archivo, diff y respuesta larga sigue entrando en la siguiente request.

Tokenless arregla eso.

Mantiene la evidencia original en tu máquina, envía a Claude una versión compacta y te deja expandir la salida original solo cuando la necesitas.

## Por qué Tokenless

Las sesiones de Claude Code pueden volverse caras porque las salidas de herramientas, lecturas de archivos, historial Task/Plan y respuestas largas se arrastran a futuras requests API.

Tokenless reduce tres fuentes principales de crecimiento:

- Salidas grandes de herramientas: logs de tests, logs de build, resultados de búsqueda, árboles de archivos, diffs, lecturas grandes y resultados grandes de edit/write.
- Overhead de trayectoria del agente: exploración repetida, historial Task/Plan y payloads grandes de archivos originales.
- Verbosidad de respuesta: los perfiles `chat` y `coding` hacen que Claude responda más corto.

## Before / After

| Claude Code normal | Claude Code con Tokenless |
| --- | --- |
| Archivos grandes o logs se repiten en el contexto futuro. | La salida original queda local y Claude recibe un paquete compacto. |
| Respuestas finales largas pasan al historial de la siguiente request. | Los perfiles `chat` y `coding` mantienen respuestas cortas. |
| La exploración y el historial de planes aumentan el contexto. | El launcher reduce por defecto el overhead de Task/Plan tools. |

Ejemplo:

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

## Instalación

Instalar desde GitHub:

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless se distribuye actualmente vía GitHub. Todavía no está publicado en el registry público de npm.

Desarrollo local:

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

Verificar instalación:

```bash
tokenless status --user
```

## Perfiles de salida

Tokenless tiene tres perfiles públicos:

| Perfil | Comportamiento |
| --- | --- |
| `chat` | Predeterminado. Respuestas cortas y legibles en lenguaje natural. Solo cambia el estilo de salida. |
| `coding` | Respuestas densas y estructuradas para workflows de coding. Solo cambia el estilo de salida. |
| `off` | Hard-off completo. Desactiva style injection y compression hooks. |

Configurar un perfil:

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Atajos de Claude Code:

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

El perfil elegido se guarda en `~/.tokenless/style.json` y persiste después de reiniciar Claude Code.

## Expandir evidencia original

Ver el último artifact:

```bash
tokenless latest --data-dir ~/.tokenless
```

Expandir por palabra clave:

```bash
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
```

Expandir por líneas:

```bash
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

## Comandos útiles

```bash
tokenless --help
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless api-usage --since 24h
```

## Privacidad y seguridad

- Tokenless corre localmente.
- Los artifacts originales permanecen en el disco local.
- Tokenless no llama a otro LLM ni a un servicio cloud de resumen.
- Los reducers son deterministas.
- Las salidas riesgosas o fallidas pasan sin compresión.
- Para legal, finanzas, medicina, seguridad y revisión estricta de código, expande explícitamente la evidencia original.

## Limitaciones

- La integración principal es Claude Code hooks.
- Los API-body token counts son estimaciones, no facturación exacta.
- Las salidas pequeñas pueden crecer si se fuerzan por Tokenless.
- Un read packet es un índice de evidencia, no reemplaza la expansión exacta de líneas antes de una edición riesgosa.

## Star this repo

Tokenless ahorra tokens y conserva la evidencia original. Una estrella cuesta cero. Trato justo.

[![Star History Chart](https://api.star-history.com/svg?repos=MaxForAI/Tokenless&type=Date)](https://star-history.com/#MaxForAI/Tokenless&Date)

## Acknowledgements

Tokenless is an independent implementation and does not use code from [caveman](https://github.com/JuliusBrussee/caveman). We acknowledge caveman as part of the broader open-source conversation around shorter, lower-token agent output.

## License

MIT. Libre para usar, modificar y distribuir.

## Contributors

- Max Liu
- Codex, AI coding assistant
