#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tokenless = path.join(repoRoot, 'plugins', 'claude-code', 'bin', 'tokenless');
const postToolUse = path.join(repoRoot, 'plugins', 'claude-code', 'scripts', 'post_tool_use.js');
const dataDir = path.join(os.tmpdir(), 'tokenless-read-eval');

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function runHook(filePath, content) {
  const payload = JSON.stringify({
    tool_name: 'Read',
    tool_input: { file_path: filePath },
    tool_response: { type: 'text', file: content }
  });

  return spawnSync('node', [postToolUse], {
    input: payload,
    encoding: 'utf8',
    cwd: repoRoot,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, TOKENLESS_STATS_SOURCE: 'eval' }
  });
}

function runTokenless(args) {
  return spawnSync('node', [tokenless, ...args], {
    encoding: 'utf8',
    cwd: repoRoot
  });
}

function buildLargeCss() {
  const lines = [
    '/* synthetic large css */',
    ':root { --primary: #06b6d4; --accent: #f97316; }'
  ];

  for (let i = 0; i < 520; i++) {
    lines.push(`.filler-${i} { color: #${String(i).padStart(6, '0').slice(0, 6)}; padding: ${i}px; margin: ${i % 20}px; }`);
  }

  lines.push('.target-card {');
  lines.push('  border-radius: 20px;');
  lines.push('  background: linear-gradient(135deg, #06b6d4, #f97316);');
  lines.push('  box-shadow: 0 20px 60px rgba(6, 182, 212, 0.3);');
  lines.push('}');

  for (let i = 520; i < 1040; i++) {
    lines.push(`.filler-${i} { color: #${String(i).padStart(6, '0').slice(0, 6)}; padding: ${i}px; margin: ${i % 20}px; }`);
  }

  return lines.join('\n');
}

function buildLargeTsxEntry() {
  const lines = [
    "import { MetricCard } from './components/MetricCard';",
    "import { formatCurrency } from './utils/format';",
    "import './styles/dashboard.css';",
    '',
    'export function DashboardApp() {',
    '  return <main className="dashboard-shell"><MetricCard label="Cost" value={formatCurrency(42)} /></main>;',
    '}'
  ];

  for (let i = 0; i < 3400; i++) {
    lines.push(`export function GeneratedPanel${i}() { return <section className="panel-${i}">${i}</section>; }`);
  }

  return lines.join('\n');
}

function setupLargeTsxFixture() {
  const root = path.join(dataDir, 'multi-file-source');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tokenless-source-fixture' }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'components', 'MetricCard.tsx'), 'export function MetricCard(props: { label: string; value: string }) { return <article>{props.label}{props.value}</article>; }\n');
  fs.writeFileSync(path.join(root, 'src', 'utils', 'format.ts'), 'export function formatCurrency(value: number) { return `$${value.toFixed(2)}`; }\n');
  fs.writeFileSync(path.join(root, 'src', 'styles', 'dashboard.css'), '.dashboard-shell { display: grid; }\n');
  const appPath = path.join(root, 'src', 'App.tsx');
  const appSource = buildLargeTsxEntry();
  fs.writeFileSync(appPath, appSource);
  return { appPath, appSource };
}

function buildLargePythonModule() {
  const lines = [
    'from helpers import normalize_event',
    'import json',
    '',
    'class DashboardService:',
    '    def __init__(self, events):',
    '        self.events = events',
    '',
    '    def render_panel(self):',
    '        return [normalize_event(event) for event in self.events]',
    '',
    'def filter_events(events, query):',
    '    return [event for event in events if query in event.get("title", "")]',
    ''
  ];

  for (let i = 0; i < 4200; i++) {
    lines.push(`def generated_helper_${i}(value):`);
    lines.push(`    return {"index": ${i}, "value": value}`);
    lines.push('');
  }

  return lines.join('\n');
}

function setupLargePythonFixture() {
  const root = path.join(dataDir, 'python-source');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname = "tokenless-python-fixture"\n');
  fs.writeFileSync(path.join(root, 'src', 'helpers.py'), 'def normalize_event(event):\n    return event\n');
  const modulePath = path.join(root, 'src', 'dashboard.py');
  const moduleSource = buildLargePythonModule();
  fs.writeFileSync(modulePath, moduleSource);
  return { modulePath, moduleSource };
}

function buildLargeVueSfc() {
  const lines = [
    '<template>',
    '  <DashboardShell class="dashboard-shell" @click="handleRefresh">',
    '    <MetricCard v-for="metric in metrics" :key="metric.id" :metric="metric" />',
    '  </DashboardShell>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import MetricCard from './MetricCard.vue';",
    "import { buildMetrics } from './metrics';",
    'const metrics = buildMetrics();',
    'function handleRefresh() {',
    '  return metrics.length;',
    '}',
    '</script>',
    '',
    '<style scoped>',
    '.dashboard-shell { display: grid; gap: 16px; }',
    '.metric-card { border-radius: 18px; }',
    '</style>'
  ];
  for (let i = 0; i < 1200; i++) {
    lines.splice(4, 0, `    <section class="generated-row-${i}">{{ ${i} }}</section>`);
  }
  return lines.join('\n');
}

function setupLargeVueFixture() {
  const root = path.join(dataDir, 'vue-source');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tokenless-vue-fixture' }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'MetricCard.vue'), '<template><article class="metric-card" /></template>\n');
  fs.writeFileSync(path.join(root, 'src', 'metrics.ts'), 'export function buildMetrics() { return []; }\n');
  const appPath = path.join(root, 'src', 'Dashboard.vue');
  const appSource = buildLargeVueSfc();
  fs.writeFileSync(appPath, appSource);
  return { appPath, appSource };
}

function buildLargeSvelteSfc() {
  const lines = [
    '<script lang="ts">',
    "  import Counter from './Counter.svelte';",
    '  let count = 0;',
    '  function increment() { count += 1; }',
    '</script>',
    '',
    '<main class="dashboard-shell">',
    '  <Counter value={count} on:click={increment} />',
    '</main>',
    '',
    '<style>',
    '  .dashboard-shell { display: grid; gap: 12px; }',
    '</style>'
  ];
  for (let i = 0; i < 1200; i++) {
    lines.splice(8, 0, `  <button class:active={count === ${i}} on:click={increment}>${i}</button>`);
  }
  return lines.join('\n');
}

function setupLargeSvelteFixture() {
  const root = path.join(dataDir, 'svelte-source');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tokenless-svelte-fixture' }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'Counter.svelte'), '<button>counter</button>\n');
  const appPath = path.join(root, 'src', 'Dashboard.svelte');
  const appSource = buildLargeSvelteSfc();
  fs.writeFileSync(appPath, appSource);
  return { appPath, appSource };
}

function passLine(name, pass) {
  console.log(`${pass ? 'pass' : 'fail'}: ${name}`);
  return pass;
}

function main() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const largeCss = buildLargeCss();
  const largeCssResult = runHook('/tmp/tokenless-large-style.css', largeCss);
  const largeCssOutput = largeCssResult.stdout || '';
  const artifactMatch = largeCssOutput.match(/ctx_\d{8}_\d{6}_[a-z0-9]+/);
  const artifactId = artifactMatch && artifactMatch[0];

  const around = artifactId
    ? runTokenless(['expand', artifactId, '--around', '.target-card', '--data-dir', dataDir]).stdout || ''
    : '';
  const lineWindow = artifactId
    ? runTokenless(['expand', artifactId, '--lines', '520:535', '--data-dir', dataDir]).stdout || ''
    : '';
  const stats = runTokenless(['stats', '--data-dir', dataDir]).stdout || '';

  const smallCss = '.card { border-radius: 20px; }\n'.repeat(100);
  const smallCssOutput = runHook('/tmp/small.css', smallCss).stdout || '';

  const largeSource = Array.from({ length: 2000 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n');
  const largeSourceOutput = runHook('/tmp/large.ts', largeSource).stdout || '';
  const sourceFixture = setupLargeTsxFixture();
  const largeTsxOutput = runHook(sourceFixture.appPath, sourceFixture.appSource).stdout || '';
  const pythonFixture = setupLargePythonFixture();
  const largePythonOutput = runHook(pythonFixture.modulePath, pythonFixture.moduleSource).stdout || '';
  const vueFixture = setupLargeVueFixture();
  const largeVueOutput = runHook(vueFixture.appPath, vueFixture.appSource).stdout || '';
  const svelteFixture = setupLargeSvelteFixture();
  const largeSvelteOutput = runHook(svelteFixture.appPath, svelteFixture.appSource).stdout || '';

  console.log('TOKENLESS-READ-EVAL/0.1');
  console.log(`large_css_tokens: ${estimateTokens(largeCss)}`);
  console.log(`small_css_tokens: ${estimateTokens(smallCss)}`);
  console.log(`large_source_tokens: ${estimateTokens(largeSource)}`);
  console.log(`large_tsx_tokens: ${estimateTokens(sourceFixture.appSource)}`);
  console.log(`large_python_tokens: ${estimateTokens(pythonFixture.moduleSource)}`);
  console.log(`large_vue_tokens: ${estimateTokens(vueFixture.appSource)}`);
  console.log(`large_svelte_tokens: ${estimateTokens(svelteFixture.appSource)}`);
  console.log(`artifact_id: ${artifactId || '(none)'}`);
  console.log('');

  const checks = [
    ['large css emits TOKENLESS-READ-PACKET', largeCssOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large css creates artifact', Boolean(artifactId)],
    ['expand --around finds target selector', around.includes('.target-card')],
    ['expand --around preserves exact editable property', around.includes('border-radius: 20px')],
    ['expand --lines returns numbered lines', /^520:|\n520:|^521:|\n521:/.test(lineWindow)],
    ['stats records read-packet', stats.includes('read-packet')],
    ['stats marks read-packet as eval source', stats.includes('- eval:')],
    ['small css stays raw', !smallCssOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['below-threshold source stays raw by default', !largeSourceOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large tsx emits TOKENLESS-READ-PACKET', largeTsxOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large tsx includes project file hints', largeTsxOutput.includes('Project file hints:')],
    ['large tsx lists local import component', largeTsxOutput.includes('src/components/MetricCard.tsx')],
    ['large tsx lists local import util', largeTsxOutput.includes('src/utils/format.ts')],
    ['large tsx lists local style import', largeTsxOutput.includes('src/styles/dashboard.css')],
    ['large python emits TOKENLESS-READ-PACKET', largePythonOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large python includes source map', largePythonOutput.includes('Source map:')],
    ['large python includes class declaration', largePythonOutput.includes('DashboardService')],
    ['large python includes function declaration', largePythonOutput.includes('filter_events')],
    ['large python lists nearby helper file', largePythonOutput.includes('src/helpers.py')],
    ['large vue emits TOKENLESS-READ-PACKET', largeVueOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large vue includes sfc sections', largeVueOutput.includes('SFC sections:')],
    ['large vue includes template hints', largeVueOutput.includes('Template interaction/component hints:')],
    ['large vue lists imported component', largeVueOutput.includes('src/MetricCard.vue')],
    ['large svelte emits TOKENLESS-READ-PACKET', largeSvelteOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large svelte includes sfc sections', largeSvelteOutput.includes('SFC sections:')],
    ['large svelte lists imported component', largeSvelteOutput.includes('src/Counter.svelte')]
  ];

  const failed = checks.filter(([name, pass]) => !passLine(name, pass));

  console.log('');
  console.log('around_sample:');
  console.log(around.split(/\r?\n/).filter((line) => {
    return line.includes('.target-card') || line.includes('border-radius') || line.includes('background');
  }).slice(0, 8).join('\n'));

  if (failed.length) {
    process.exit(1);
  }
}

main();
