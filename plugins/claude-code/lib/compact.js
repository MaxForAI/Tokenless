'use strict';

const fs = require('fs');
const path = require('path');
const { getReducerForCommand } = require('./classify');
const testLogReducer = require('./reducers/test_log');
const gitDiffReducer = require('./reducers/git_diff');
const searchReducer = require('./reducers/search_output');
const fileTreeReducer = require('./reducers/file_tree');
const ciBuildReducer = require('./reducers/ci_build');
const genericReducer = require('./reducers/bash_generic');

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function getReducer(name) {
  if (name === 'test-log') return testLogReducer;
  if (name === 'git-diff') return gitDiffReducer;
  if (name === 'search-output') return searchReducer;
  if (name === 'file-tree') return fileTreeReducer;
  if (name === 'ci-build') return ciBuildReducer;
  return genericReducer;
}

function compactOutput({ tool, command, exitCode, stdout, stderr, reducer: reducerName, beforeText, dataDir }) {
  const selected = reducerName || getReducerForCommand(command);
  const reducer = getReducer(selected);

  const before = beforeText || `${stdout || ''}\n${stderr || ''}`;
  const beforeTokens = estimateTokens(before);
  const compacted = reducer.compress({
    command,
    exitCode,
    stdout: stdout || '',
    stderr: stderr || ''
  });

  const afterBody = formatCompactedBody(compacted);
  const afterTokens = estimateTokens(afterBody);

  const status = exitCode === 0 ? 'success' : 'failed';

  const text = [
    'TOKENLESS-PACKET/0.1',
    '',
    `Tool: ${tool || 'Bash'}`,
    `Command: ${command}`,
    `Status: ${status}`,
    `Original exit code: ${exitCode}`,
    `Reducer: ${selected}`,
    `Compression: ${beforeTokens} -> ${afterTokens} estimated tokens`,
    '',
    'Key findings:',
    ...(compacted.keyFindings.length ? compacted.keyFindings.map((item) => `- ${item}`) : ['- (no key findings)']),
    '',
    'Dropped:',
    ...(compacted.dropped.length ? compacted.dropped.map((item) => `- ${item}`) : ['- repeated/irrelevant lines']),
    '',
    'Raw artifact: tokenless show null',
    ''
  ].join('\n');

  return {
    text,
    keyFindings: compacted.keyFindings,
    dropped: compacted.dropped,
    reducer: selected,
    beforeTokens,
    afterTokens,
    status,
    body: afterBody
  };
}

function formatCompactedBody(payload) {
  const normalized = {
    ...payload,
    keyFindings: Array.isArray(payload.keyFindings) ? payload.keyFindings : [],
    dropped: Array.isArray(payload.dropped) ? payload.dropped : []
  };

  return JSON.stringify(normalized);
}

module.exports = {
  estimateTokens,
  compactOutput,
  formatCompactedBody,
  getReducer
};
