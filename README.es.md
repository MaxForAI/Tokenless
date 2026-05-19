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
  <a href="#perfiles-de-salida">Perfiles</a> ·
  <a href="#benchmarks-verificados">Benchmarks</a> ·
  <a href="#privacidad-y-seguridad">Privacidad</a> ·
  <a href="docs/benchmarking.md">Guía completa</a>
</p>

---

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

## Benchmarks verificados

Estas medidas vienen de API bodies reales de Claude Code. La métrica principal es tokens estimados en request bodies crudos, no una estimación local del hook.

| Escenario | Baseline | Tokenless | Reducción |
| --- | ---: | ---: | ---: |
| 5-turn CRM vibe coding, `off` vs `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6-turn natural conversation, `off` vs `chat` | 7,223 response tokens | 1,442 | 80.0% |
| 10k-line React/TSX edit | 917,137 request tokens | 545,456 | 40.5% |
| Multifile React dashboard | 628,261 request tokens | 512,521 | 18.4% |

La metodología completa está en [docs/benchmarking.md](docs/benchmarking.md) y [docs/style-benchmark.md](docs/style-benchmark.md).

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

## Contributors

- Max Liu
- Codex, AI coding assistant
