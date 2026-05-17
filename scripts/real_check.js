#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..');
const {
  readStatsEntries,
  summarizeStats
} = require(path.join(repoRoot, 'plugins', 'claude-code', 'lib', 'artifact_store'));
const {
  listReadGates,
  listReadPackets
} = require(path.join(repoRoot, 'plugins', 'claude-code', 'lib', 'read_gate'));

function parseArgs(argv) {
  let dataDir = path.join(os.homedir(), '.tokenless');
  let apiDir = path.join(dataDir, 'api-bodies-realtest');
  let file = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir') {
      dataDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (argv[i] === '--api-dir') {
      apiDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (argv[i] === '--file') {
      file = argv[i + 1];
      i += 1;
    }
  }

  return { dataDir, apiDir, file };
}

function countKeyword(dir, keyword) {
  if (!fs.existsSync(dir)) return { files: 0, filesWithMatches: 0, matches: 0 };
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dir, name));

  let filesWithMatches = 0;
  let matches = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const count = text.split(keyword).length - 1;
    if (count > 0) {
      filesWithMatches += 1;
      matches += count;
    }
  }
  return { files: files.length, filesWithMatches, matches };
}

function formatReducerLine(summary, reducer) {
  const item = (summary.by_reducer || {})[reducer];
  if (!item) return `- ${reducer}: (none)`;
  return `- ${reducer}: calls=${item.calls}, before=${item.tokens_before}, after=${item.tokens_after}, saved=${item.tokens_saved}`;
}

function readTrace(dataDir, name) {
  const tracePath = path.join(dataDir, name);
  if (!fs.existsSync(tracePath)) return [];

  return fs.readFileSync(tracePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = readStatsEntries(args.dataDir);
  const summary = summarizeStats(entries);
  const hook = (summary.by_source || {}).hook || null;
  const gates = listReadGates(args.dataDir);
  const packets = listReadPackets(args.dataDir);
  const readPacketHits = countKeyword(args.apiDir, 'TOKENLESS-READ-PACKET');
  const editPacketHits = countKeyword(args.apiDir, 'TOKENLESS-EDIT-PACKET');
  const writePacketHits = countKeyword(args.apiDir, 'TOKENLESS-WRITE-PACKET');
  const requiredHits = countKeyword(args.apiDir, 'NEXT REQUIRED COMMAND');
  const blockedHits = countKeyword(args.apiDir, 'blocked before execution');
  const staleHits = countKeyword(args.apiDir, 'stale');
  const preTrace = readTrace(args.dataDir, 'pretool_trace.log');
  const postTrace = readTrace(args.dataDir, 'posttool_trace.log');
  const relevantTrace = preTrace.filter((event) => {
    const text = JSON.stringify(event);
    return event.event === 'read-cap' ||
      event.event === 'read-stale-cap' ||
      event.event === 'deny' ||
      (args.file && text.includes(args.file));
  }).slice(-12);
  const relevantPostTrace = postTrace.filter((event) => {
    const text = JSON.stringify(event);
    return event.event === 'compact-read' ||
      event.event === 'compact-edit-packet' ||
      (args.file && text.includes(args.file));
  }).slice(-12);

  console.log('TOKENLESS-REAL-CHECK/0.1');
  console.log(`data_dir: ${args.dataDir}`);
  console.log(`api_dir: ${args.apiDir}`);
  console.log('');
  console.log('Real hook savings:');
  if (hook) {
    console.log(`- calls: ${hook.calls}`);
    console.log(`- tokens_before: ${hook.tokens_before}`);
    console.log(`- tokens_after: ${hook.tokens_after}`);
    console.log(`- tokens_saved: ${hook.tokens_saved}`);
  } else {
    console.log('- (none)');
  }
  console.log('');
  console.log('Savings by packet reducer:');
  console.log(formatReducerLine(summary, 'read-packet'));
  console.log(formatReducerLine(summary, 'edit-packet'));
  console.log(formatReducerLine(summary, 'write-packet'));
  console.log('');
  console.log('API body evidence:');
  console.log(`- TOKENLESS-READ-PACKET: files=${readPacketHits.filesWithMatches}, matches=${readPacketHits.matches}`);
  console.log(`- TOKENLESS-EDIT-PACKET: files=${editPacketHits.filesWithMatches}, matches=${editPacketHits.matches}`);
  console.log(`- TOKENLESS-WRITE-PACKET: files=${writePacketHits.filesWithMatches}, matches=${writePacketHits.matches}`);
  console.log(`- NEXT REQUIRED COMMAND: files=${requiredHits.filesWithMatches}, matches=${requiredHits.matches}`);
  console.log(`- blocked before execution: files=${blockedHits.filesWithMatches}, matches=${blockedHits.matches}`);
  console.log(`- stale: files=${staleHits.filesWithMatches}, matches=${staleHits.matches}`);
  console.log('');
  console.log('Large read gates:');
  console.log(`- pending: ${gates.length}`);
  console.log(`- packet_index: ${packets.length}`);
  console.log('');
  console.log('Recent relevant PreToolUse events:');
  if (!relevantTrace.length) {
    console.log('- (none)');
  } else {
    for (const event of relevantTrace) {
      console.log(`- ${event.at || '(no time)'} ${event.event || 'event'} ${event.reason || ''} ${event.filePath || ''}`);
    }
  }
  console.log('');
  console.log('Recent relevant PostToolUse events:');
  if (!relevantPostTrace.length) {
    console.log('- (none)');
  } else {
    for (const event of relevantPostTrace) {
      console.log(`- ${event.at || '(no time)'} ${event.event || 'event'} ${event.toolName || ''} ${event.filePath || ''} ${event.artifactId || ''}`);
    }
  }
}

main();
