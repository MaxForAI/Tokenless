'use strict';

const path = require('path');
const fs = require('fs');
const { estimateTokens } = require('./compact');

const LOW_RISK_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.svg',
  '.json',
  '.jsonl',
  '.log',
  '.txt',
  '.md',
  '.lock',
  '.yaml',
  '.yml'
]);

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.cs'
]);

const SOURCE_PACKET_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py'
]);

const SFC_PACKET_EXTENSIONS = new Set([
  '.vue',
  '.svelte'
]);

const SOURCE_NEIGHBOR_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.vue',
  '.svelte',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.json'
]);

const SOURCE_SCAN_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'vendor',
  'generated'
]);

function getFileExtension(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base === 'package-lock.json' || base === 'pnpm-lock.yaml' || base === 'yarn.lock') return '.lock';
  return path.extname(base);
}

function isGeneratedPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return /(^|\/)(dist|build|coverage|node_modules|\.next|generated|vendor)\//.test(normalized) ||
    /\.min\.(js|css)$/.test(normalized) ||
    /lock\.(json|yaml|yml)$/.test(normalized);
}

function shouldCompactRead({ filePath, text, tokens }) {
  const ext = getFileExtension(filePath);
  if (tokens < 4000) return false;
  if (isGeneratedPath(filePath)) return true;
  if (LOW_RISK_EXTENSIONS.has(ext)) return true;
  if (SFC_PACKET_EXTENSIONS.has(ext)) return tokens >= 12000;
  if (SOURCE_PACKET_EXTENSIONS.has(ext)) return tokens >= 30000;
  if (SOURCE_EXTENSIONS.has(ext)) return false;
  return tokens >= 12000;
}

function collectAnchors(lines, filePath) {
  const ext = getFileExtension(filePath);
  const anchors = [];
  const maxAnchors = 20000;

  const patterns = [];
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    patterns.push({
      type: 'selector',
      regex: /^\s*([.#][A-Za-z0-9_-][^{,]*(?:,[^{]+)?|\w[\w-]*(?:\s+[.#\w][^{]*)?)\s*\{/
    });
    patterns.push({ type: 'media', regex: /^\s*@(?:media|keyframes|supports|font-face)\b[^{]*/ });
    patterns.push({ type: 'variables', regex: /^\s*:root\s*\{/ });
  } else if (['.html', '.htm', '.svg'].includes(ext)) {
    patterns.push({ type: 'heading', regex: /^\s*<h[1-6]\b[^>]*>/i });
    patterns.push({ type: 'section', regex: /^\s*<(section|main|header|footer|nav|article|div)\b[^>]*(?:id|class)=["'][^"']+["']/i });
    patterns.push({ type: 'script-style', regex: /^\s*<(script|style)\b/i });
  } else if (['.json', '.jsonl'].includes(ext)) {
    patterns.push({ type: 'json-key', regex: /^\s*"([^"]+)":/ });
  } else if (['.md', '.txt', '.log'].includes(ext)) {
    patterns.push({ type: 'heading', regex: /^\s{0,3}#{1,6}\s+.+/ });
    patterns.push({ type: 'error', regex: /error|failed|exception|warning/i });
  } else if (SOURCE_PACKET_EXTENSIONS.has(ext)) {
    if (ext === '.py') {
      patterns.push({ type: 'import', regex: /^\s*(?:from\s+[A-Za-z0-9_.$]+\s+import\s+|import\s+[A-Za-z0-9_.$]+)/ });
      patterns.push({ type: 'class', regex: /^\s*class\s+[A-Za-z_][\w]*(?:\([^)]*\))?:/ });
      patterns.push({ type: 'function', regex: /^\s*(?:async\s+)?def\s+[A-Za-z_][\w]*\s*\(/ });
    } else {
      patterns.push({ type: 'import', regex: /^\s*import\s.+\sfrom\s+['"][^'"]+['"]/ });
      patterns.push({ type: 'export', regex: /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\s+\w+/ });
      patterns.push({ type: 'component', regex: /^\s*(?:export\s+)?(?:default\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9_$]*/ });
      patterns.push({ type: 'hook', regex: /^\s*(?:export\s+)?(?:const|function)\s+use[A-Z][A-Za-z0-9_$]*/ });
      patterns.push({ type: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*|^\s*(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/ });
    }
  } else if (SFC_PACKET_EXTENSIONS.has(ext)) {
    patterns.push({ type: 'sfc-section', regex: /^\s*<\/?(template|script|style)\b/i });
    patterns.push({ type: 'template-component', regex: /^\s*<[A-Z][A-Za-z0-9_.:-]*/ });
    patterns.push({ type: 'template-interaction', regex: /\b(@click|on:click|v-if|v-for|bind:|class=|class:)/ });
    patterns.push({ type: 'style-selector', regex: /^\s*([.#][A-Za-z0-9_-][^{,]*(?:,[^{]+)?|\w[\w-]*(?:\s+[.#\w][^{]*)?)\s*\{/ });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      anchors.push({
        line: i + 1,
        type: pattern.type,
        text: line.trim().slice(0, 140)
      });
      break;
    }
    if (anchors.length >= maxAnchors) break;
  }

  return anchors;
}

function selectVisibleAnchors(anchors) {
  const selected = [];
  const seen = new Set();

  function add(item) {
    if (!item || seen.has(item.line)) return;
    selected.push(item);
    seen.add(item.line);
  }

  anchors.slice(0, 30).forEach(add);
  anchors
    .filter((item) => /tokenless|probe|target/i.test(item.text))
    .slice(0, 20)
    .forEach(add);
  anchors.slice(-15).forEach(add);
  anchors
    .filter((item) => /card|error|warning|fail/i.test(item.text))
    .slice(0, 15)
    .forEach(add);

  return selected.slice(0, 60).sort((a, b) => a.line - b.line);
}

function truncateText(text, max = 140) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function splitReadLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function takeWithOmitted(items, max) {
  return {
    visible: items.slice(0, max),
    omitted: Math.max(0, items.length - max)
  };
}

function formatOmitted(label, count) {
  return count > 0 ? `- ${label} omitted: ${count}` : null;
}

function extractCssVariables(lines) {
  const out = [];
  const seen = new Set();
  const variableRe = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);?/g;

  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = variableRe.exec(lines[i])) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        line: i + 1,
        text: `${name}: ${truncateText(match[2], 80)}`
      });
    }
  }

  return out;
}

function extractCssColors(lines) {
  const colors = new Map();
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{1,80}\)|hsla?\([^)]{1,80}\)/g;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(colorRe) || [];
    for (const raw of matches) {
      const color = raw.replace(/\s+/g, ' ');
      if (!colors.has(color)) {
        colors.set(color, { color, firstLine: i + 1, count: 0 });
      }
      colors.get(color).count += 1;
    }
  }

  return Array.from(colors.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.firstLine - b.firstLine;
  });
}

const CSS_EDITABLE_SELECTOR_RE = /\b(card|button|btn|nav|header|footer|hero|modal|dialog|form|input|sidebar|layout|container|grid|panel|tab|menu|dropdown|toast|alert|badge|quote|timeline|section|toolbar|label|field|search|filter)\b/i;
const CSS_VISUAL_PROPERTY_RE = /\b(background|border|box-shadow|color|gradient|transform|transition|animation|filter|backdrop-filter|opacity|radius|padding|margin|display|grid|flex|position|font|letter-spacing|line-height)\s*:/i;
const CSS_LOW_VALUE_SELECTOR_RE = /\.(?:filler|fixture|generated|utility|util|tw-|css-|hash|chunk|unused|dummy|placeholder|skeleton)[A-Za-z0-9_-]*/i;
const CSS_HASHY_SELECTOR_RE = /\.[A-Za-z0-9_-]*[a-f0-9]{8,}[A-Za-z0-9_-]*/i;
const CSS_KEY_VARIABLE_RE = /--(?:bg|background|surface|text|muted|faint|primary|secondary|accent|cyan|orange|blue|red|border|radius|shadow|glass|font|spacing|transition|ease|color)/i;

function extractCssLikelySelectors(anchors) {
  const primary = anchors.filter((item) => {
    return item.type === 'selector' && (
      CSS_EDITABLE_SELECTOR_RE.test(item.text) ||
      /^(:root|body|html)\b/i.test(item.text)
    );
  });

  if (primary.length) return primary;
  return anchors.filter((item) => item.type === 'selector');
}

function extractCssAtRules(lines) {
  const out = [];
  const re = /^\s*@(media|keyframes|supports|font-face)\b[^{;]*/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(re);
    if (match) out.push({ line: i + 1, text: truncateText(lines[i]) });
  }
  return out;
}

function classifyCssComponent(selector) {
  const text = String(selector || '').toLowerCase();
  if (/^(:root|html|body)\b/.test(text)) return 'theme/base';
  if (/\b(nav|navbar|header|sidebar|menu)\b/.test(text)) return 'nav/header';
  if (/\b(hero|banner|masthead|jumbotron)\b/.test(text)) return 'hero';
  if (/\b(button|btn|cta|action)\b/.test(text)) return 'buttons/actions';
  if (/\b(card|panel|tile|quote|stat|feature|lab)\b/.test(text)) return 'cards/panels';
  if (/\b(form|input|field|label|select|textarea|search|filter)\b/.test(text)) return 'forms/inputs';
  if (/\b(modal|dialog|toast|alert|popover|dropdown|tab)\b/.test(text)) return 'feedback/overlays';
  if (/\b(table|list|grid|row|item)\b/.test(text)) return 'lists/grids';
  if (/\b(footer)\b/.test(text)) return 'footer';
  if (/\b(orbit|portrait|visual|media|image|avatar|icon|chip|badge)\b/.test(text)) return 'visual/details';
  if (/\b(container|section|layout|content|main)\b/.test(text)) return 'layout/sections';
  return null;
}

function getCssRuleBlocks(lines) {
  const blocks = [];
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;

    if (!current && opens > 0 && !trimmed.startsWith('@')) {
      current = {
        start: i + 1,
        selector: truncateText(trimmed.replace(/\s*\{\s*$/, ''), 120),
        visualProps: 0,
        lowValueScore: 0,
        editableScore: 0,
        lines: 0
      };
      if (/^(:root|body|html)\b/i.test(current.selector)) current.editableScore += 3;
      if (CSS_EDITABLE_SELECTOR_RE.test(current.selector)) current.editableScore += 2;
      if (CSS_LOW_VALUE_SELECTOR_RE.test(current.selector)) current.lowValueScore += 3;
      if (CSS_HASHY_SELECTOR_RE.test(current.selector)) current.lowValueScore += 2;
      if (/\\.filler-rule-\\d+/i.test(current.selector)) current.lowValueScore += 4;
    }

    if (current) {
      current.lines += 1;
      if (CSS_VISUAL_PROPERTY_RE.test(raw)) current.visualProps += 1;
    }

    depth += opens - closes;
    if (current && depth <= 0 && closes > 0) {
      current.end = i + 1;
      current.editableScore += Math.min(4, current.visualProps);
      blocks.push(current);
      current = null;
      depth = 0;
    }
  }

  return blocks;
}

function mergeCssRegions(blocks, predicate, maxGap = 12) {
  const regions = [];
  for (const block of blocks) {
    if (!predicate(block)) continue;
    const last = regions[regions.length - 1];
    if (last && block.start - last.end <= maxGap) {
      last.end = block.end;
      last.blocks += 1;
      last.visualProps += block.visualProps;
      last.score += block.editableScore;
      last.selectors.push(block.selector);
    } else {
      regions.push({
        start: block.start,
        end: block.end,
        blocks: 1,
        visualProps: block.visualProps,
        score: block.editableScore,
        selectors: [block.selector]
      });
    }
  }
  return regions;
}

function summarizeCssRegions(lines) {
  const blocks = getCssRuleBlocks(lines);
  if (!blocks.length) return [];

  const coreRegions = mergeCssRegions(
    blocks,
    (block) => block.editableScore >= 3 && block.lowValueScore === 0,
    18
  )
    .filter((region) => region.visualProps >= 2 || region.blocks >= 2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.start - b.start;
    })
    .slice(0, 6)
    .sort((a, b) => a.start - b.start);

  const lowRegions = mergeCssRegions(
    blocks,
    (block) => block.lowValueScore >= 3,
    40
  )
    .filter((region) => region.blocks >= 5 || (region.end - region.start) >= 80)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, 3)
    .sort((a, b) => a.start - b.start);

  const output = ['Heuristic regions:'];
  if (coreRegions.length) {
    output.push('- likely core editable regions:');
    for (const region of coreRegions) {
      output.push(`  - lines ${region.start}:${region.end} selectors=${region.selectors.slice(0, 4).join(', ')}`);
    }
  }
  if (lowRegions.length) {
    output.push('- likely low-value/generated regions:');
    for (const region of lowRegions) {
      output.push(`  - lines ${region.start}:${region.end} selectors=${region.selectors.slice(0, 3).join(', ')}`);
    }
  }
  if (coreRegions.length) {
    const first = coreRegions[0];
    output.push(`- recommended first expansion: --lines ${Math.max(1, first.start - 5)}:${Math.min(lines.length, first.end + 20)}`);
  }
  return output.length > 1 ? output : [];
}

function summarizeCssComponentMap(lines) {
  const blocks = getCssRuleBlocks(lines);
  if (!blocks.length) return [];

  const regions = [];
  const lowValue = [];

  for (const block of blocks) {
    if (block.lowValueScore >= 3) {
      const lastLow = lowValue[lowValue.length - 1];
      if (lastLow && block.start - lastLow.end <= 40) {
        lastLow.end = block.end;
        lastLow.blocks += 1;
        if (lastLow.selectors.length < 3) lastLow.selectors.push(block.selector);
      } else {
        lowValue.push({ start: block.start, end: block.end, blocks: 1, selectors: [block.selector] });
      }
      continue;
    }

    const label = classifyCssComponent(block.selector);
    if (!label) continue;

    const last = regions[regions.length - 1];
    if (last && last.label === label && block.start - last.end <= 70) {
      last.end = block.end;
      last.blocks += 1;
      last.score += block.editableScore + block.visualProps;
      if (last.selectors.length < 4) last.selectors.push(block.selector);
    } else {
      regions.push({
        label,
        start: block.start,
        end: block.end,
        blocks: 1,
        score: block.editableScore + block.visualProps,
        selectors: [block.selector]
      });
    }
  }

  const regionPriority = [
    'theme/base',
    'nav/header',
    'hero',
    'buttons/actions',
    'visual/details',
    'cards/panels',
    'layout/sections',
    'forms/inputs',
    'feedback/overlays',
    'lists/grids',
    'footer'
  ];
  const usefulRegions = [];
  const picked = new Set();
  for (const label of regionPriority) {
    const match = regions
      .filter((region, index) => region.label === label && !picked.has(index))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.start - b.start;
      })[0];
    if (!match) continue;
    usefulRegions.push(match);
    picked.add(regions.indexOf(match));
    if (usefulRegions.length >= 5) break;
  }
  if (usefulRegions.length < 5) {
    for (const region of regions
      .map((region, index) => ({ region, index }))
      .filter((item) => !picked.has(item.index))
      .sort((a, b) => {
        if (b.region.score !== a.region.score) return b.region.score - a.region.score;
        return a.region.start - b.region.start;
      })) {
      usefulRegions.push(region.region);
      picked.add(region.index);
      if (usefulRegions.length >= 5) break;
    }
  }
  usefulRegions.sort((a, b) => a.start - b.start);

  const lowRegions = lowValue
    .filter((region) => region.blocks >= 5 || (region.end - region.start) >= 80)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, 2)
    .sort((a, b) => a.start - b.start);

  const out = ['Component map:'];
  for (const region of usefulRegions) {
    out.push(`- ${region.label}: lines ${region.start}:${region.end} (${region.selectors.join(', ')})`);
  }
  for (const region of lowRegions) {
    out.push(`- low-value/generated: lines ${region.start}:${region.end} (${region.selectors.join(', ')})`);
  }

  return out.length > 1 ? out : [];
}

function extractCssKeyVariables(lines) {
  const variables = extractCssVariables(lines);
  return variables
    .map((item) => {
      const name = String(item.text || '').split(':')[0] || '';
      let score = 0;
      if (CSS_KEY_VARIABLE_RE.test(name)) score += 4;
      if (/--(?:bg|background|surface|primary|secondary|accent|cyan|orange|border|radius|shadow|glass)/i.test(name)) score += 3;
      if (/--(?:text|muted|font|ease|transition)/i.test(name)) score += 1;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.line - b.line;
    });
}

function renderSection(title, items, max, formatter, omittedLabel) {
  const { visible, omitted } = takeWithOmitted(items, max);
  if (!visible.length && !omitted) return [];
  const lines = [`${title}:`];
  for (const item of visible) {
    lines.push(formatter(item));
  }
  const omittedLine = formatOmitted(omittedLabel, omitted);
  if (omittedLine) lines.push(omittedLine);
  return lines;
}

function summarizeCss(lines, anchors, context = {}) {
  const variables = extractCssVariables(lines);
  const keyVariables = extractCssKeyVariables(lines);
  const colors = extractCssColors(lines);
  const atRules = extractCssAtRules(lines);
  const componentMap = summarizeCssComponentMap(lines);
  const actionBrief = buildCssActionBrief(lines, context);
  const snippets = extractCssEditableSnippets(lines);
  const showColors = keyVariables.length < 4;

  return [
    ...actionBrief,
    ...snippets,
    ...componentMap,
    ...renderSection('Key variables', keyVariables.length ? keyVariables : variables, 8, (item) => `- line ${item.line} ${item.text}`, 'css variables'),
    ...(showColors ? renderSection('Top colors', colors, 5, (item) => `- ${item.color} count=${item.count} first=line ${item.firstLine}`, 'colors') : []),
    ...renderSection('Media and animations', atRules, 3, (item) => `- line ${item.line} ${item.text}`, 'media/animation rules')
  ];
}

const CSS_ACTION_TARGETS = [
  { label: 'theme/base tokens', regex: /^:root\b|^body(?:::before|::after)?\b/i },
  { label: 'navigation/header', regex: /\.(?:site-header|site-nav|nav-list|nav-links|brand-mark|nav-brand|header|navbar)\b/i },
  { label: 'hero area', regex: /\.(?:hero|hero-title|hero-copy|hero-lead|hero-actions|hero-eyebrow|hero-kicker)\b/i },
  { label: 'buttons/actions', regex: /\.(?:button|btn|button-primary|button-secondary|cta|action)\b/i },
  { label: 'visual object', regex: /\.(?:observatory-visual|hero-visual|formula-card|formula-glow|formula-face|formula-chip|portrait|orbit|avatar|media)\b/i },
  { label: 'cards/panels', regex: /:is\(.*(?:card|panel)|\.(?:metric-card|stat-card|field-card|feature-card|lab-panel|quote-panel|card|panel|tile)\b/i },
  { label: 'sections/grids', regex: /\.(?:section|content-section|field-grid|feature-grid|metric-strip|stats-strip|lab-grid|lab-section)\b/i },
  { label: 'timeline/list detail', regex: /\.(?:timeline|timeline-card|timeline-year|timeline-row|timeline-item)\b/i },
  { label: 'footer', regex: /\.(?:footer|site-footer)\b/i }
];

function blockMatchesTarget(block, target) {
  return target.regex.test(block.selector || '');
}

function scoreSnippetGroup(group, targetIndex) {
  return group.reduce((sum, block) => sum + block.editableScore + block.visualProps, 0) + (CSS_ACTION_TARGETS.length - targetIndex) * 4;
}

function groupBlocks(blocks, maxGap = 24) {
  const groups = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (last && block.start - last.end <= maxGap) {
      last.end = block.end;
      last.blocks.push(block);
    } else {
      groups.push({ start: block.start, end: block.end, blocks: [block] });
    }
  }
  return groups;
}

function selectCssSnippetRegions(lines) {
  const blocks = getCssRuleBlocks(lines).filter((block) => block.lowValueScore === 0);
  const selected = [];
  const occupied = [];

  function overlaps(region) {
    return occupied.some((item) => !(region.end < item.start || region.start > item.end));
  }

  for (let targetIndex = 0; targetIndex < CSS_ACTION_TARGETS.length; targetIndex++) {
    const target = CSS_ACTION_TARGETS[targetIndex];
    const matching = blocks.filter((block) => blockMatchesTarget(block, target));
    if (!matching.length) continue;

    const groups = groupBlocks(matching, 28)
      .map((group) => ({
        label: target.label,
        start: group.start,
        end: group.end,
        selectors: group.blocks.map((block) => block.selector).slice(0, 5),
        score: scoreSnippetGroup(group.blocks, targetIndex)
      }))
      .filter((group) => (group.end - group.start) <= 90)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.start - b.start;
      });

    const picked = groups.find((group) => !overlaps(group));
    if (!picked) continue;
    selected.push(picked);
    occupied.push({ start: picked.start, end: picked.end });
    if (selected.length >= 7) break;
  }

  return selected.sort((a, b) => a.start - b.start);
}

function extractCssEditableSnippets(lines) {
  const regions = selectCssSnippetRegions(lines);
  if (!regions.length) return [];

  const out = [
    'Editable snippets:',
    '- These are exact current text for high-impact regions; prefer editing from these before more inspection.',
    '- If exact old_string is missing, inspect only that one selector/range.'
  ];

  for (const region of regions) {
    const code = lines.slice(region.start - 1, region.end).join('\n');
    out.push(`- ${region.label}: lines ${region.start}:${region.end} selectors=${region.selectors.join(', ')}`);
    out.push('```css');
    out.push(code);
    out.push('```');
  }

  return out;
}

function buildPacketActionBoundary({ artifact, tokenlessPath, dataDir }) {
  const commandPrefix = tokenlessPath
    ? `node '${String(tokenlessPath).replace(/'/g, "'\\''")}'`
    : 'tokenless';
  const dataDirPart = dataDir ? ` --data-dir '${String(dataDir).replace(/'/g, "'\\''")}'` : '';

  return [
    'Action boundary:',
    '- First action after this packet should be one minimal native Read on this file to register editor state if you plan to edit.',
    '- After that registration Read, make 6-10 bounded Edit calls from the snippets below without additional exploration.',
    '- Use snippets below as exact old_string sources.',
    '- Do not create TaskCreate/task-list/plan-mode output for this bounded edit task; edit directly.',
    '- Do not use Write to overwrite an existing file after this packet; use bounded Edit/MultiEdit.',
    '- Do not rewrite generated/noise blocks unless the user explicitly asks.',
    '- Do not wait for "File must be read first"; proactively do the minimal registration Read once, then edit. If it still appears, do not remap the file.',
    '- Do not run tokenless read again for this file unless Tokenless reports TOKENLESS-STALE.',
    '- tokenless read is whole-file packet creation only; it does not support --range, --selector, --lines, or similar lookup flags.',
    '- Do not grep/sed/small-Read the same file unless an exact old_string is missing.',
    '- If exact text is missing, only these artifact lookup commands are valid:',
    `  1. ${commandPrefix} expand ${artifact} --around "<selector-or-text>"${dataDirPart}`,
    `  2. ${commandPrefix} expand ${artifact} --lines <start:end>${dataDirPart}`,
    '- Budget: at most 2 artifact lookups before editing.',
    '- If you exceed the budget, Tokenless may warn or compact later expand output rather than blocking it.'
  ];
}

function buildCssActionBrief(lines, context = {}) {
  const regions = selectCssSnippetRegions(lines);
  const labels = regions.map((region) => `${region.label} ${region.start}:${region.end}`);
  const targetLine = labels.length
    ? `- Suggested first-pass targets: ${labels.join('; ')}.`
    : '- Suggested first-pass targets: theme variables, background, nav/header, buttons, cards/panels, hero/visual, footer.';

  return [
    ...buildPacketActionBoundary(context),
    'Action brief:',
    '- For broad visual/style requests, do not fully map the file. Do one minimal native Read to register editor state, then make 6-10 bounded Edit calls using the snippets below.',
    '- Do not use tokenless expand, grep, rg, sed, or extra Read calls unless a required old_string is missing from all snippets.',
    targetLine,
    '- Avoid repeated grep/Read/artifact-inspection loops.',
    '- Stop after meaningful high-impact improvements unless the user asks for exhaustive polish.',
    '- Final answer: 3-5 concise bullets only; do not write a long change diary.'
  ];
}

function stripHtmlTags(text) {
  return truncateText(String(text || '').replace(/<script\b[^>]*>.*?<\/script>/gi, '').replace(/<style\b[^>]*>.*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '), 120);
}

function extractHtmlSections(lines) {
  const out = [];
  const re = /^\s*<(section|main|header|footer|nav|article|aside|div)\b[^>]*(?:id|class)=["'][^"']+["'][^>]*>/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlIdsAndClasses(lines) {
  const out = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatches = line.matchAll(/\bid=["']([^"']+)["']/gi);
    for (const match of idMatches) {
      const value = `#${match[1]}`;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ line: i + 1, text: value });
    }

    const classMatches = line.matchAll(/\bclass=["']([^"']+)["']/gi);
    for (const match of classMatches) {
      for (const name of match[1].split(/\s+/).filter(Boolean)) {
        const value = `.${name}`;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({ line: i + 1, text: value });
      }
    }
  }

  return out;
}

function extractHtmlInteractive(lines) {
  const out = [];
  const re = /<(button|form|input|select|textarea|label|a)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlAssets(lines) {
  const out = [];
  const re = /<(img|script|style|link|source|video|canvas|svg)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlHeadings(lines) {
  const out = [];
  const re = /<h[1-6]\b[^>]*>.*?<\/h[1-6]>/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: stripHtmlTags(lines[i]) });
  }
  return out;
}

function summarizeHtml(lines) {
  const sections = extractHtmlSections(lines);
  const idsAndClasses = extractHtmlIdsAndClasses(lines);
  const interactive = extractHtmlInteractive(lines);
  const assets = extractHtmlAssets(lines);
  const headings = extractHtmlHeadings(lines);

  return [
    ...renderSection('HTML sections', sections, 12, (item) => `- line ${item.line} ${item.text}`, 'sections'),
    ...renderSection('IDs and classes', idsAndClasses, 18, (item) => `- line ${item.line} ${item.text}`, 'ids/classes'),
    ...renderSection('Interactive elements', interactive, 12, (item) => `- line ${item.line} ${item.text}`, 'interactive elements'),
    ...renderSection('Assets scripts and styles', assets, 8, (item) => `- line ${item.line} ${item.text}`, 'asset/script/style lines'),
    ...renderSection('Headings and visible text', headings, 12, (item) => `- line ${item.line} ${item.text}`, 'headings/text snippets')
  ];
}

const SOURCE_DECL_RE = /^\s*(?:(export)\s+)?(?:(default)\s+)?(?:(async)\s+)?(?:(function|class)\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:React\.)?(?:memo|forwardRef)?\s*\(?)/;
const SOURCE_REACT_HINT_RE = /\b(React|useState|useEffect|useMemo|useCallback|useReducer|useRef|jsx|tsx|className|props|children|return\s*\(|<[A-Z][A-Za-z0-9]*)\b/;
const SOURCE_EDIT_HINT_RE = /\b(handler|handle|submit|save|delete|update|render|view|panel|card|button|modal|form|input|fetch|load|query|filter|state|reducer|effect|validate|route|layout|theme|style)\b/i;

function sourceLang(filePath) {
  const ext = getFileExtension(filePath);
  if (ext === '.py') return 'py';
  if (ext === '.ts' || ext === '.tsx') return 'ts';
  return 'js';
}

function countIndent(line) {
  const match = String(line || '').match(/^\s*/);
  return match ? match[0].replace(/\t/g, '    ').length : 0;
}

function getPythonDeclarations(lines) {
  const declarations = [];
  const re = /^(\s*)(?:(async)\s+)?(def|class)\s+([A-Za-z_][\w]*)\s*(?:\(|[:(])/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(re);
    if (!match) continue;
    const startIndent = countIndent(match[1] || '');
    const keyword = match[3];
    const name = match[4];
    let end = i + 1;
    let editScore = SOURCE_EDIT_HINT_RE.test(name) ? 2 : 0;

    for (let j = i + 1; j < lines.length; j++) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (trimmed && countIndent(raw) <= startIndent && /^(?:async\s+)?(?:def|class)\s+[A-Za-z_][\w]*/.test(trimmed)) {
        break;
      }
      if (SOURCE_EDIT_HINT_RE.test(raw)) editScore += 1;
      end = j + 1;
      if ((end - i) >= 140) break;
    }

    declarations.push({
      start: i + 1,
      end,
      keyword,
      name,
      exported: !name.startsWith('_'),
      lines: end - i,
      reactScore: 0,
      editScore
    });
  }

  return declarations;
}

function getSourceDeclarations(lines, filePath) {
  if (getFileExtension(filePath) === '.py') return getPythonDeclarations(lines);

  const declarations = [];
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const match = !current ? raw.match(SOURCE_DECL_RE) : null;
    const opens = (raw.match(/\{/g) || []).length + (raw.match(/\(/g) || []).length * 0;
    const closes = (raw.match(/\}/g) || []).length + (raw.match(/\)/g) || []).length * 0;

    if (!current && match) {
      const keyword = match[4] || match[6] || 'const';
      const name = match[5] || match[7] || '(anonymous)';
      current = {
        start: i + 1,
        end: i + 1,
        keyword,
        name,
        exported: Boolean(match[1] || match[2]),
        lines: 0,
        reactScore: 0,
        editScore: 0
      };
      depth = 0;
    }

    if (current) {
      current.end = i + 1;
      current.lines += 1;
      if (SOURCE_REACT_HINT_RE.test(raw)) current.reactScore += 1;
      if (SOURCE_EDIT_HINT_RE.test(raw)) current.editScore += 1;
      depth += opens - closes;
      if ((depth <= 0 && ((current.lines === 1 && /;\s*$/.test(raw)) || (current.lines > 1 && /[};]\s*$/.test(raw)))) || current.lines >= 140) {
        declarations.push(current);
        current = null;
        depth = 0;
      }
    }
  }

  if (current) declarations.push(current);
  return declarations;
}

function extractSourceImports(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:import\s|from\s+[A-Za-z0-9_.$]+\s+import\s)/.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 120) });
  }
  return out;
}

function extractSourceImportSpecifiers(lines) {
  const specs = [];
  const seen = new Set();
  const importRe = /^\s*import(?:\s+type)?(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/;
  const dynamicRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const line of lines) {
    const staticMatch = line.match(importRe);
    if (staticMatch && !seen.has(staticMatch[1])) {
      specs.push(staticMatch[1]);
      seen.add(staticMatch[1]);
    }

    for (const re of [dynamicRe, requireRe]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        if (seen.has(match[1])) continue;
        specs.push(match[1]);
        seen.add(match[1]);
      }
    }
  }

  return specs;
}

function extractSourceExports(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*export\s/.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 120) });
  }
  return out;
}

function classifySourceDeclaration(decl) {
  if (decl.keyword === 'class') return 'class';
  if (/^use[A-Z]/.test(decl.name)) return 'hook';
  if (/^[A-Z]/.test(decl.name) && decl.reactScore > 0) return 'component';
  if (/reducer|state|store/i.test(decl.name)) return 'state/reducer';
  if (/handler|handle|submit|save|delete|update|validate/i.test(decl.name)) return 'handlers/actions';
  if (/fetch|load|query|request|get|list/i.test(decl.name)) return 'data/loaders';
  if (/render|view|panel|card|button|modal|form|layout/i.test(decl.name)) return 'ui/helpers';
  if (decl.exported) return 'exports/api';
  return 'helpers';
}

function summarizeSourceMap(lines, filePath) {
  const declarations = getSourceDeclarations(lines, filePath);
  if (!declarations.length) return [];

  const buckets = new Map();
  for (const decl of declarations) {
    const label = classifySourceDeclaration(decl);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(decl);
  }

  const priority = ['component', 'hook', 'class', 'state/reducer', 'handlers/actions', 'data/loaders', 'ui/helpers', 'exports/api', 'helpers'];
  const out = ['Source map:'];
  for (const label of priority) {
    const items = (buckets.get(label) || []).slice(0, 5);
    if (!items.length) continue;
    out.push(`- ${label}: ${items.map((item) => `${item.name} ${item.start}:${item.end}`).join('; ')}`);
  }
  return out.length > 1 ? out : [];
}

function selectSourceSnippetRegions(lines, filePath) {
  const declarations = getSourceDeclarations(lines, filePath);
  const scored = declarations
    .map((decl) => {
      let score = 0;
      if (decl.exported) score += 3;
      if (/^[A-Z]/.test(decl.name) && decl.reactScore > 0) score += 8;
      if (/^use[A-Z]/.test(decl.name)) score += 7;
      if (SOURCE_EDIT_HINT_RE.test(decl.name)) score += 5;
      score += Math.min(5, decl.reactScore);
      score += Math.min(5, decl.editScore);
      if (decl.lines > 120) score -= 6;
      return { ...decl, score, label: classifySourceDeclaration(decl) };
    })
    .filter((decl) => decl.lines <= 140 && decl.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.start - b.start;
    });

  const selected = [];
  const seenLabels = new Set();
  for (const decl of scored) {
    if (selected.length >= 7) break;
    if (seenLabels.has(decl.label) && selected.length >= 4) continue;
    selected.push(decl);
    seenLabels.add(decl.label);
  }

  return selected.sort((a, b) => a.start - b.start);
}

function buildSourceActionBoundary({ artifact, tokenlessPath, dataDir }) {
  const commandPrefix = tokenlessPath
    ? `node '${String(tokenlessPath).replace(/'/g, "'\\''")}'`
    : 'tokenless';
  const dataDirPart = dataDir ? ` --data-dir '${String(dataDir).replace(/'/g, "'\\''")}'` : '';

  return [
    'Action boundary:',
    '- First action after this packet should be one minimal native Read on this file to register editor state if you plan to edit.',
    '- After that registration Read, make 4-8 bounded Edit calls from the snippets below without additional exploration.',
    '- Use snippets below as exact old_string sources.',
    '- If this is a multi-file task, use Project file hints below before running ls/find/grep.',
    '- Do not create TaskCreate/task-list/plan-mode output for this bounded edit task; edit directly.',
    '- Do not use Write to overwrite an existing file after this packet; use bounded Edit/MultiEdit.',
    '- Do not rewrite generated/noise blocks unless the user explicitly asks.',
    '- Do not remap the file with grep/rg/sed or repeated Read calls.',
    '- Do not run tokenless read again for this file unless Tokenless reports TOKENLESS-STALE.',
    '- If exact text is missing, only these artifact lookup commands are valid:',
    `  1. ${commandPrefix} expand ${artifact} --around "<symbol-or-text>"${dataDirPart}`,
    `  2. ${commandPrefix} expand ${artifact} --lines <start:end>${dataDirPart}`,
    '- Budget: at most 2 artifact lookups before editing.'
  ];
}

function findSourceProjectRoot(filePath) {
  let dir = path.dirname(path.resolve(filePath || '.'));
  const stop = path.parse(dir).root;
  for (let depth = 0; depth < 8 && dir && dir !== stop; depth++) {
    const markers = ['package.json', 'tsconfig.json', 'jsconfig.json', 'vite.config.ts', 'next.config.js', 'pyproject.toml', 'setup.py', 'requirements.txt'];
    if (markers.some((marker) => fs.existsSync(path.join(dir, marker)))) return dir;
    dir = path.dirname(dir);
  }
  return path.dirname(path.resolve(filePath || '.'));
}

function relativeSourcePath(root, filePath) {
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  return rel && !rel.startsWith('..') ? rel : filePath;
}

function resolveLocalImport({ specifier, fromFile, root }) {
  if (!specifier || !specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...Array.from(SOURCE_NEIGHBOR_EXTENSIONS).map((ext) => `${base}${ext}`),
    ...Array.from(SOURCE_NEIGHBOR_EXTENSIONS).map((ext) => path.join(base, `index${ext}`))
  ];

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return relativeSourcePath(root, candidate);
    } catch (err) {
      // Try next candidate.
    }
  }
  return null;
}

function walkSourceFiles(dir, root, out, options = {}) {
  const maxFiles = options.maxFiles || 160;
  const maxDepth = options.maxDepth || 4;
  const depth = options.depth || 0;
  if (out.length >= maxFiles || depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }

  entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => {
      if (out.length >= maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.storybook') return;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SOURCE_SCAN_IGNORED_DIRS.has(entry.name)) return;
        walkSourceFiles(abs, root, out, { ...options, depth: depth + 1 });
        return;
      }
      if (!entry.isFile()) return;
      const ext = getFileExtension(abs);
      if (!SOURCE_NEIGHBOR_EXTENSIONS.has(ext)) return;
      out.push(relativeSourcePath(root, abs));
    });
}

function collectNearbySourceFiles(filePath, root) {
  const dirs = [];
  const addDir = (dir) => {
    if (!dir || !fs.existsSync(dir)) return;
    const normalized = path.resolve(dir);
    if (dirs.includes(normalized)) return;
    dirs.push(normalized);
  };

  const currentDir = path.dirname(path.resolve(filePath));
  addDir(currentDir);
  addDir(path.join(root, 'src'));
  addDir(path.join(root, 'app'));
  addDir(path.join(root, 'components'));
  addDir(path.join(root, 'pages'));

  const out = [];
  for (const dir of dirs) {
    walkSourceFiles(dir, root, out, { maxFiles: 120, maxDepth: dir === currentDir ? 2 : 3 });
    if (out.length >= 120) break;
  }

  return Array.from(new Set(out))
    .filter((item) => item !== relativeSourcePath(root, path.resolve(filePath)))
    .slice(0, 40);
}

function summarizeSourceProjectHints(lines, filePath) {
  const root = findSourceProjectRoot(filePath);
  const current = relativeSourcePath(root, path.resolve(filePath));
  const specs = extractSourceImportSpecifiers(lines);
  const localImports = Array.from(new Set(
    specs
      .map((specifier) => resolveLocalImport({ specifier, fromFile: path.resolve(filePath), root }))
      .filter(Boolean)
  ));
  const nearby = collectNearbySourceFiles(filePath, root)
    .filter((item) => !localImports.includes(item))
    .slice(0, 16);

  if (!localImports.length && !nearby.length) return [];

  const out = [
    'Project file hints:',
    `- current: ${current}`,
    '- Use these path hints before running ls/find/grep for nearby project files.'
  ];

  if (localImports.length) {
    out.push(`- local imports: ${localImports.slice(0, 12).join(', ')}${localImports.length > 12 ? ` (${localImports.length - 12} more)` : ''}`);
  }
  if (nearby.length) {
    out.push(`- nearby source/style/data files: ${nearby.join(', ')}`);
  }
  return out;
}

function buildSourceActionBrief(lines, context = {}) {
  const regions = selectSourceSnippetRegions(lines, context.filePath);
  const labels = regions.map((region) => `${region.label}:${region.name} ${region.start}:${region.end}`);
  return [
    ...buildSourceActionBoundary(context),
    'Action brief:',
    '- For broad source edits, do not fully map the file. Register editor state once, then edit from snippets.',
    labels.length
      ? `- Suggested first-pass targets: ${labels.join('; ')}.`
      : '- Suggested first-pass targets: exported component, hook/state logic, handlers, data loaders, UI helper blocks.',
    '- Do not run tests, build, typecheck, or browser validation unless the user explicitly asks.',
    '- Final answer: 3-5 concise bullets only; do not write a long change diary.'
  ];
}

function extractSourceEditableSnippets(lines, filePath) {
  const regions = selectSourceSnippetRegions(lines, filePath);
  if (!regions.length) return [];
  const lang = sourceLang(filePath);
  const out = [
    'Editable snippets:',
    '- Exact current text for high-impact source regions; prefer editing from these before more inspection.'
  ];
  for (const region of regions) {
    const code = lines.slice(region.start - 1, region.end).join('\n');
    out.push(`- ${region.label}: ${region.name} lines ${region.start}:${region.end}`);
    out.push(`\`\`\`${lang}`);
    out.push(code);
    out.push('```');
  }
  return out;
}

function summarizeSource(lines, filePath, context = {}) {
  const imports = extractSourceImports(lines);
  const exports = extractSourceExports(lines);
  return [
    ...buildSourceActionBrief(lines, { ...context, filePath }),
    ...summarizeSourceProjectHints(lines, filePath),
    ...extractSourceEditableSnippets(lines, filePath),
    ...summarizeSourceMap(lines, filePath),
    ...renderSection('Imports', imports, 10, (item) => `- line ${item.line} ${item.text}`, 'imports'),
    ...renderSection('Exports', exports, 10, (item) => `- line ${item.line} ${item.text}`, 'exports')
  ];
}

function getSfcSections(lines) {
  const sections = [];
  const openRe = /^\s*<(template|script|style)\b[^>]*>/i;
  const closeRe = (name) => new RegExp(`^\\s*</${name}>`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(openRe);
    if (!match) continue;
    const name = match[1].toLowerCase();
    let end = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      end = j + 1;
      if (closeRe(name).test(lines[j])) break;
    }
    sections.push({
      name,
      start: i + 1,
      end,
      text: truncateText(lines[i], 120)
    });
  }

  return sections;
}

function extractSfcTemplateHints(lines) {
  const out = [];
  const re = /<[A-Z][A-Za-z0-9_.:-]*|(@click|on:click|v-if|v-for|bind:|class=|class:|on:submit|@submit)/;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 140) });
  }
  return out;
}

function extractSfcEditableSnippets(lines, filePath) {
  const sections = getSfcSections(lines);
  if (!sections.length) return [];
  const lang = getFileExtension(filePath) === '.svelte' ? 'svelte' : 'vue';
  const out = [
    'Editable snippets:',
    '- Exact current text for high-impact component regions; prefer editing from these before more inspection.'
  ];
  for (const section of sections.slice(0, 4)) {
    const start = section.start;
    const end = Math.min(section.end, section.start + 90);
    const suffix = end < section.end ? ` (truncated, full section ${section.start}:${section.end})` : '';
    out.push(`- ${section.name}: lines ${section.start}:${section.end}${suffix}`);
    out.push(`\`\`\`${lang}`);
    out.push(lines.slice(start - 1, end).join('\n'));
    out.push('```');
  }
  return out;
}

function buildSfcActionBrief(lines, filePath, context = {}) {
  const sections = getSfcSections(lines);
  return [
    ...buildSourceActionBoundary(context),
    'Action brief:',
    '- For Vue/Svelte edits, use section snippets first: template for structure/interactions, script for state/actions, style for visuals.',
    sections.length
      ? `- Sections: ${sections.map((section) => `${section.name} ${section.start}:${section.end}`).join('; ')}.`
      : '- Sections: inspect template/script/style snippets before any broad exploration.',
    '- Do not run tests, build, typecheck, or browser validation unless the user explicitly asks.',
    '- Final answer: 3-5 concise bullets only; do not write a long change diary.'
  ];
}

function summarizeSfc(lines, filePath, context = {}) {
  const sections = getSfcSections(lines);
  const imports = extractSourceImports(lines);
  const templateHints = extractSfcTemplateHints(lines);
  return [
    ...buildSfcActionBrief(lines, filePath, { ...context, filePath }),
    ...summarizeSourceProjectHints(lines, filePath),
    ...extractSfcEditableSnippets(lines, filePath),
    ...renderSection('SFC sections', sections, 8, (item) => `- ${item.name} lines ${item.start}:${item.end} ${item.text}`, 'sections'),
    ...renderSection('Template interaction/component hints', templateHints, 14, (item) => `- line ${item.line} ${item.text}`, 'template hints'),
    ...renderSection('Script imports', imports, 10, (item) => `- line ${item.line} ${item.text}`, 'imports')
  ];
}

function buildEditableSummary(lines, anchors, filePath, context = {}) {
  const ext = getFileExtension(filePath);
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    return summarizeCss(lines, anchors, context);
  }
  if (['.html', '.htm', '.svg'].includes(ext)) {
    return summarizeHtml(lines);
  }
  if (SOURCE_PACKET_EXTENSIONS.has(ext)) {
    return summarizeSource(lines, filePath, context);
  }
  if (SFC_PACKET_EXTENSIONS.has(ext)) {
    return summarizeSfc(lines, filePath, context);
  }
  return [];
}

function summarizeRead({ filePath, text, artifactId, tokenlessPath, dataDir }) {
  const lines = splitReadLines(text);
  const beforeTokens = estimateTokens(text);
  const anchors = collectAnchors(lines, filePath);
  const artifact = artifactId || 'null';
  const editableSummary = buildEditableSummary(lines, anchors, filePath, { artifact, tokenlessPath, dataDir });
  const ext = getFileExtension(filePath);
  const isCssLike = ['.css', '.scss', '.sass', '.less'].includes(ext);
  const visibleAnchors = editableSummary.length
    ? (isCssLike ? [] : selectVisibleAnchors(anchors).slice(0, 25))
    : selectVisibleAnchors(anchors);
  const packet = [
    'TOKENLESS-READ-PACKET/0.1',
    '',
    `Tool: Read`,
    `File: ${filePath || '(unknown)'}`,
    `Type: ${ext || '(none)'}`,
    `Lines: ${lines.length}`,
    `Original tokens estimated: ${beforeTokens}`,
    `Local artifact: ${artifact}`,
    '',
    ...(editableSummary.length ? ['Summary:', ...editableSummary, ''] : []),
    ...(!isCssLike ? [
      'Structure anchors:',
      ...(visibleAnchors.length ? visibleAnchors.map((item) => `- line ${item.line} [${item.type}] ${item.text}`) : ['- (no anchors detected)']),
      ''
    ] : []),
    'Fallback local access:',
    `- Artifact ${artifact} is stored locally; use only the two artifact lookup commands listed in Action boundary when needed.`,
    `- Avoid show/raw/full-file reads during normal editing; they usually lengthen the agent trajectory.`,
    ''
  ].join('\n');

  return {
    text: packet,
    beforeTokens,
    afterTokens: estimateTokens(packet),
    anchors,
    reducer: 'read-packet'
  };
}

module.exports = {
  shouldCompactRead,
  summarizeRead,
  getFileExtension
};
