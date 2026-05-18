#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(repoRoot, 'plugins', 'claude-code', 'bin', 'tokenless');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenless-cli-smoke-'));
const originalFixture = '/Users/mac/aurora-ops-10k-tsx-original';

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error([
      `command failed: tokenless ${args.join(' ')}`,
      `status: ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label}: missing ${needle}\n${text}`);
  }
}

function main() {
  const status = run(['status', '--user'], { env: { TOKENLESS_MODE: 'off' } });
  assertContains(status, 'TOKENLESS-STATUS/0.1', 'status');
  assertContains(status, 'mode: off', 'status');
  assertContains(status, 'mode_source: TOKENLESS_MODE', 'status');

  const probe = run(['api-probe', 'start', '--name', 'cli-smoke']);
  assertContains(probe, 'TOKENLESS-API-PROBE/0.1', 'api-probe');
  assertContains(probe, 'export TOKENLESS_API_PROBE_DIR=', 'api-probe');
  assertContains(probe, 'export OTEL_LOG_RAW_API_BODIES=\"file:$TOKENLESS_API_PROBE_DIR\"', 'api-probe');

  const leanLaunch = run(['launch', '--print', '--claude-bin', '/tmp/fake-claude', '--', '--version']);
  assertContains(leanLaunch, 'TOKENLESS-LAUNCH/0.1', 'launch');
  assertContains(leanLaunch, 'task_plan_tools: disabled', 'launch');
  assertContains(leanLaunch, '--disallowedTools', 'launch');
  assertContains(leanLaunch, 'TaskCreate,TaskUpdate,TaskList,TaskGet,EnterPlanMode,ExitPlanMode', 'launch');

  const taskLaunch = run(['launch', '--print', '--claude-bin', '/tmp/fake-claude'], { env: { TOKENLESS_ALLOW_TASK_TOOLS: '1' } });
  assertContains(taskLaunch, 'task_plan_tools: allowed', 'launch allow');
  if (taskLaunch.includes('--disallowedTools')) {
    throw new Error(`launch allow: unexpected --disallowedTools\n${taskLaunch}`);
  }

  if (fs.existsSync(originalFixture)) {
    const copy = run(['benchmark-copy', 'aurora-10k-tsx', '--out-root', tmpRoot, '--name', 'aurora-smoke']);
    assertContains(copy, 'TOKENLESS-BENCHMARK-COPY/0.1', 'benchmark-copy');
    assertContains(copy, 'fixture: aurora-10k-tsx', 'benchmark-copy');
    assertContains(copy, 'on_file:', 'benchmark-copy');
    assertContains(copy, 'off_file:', 'benchmark-copy');
    assertContains(copy, 'True-OFF check:', 'benchmark-copy');
  } else {
    console.log(`skip benchmark-copy fixture check: missing ${originalFixture}`);
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('TOKENLESS-CLI-SMOKE/0.1');
  console.log('pass: yes');
}

try {
  main();
} catch (err) {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {
    // best effort cleanup
  }
  console.error('TOKENLESS-CLI-SMOKE/0.1');
  console.error('pass: no');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
}
