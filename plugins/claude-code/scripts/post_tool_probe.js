#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function getDataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch (err) {
    return JSON.stringify({ unserializable: err.message });
  }
}

function pickPath(toolInput) {
  return toolInput.file_path || toolInput.path || toolInput.notebook_path || null;
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    process.exit(0);
  }

  if (!raw || !raw.trim()) process.exit(0);

  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    process.exit(0);
  }

  const toolName = input.tool_name || input.toolName || 'unknown';
  if (!['Edit', 'MultiEdit', 'Write'].includes(toolName)) {
    process.exit(0);
  }

  const toolInput = input.tool_input || input.toolInput || {};
  const toolResponse = input.tool_response || input.toolResponse || {};
  const inputJson = safeJson(toolInput);
  const responseJson = safeJson(toolResponse);
  const responseTokens = estimateTokens(responseJson);
  const inputTokens = estimateTokens(inputJson);
  const dataDir = getDataDir();

  const entry = {
    at: new Date().toISOString(),
    tool_name: toolName,
    cwd: process.cwd(),
    path: pickPath(toolInput),
    input_keys: Object.keys(toolInput),
    response_keys: Object.keys(toolResponse),
    input_chars: inputJson.length,
    response_chars: responseJson.length,
    input_tokens: inputTokens,
    response_tokens: responseTokens,
    total_tokens: inputTokens + responseTokens,
    large_output: responseTokens >= 2000
  };

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(path.join(dataDir, 'observed.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    // Probe must never affect tool execution.
  }

  process.exit(0);
}

main();
