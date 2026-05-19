#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  normalizeStyle,
  readStyleConfig,
  writeStyleConfig,
  formatStyleContext
} = require('../lib/style_config');

function isTokenlessDisabled() {
  return /^(0|false|off|disabled)$/i.test(String(process.env.TOKENLESS_MODE || '').trim());
}

function getDataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
}

function trace(event) {
  const dataDir = getDataDir();
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(
      path.join(dataDir, 'userprompt_trace.log'),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      'utf8'
    );
  } catch (err) {
    // Tracing must never affect prompts.
  }
}

function outputAdditionalContext(additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    }
  }));
}

function parseTokenlessStylePrompt(prompt) {
  const text = String(prompt || '').trim();
  const match = /^\/tokenless(?::tokenless)?\s+style(?:\s+(\S+))?/i.exec(text);
  if (!match) return null;
  return match[1] || 'status';
}

function main() {
  if (isTokenlessDisabled()) {
    process.exit(0);
  }

  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    process.exit(0);
  }
  if (!raw || !raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    process.exit(0);
  }

  const dataDir = getDataDir();
  const prompt = input.prompt || input.user_prompt || input.userPrompt || '';
  const requestedStyle = parseTokenlessStylePrompt(prompt);

  if (requestedStyle && requestedStyle !== 'status') {
    const normalized = normalizeStyle(requestedStyle);
    if (normalized) {
      try {
        writeStyleConfig({ dataDir, style: normalized });
        trace({ event: 'set-style-from-prompt', style: normalized });
      } catch (err) {
        trace({ event: 'set-style-failed', requestedStyle, error: err.message });
      }

      if (normalized === 'off') {
        outputAdditionalContext('TOKENLESS STYLE OFF. Use normal response style unless the user asks otherwise.');
        return;
      }

      outputAdditionalContext(formatStyleContext(normalized));
      return;
    }
  }

  const active = readStyleConfig(dataDir);
  if (active.style === 'off') {
    process.exit(0);
  }

  outputAdditionalContext(formatStyleContext(active.style));
}

main();
