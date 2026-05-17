#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isNoisyCommand } = require('../lib/classify');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function getTokenlessCliPath() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  return path.join(pluginRoot, 'bin', 'acc');
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

  if ((input.tool_name || input.toolName) !== 'Bash') process.exit(0);

  const toolInput = input.tool_input || input.toolInput || {};
  const command = toolInput.command || '';
  if (!command || !isNoisyCommand(command)) process.exit(0);

  const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
  const tokenlessPath = getTokenlessCliPath();
  const rewritten = `node ${shellQuote(tokenlessPath)} run --agent --data-dir ${shellQuote(dataDir)} -- ${command}`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: [
        'Tokenless detected that a noisy Bash command failed before compressed output reached context.',
        `Original command: ${command}`,
        `Run this compressed retry instead: ${rewritten}`
      ].join('\n')
    }
  }));
}

main();
