#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { compactOutput, estimateTokens } = require('../plugins/claude-code/lib/compact');
const { getReducerForOutput } = require('../plugins/claude-code/lib/classify');
const {
  createArtifact,
  readArtifact,
  expandArtifactAround
} = require('../plugins/claude-code/lib/artifact_store');

const args = new Set(process.argv.slice(2));
const runAll = args.size === 0 || args.has('--all');
const runSynthetic = runAll || args.has('--synthetic');
const runReal = args.has('--real') || args.has('--all');

const evalDataDir = path.join(os.tmpdir(), 'tokenless-evals');

const syntheticCases = [
  {
    name: 'pytest failed output',
    mode: 'synthetic',
    file: path.join(__dirname, 'fixtures', 'pytest-failed.txt'),
    command: 'pytest -q',
    exitCode: 1,
    mustContain: ['FAILED', 'test_parser', 'AssertionError', 'Expected', 'Received'],
    mustExpandAround: ['Expected token count'],
    noise: 'PASSED tests/test_ok.py::test_ok\n',
    noiseCount: 800,
    maxTokensAfter: 2000,
    maxRatioPercent: 30,
    expectedReducer: 'test-log'
  },
  {
    name: 'git diff output',
    mode: 'synthetic',
    file: path.join(__dirname, 'fixtures', 'git-diff-large.patch'),
    command: 'git diff',
    exitCode: 1,
    mustContain: ['diff --git', 'src/', '@@', '+', '-'],
    mustExpandAround: ['diff --git'],
    noise: 'unchanged context line\n',
    noiseCount: 1200,
    maxTokensAfter: 4000,
    maxRatioPercent: 10,
    expectedReducer: 'git-diff'
  },
  {
    name: 'rg output',
    mode: 'synthetic',
    file: path.join(__dirname, 'fixtures', 'rg-large.txt'),
    command: 'rg todo',
    exitCode: 1,
    mustContain: ['src/', '.ts'],
    mustExpandAround: ['src/parser.ts'],
    noise: 'node_modules/pkg/file.js:1: todo cached dependency\n',
    noiseCount: 800,
    maxTokensAfter: 1500,
    maxRatioPercent: 5,
    expectedReducer: 'search-output'
  },
  {
    name: 'tree output',
    mode: 'synthetic',
    file: path.join(__dirname, 'fixtures', 'tree-large.txt'),
    command: 'tree',
    exitCode: 1,
    mustContain: ['Project tree summary:', 'Large dirs collapsed:'],
    mustExpandAround: ['src/core/parser.ts'],
    noise: 'node_modules/pkg/file.js\n',
    noiseCount: 1200,
    maxTokensAfter: 800,
    maxRatioPercent: 5,
    expectedReducer: 'file-tree'
  },
  {
    name: 'ci build failed output',
    mode: 'synthetic',
    file: path.join(__dirname, 'fixtures', 'ci-build-failed.txt'),
    command: 'npm run build',
    exitCode: 1,
    mustContain: ['failed phase: build', 'suspected cause:', 'src/App.tsx:12', 'Cannot find module'],
    mustExpandAround: ['Cannot find module'],
    noise: 'install progress line: package extracted\n',
    noiseCount: 1000,
    maxTokensAfter: 2200,
    maxRatioPercent: 10,
    expectedReducer: 'ci-build'
  }
];

function loadRealCases() {
  const realDir = path.join(__dirname, 'cases', 'real');
  if (!fs.existsSync(realDir)) {
    return [];
  }

  return fs.readdirSync(realDir)
    .filter((file) => file.endsWith('.case.json'))
    .sort()
    .map((file) => {
      const casePath = path.join(realDir, file);
      const config = JSON.parse(fs.readFileSync(casePath, 'utf8'));
      return normalizeRealCase(config, casePath);
    });
}

function resolveCaseFile(casePath, file) {
  if (!file) return null;
  if (path.isAbsolute(file)) return file;
  return path.join(path.dirname(casePath), file);
}

function normalizeRealCase(config, casePath) {
  const rawFile = resolveCaseFile(casePath, config.rawFile);
  const stdoutFile = resolveCaseFile(casePath, config.stdoutFile);
  const stderrFile = resolveCaseFile(casePath, config.stderrFile);

  if (!rawFile && !stdoutFile && !stderrFile) {
    throw new Error(`${casePath}: expected rawFile, stdoutFile, or stderrFile`);
  }

  return {
    ...config,
    mode: 'real',
    casePath,
    stdout: rawFile
      ? fs.readFileSync(rawFile, 'utf8')
      : (stdoutFile ? fs.readFileSync(stdoutFile, 'utf8') : ''),
    stderr: stderrFile ? fs.readFileSync(stderrFile, 'utf8') : '',
    exitCode: Number.isInteger(config.exitCode) ? config.exitCode : 1,
    command: config.command || path.basename(casePath)
  };
}

function getCaseText(testCase) {
  if (typeof testCase.stdout === 'string' || typeof testCase.stderr === 'string') {
    return {
      stdout: testCase.stdout || '',
      stderr: testCase.stderr || ''
    };
  }

  const fixtureText = fs.readFileSync(testCase.file, 'utf8');
  return {
    stdout: `${(testCase.noise || '').repeat(testCase.noiseCount || 0)}${fixtureText}`,
    stderr: ''
  };
}

function evaluateCase(testCase) {
  const { stdout, stderr } = getCaseText(testCase);
  const reducer = testCase.reducer || getReducerForOutput({
    command: testCase.command,
    stdout,
    stderr
  });

  const beforeText = `${stdout}\n${stderr}`;
  const compacted = compactOutput({
    tool: 'Bash',
    command: testCase.command,
    exitCode: testCase.exitCode,
    stdout,
    stderr,
    reducer,
    beforeText
  });

  const artifact = createArtifact({
    dataDir: evalDataDir,
    command: testCase.command,
    exitCode: testCase.exitCode,
    reducer,
    stdout,
    stderr,
    compactedText: compacted.text,
    beforeTokens: compacted.beforeTokens,
    afterTokens: compacted.afterTokens,
    status: compacted.status,
    source: 'eval'
  });

  const readBack = readArtifact(evalDataDir, artifact.artifact_id);
  const before = estimateTokens(beforeText);
  const after = estimateTokens(compacted.text);
  const ratio = before > 0 ? Number(((after / before) * 100).toFixed(1)) : 0;

  const missing = (testCase.mustContain || []).filter((token) => !compacted.text.includes(token));
  const forbiddenPresent = (testCase.mustNotContain || []).filter((token) => compacted.text.includes(token));
  const expandMissing = (testCase.mustExpandAround || []).filter((token) => {
    if (!readBack) return true;
    return !expandArtifactAround(readBack, token).includes(token);
  });

  const failures = [];
  if (testCase.expectedReducer && reducer !== testCase.expectedReducer) {
    failures.push(`expected reducer ${testCase.expectedReducer}, got ${reducer}`);
  }
  if (missing.length) failures.push(`missing compacted tokens: ${missing.join(', ')}`);
  if (forbiddenPresent.length) failures.push(`forbidden tokens present: ${forbiddenPresent.join(', ')}`);
  if (expandMissing.length) failures.push(`expand missing tokens: ${expandMissing.join(', ')}`);
  if (!readBack) failures.push('artifact readback failed');
  if (testCase.maxTokensAfter && after > testCase.maxTokensAfter) {
    failures.push(`after tokens ${after} > ${testCase.maxTokensAfter}`);
  }
  const minTokensForRatio = testCase.minTokensForRatio || 1000;
  if (testCase.maxRatioPercent && before >= minTokensForRatio && ratio > testCase.maxRatioPercent) {
    failures.push(`ratio ${ratio}% > ${testCase.maxRatioPercent}%`);
  }

  return {
    name: testCase.name,
    mode: testCase.mode,
    reducer,
    before,
    after,
    ratio,
    artifactId: artifact.artifact_id,
    pass: failures.length === 0,
    failures
  };
}

function printResult(result) {
  console.log(`case: ${result.name}`);
  console.log(`mode: ${result.mode}`);
  console.log(`reducer: ${result.reducer}`);
  console.log(`before: ${result.before} tokens`);
  console.log(`after: ${result.after} tokens`);
  console.log(`ratio: ${result.ratio}%`);
  console.log(`artifact: ${result.artifactId}`);
  console.log(`pass: ${result.pass ? 'yes' : 'no'}`);
  if (result.failures.length) {
    console.log(`failures: ${result.failures.join(' | ')}`);
  }
  console.log('---');
}

function main() {
  const cases = [];
  if (runSynthetic) cases.push(...syntheticCases);
  if (runReal) cases.push(...loadRealCases());

  if (!cases.length) {
    if (runReal) {
      console.error('No real cases found under evals/cases/real/*.case.json');
      process.exit(1);
    }
    console.error('No eval cases selected.');
    process.exit(1);
  }

  let failed = 0;
  for (const testCase of cases) {
    const result = evaluateCase(testCase);
    printResult(result);
    if (!result.pass) failed += 1;
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
