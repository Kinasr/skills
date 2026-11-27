import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SKILLS = [
  'setup-flow',
  'triage',
  'backlog-audit',
  'to-tickets',
  'handoff',
  'go-ahead',
];

export const DENYLISTED_PLANNER_COMMANDS = [
  '/egm:egm-',
  '/egm-brainstorm',
  '/egm-draft',
  '/egm-review',
  '/egm-lite',
  '/egm-resolve',
  '/egm-bootstrap',
  '/egm-drift-report',
  '/egm-review-loop',
  '/skill:egm-',
];

export const FORBIDDEN_PATH_REGEX =
  /(?:^|[\s(`"'])(?:\.\.[\/\\]|\.[\/\\]scripts[\/\\]|(?:references|scripts)[\/\\])/m;

export const PRESCRIPTIVE_CODING_REGEX =
  /\b(write (failing )?unit tests? first|red-green-refactor|run tdd|enforce commit style|format pull request body)\b/i;

const UNTRUSTED_DATA_SKILLS = new Set(['triage', 'backlog-audit', 'to-tickets', 'go-ahead']);
const STATE_DRIFT_SKILLS = new Set(['triage', 'backlog-audit', 'go-ahead']);
const CIRCUIT_OPEN_SKILLS = new Set(['triage', 'backlog-audit', 'to-tickets', 'go-ahead']);
const PROVENANCE_FOOTER_SKILLS = new Set(['triage', 'backlog-audit', 'handoff', 'go-ahead']);
const PROVENANCE_FOOTER_REGEX =
  /(?:provenance\s+(?:\S+\s+){0,2}footer|<!--\s*kinasr-skills:|\[kinasr-skills:)/i;

const EXPECTED_PLUGIN_NAME = 'kinasr-skills';
const EXPECTED_DISPLAY_NAME = 'Kinasr Skills';
const EXPECTED_LICENSE = 'MIT';

/**
 * Default git index query runner. Returns stdout string, or null when `git` is absent (ENOENT).
 * Throws on any non-ENOENT execution failure.
 */
export function defaultRunGitLsFiles(rootDir) {
  const result = spawnSync('git', ['ls-files', '-s'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      return null;
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(
      `git ls-files -s failed with exit code ${result.status}${stderr ? `: ${stderr}` : ''}`,
    );
  }

  return result.stdout;
}

function assertNoSymlinks(dirPath, { isRepoRoot = false } = {}) {
  const rootStat = fs.lstatSync(dirPath);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Symlink not allowed: ${dirPath}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Expected directory: ${dirPath}`);
  }

  for (const entry of fs.readdirSync(dirPath)) {
    if (isRepoRoot && entry === '.git') {
      continue;
    }
    const fullPath = path.join(dirPath, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink not allowed: ${fullPath}`);
    }
    if (stat.isDirectory()) {
      assertNoSymlinks(fullPath, { isRepoRoot: false });
    }
  }
}

function checkGitIndexSymlinks(rootDir, runGitLsFiles) {
  const dotGitPath = path.join(rootDir, '.git');
  let hasDotGit = false;
  try {
    fs.lstatSync(dotGitPath);
    hasDotGit = true;
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }

  if (typeof runGitLsFiles !== 'function' && !hasDotGit) {
    return;
  }

  const lsFilesFn = runGitLsFiles ?? defaultRunGitLsFiles;
  let stdout;
  try {
    stdout = lsFilesFn(rootDir);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return;
    }
    throw err;
  }

  if (stdout === null || stdout === undefined) {
    return;
  }

  const symlinkEntries = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const tabMatch = /^(\d+)\s+\S+\s+\d+\t(.+)$/.exec(line);
    if (tabMatch) {
      if (tabMatch[1] === '120000') {
        symlinkEntries.push(tabMatch[2]);
      }
      continue;
    }
    const mode = line.trim().split(/\s+/)[0];
    if (mode === '120000') {
      symlinkEntries.push(line.trim());
    }
  }

  if (symlinkEntries.length > 0) {
    throw new Error(
      `Git index contains symlink entries (mode 120000): ${symlinkEntries.join(', ')}`,
    );
  }
}

function assertNonEmptyRegularFile(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(`Missing required file ${label}: ${filePath}`);
    }
    throw err;
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Expected regular file for ${label}: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.trim().length === 0) {
    throw new Error(`File ${label} must not be empty: ${filePath}`);
  }
  return content;
}

function readJsonObject(filePath, label) {
  const raw = assertNonEmptyRegularFile(filePath, label);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Malformed JSON in ${label} (${filePath}): ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${label}: ${filePath}`);
  }
  return parsed;
}

function assertNonEmptyString(value, fieldLabel) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string for ${fieldLabel}`);
  }
  return value;
}

function validateManifests(rootDir) {
  const rootManifest = readJsonObject(path.join(rootDir, 'plugin.json'), 'plugin.json');
  const claudeManifest = readJsonObject(
    path.join(rootDir, '.claude-plugin', 'plugin.json'),
    '.claude-plugin/plugin.json',
  );
  const marketplace = readJsonObject(
    path.join(rootDir, '.claude-plugin', 'marketplace.json'),
    '.claude-plugin/marketplace.json',
  );

  if (Object.hasOwn(rootManifest, '$schema')) {
    throw new Error('Root plugin.json must not contain "$schema"');
  }

  // Exact required values and parity across plugin.json & .claude-plugin/plugin.json
  assertNonEmptyString(rootManifest.name, 'plugin.json:name');
  assertNonEmptyString(claudeManifest.name, '.claude-plugin/plugin.json:name');
  if (rootManifest.name !== EXPECTED_PLUGIN_NAME || claudeManifest.name !== EXPECTED_PLUGIN_NAME) {
    throw new Error(
      `Manifest "name" must equal "${EXPECTED_PLUGIN_NAME}" in plugin.json and .claude-plugin/plugin.json`,
    );
  }

  assertNonEmptyString(rootManifest.displayName, 'plugin.json:displayName');
  assertNonEmptyString(claudeManifest.displayName, '.claude-plugin/plugin.json:displayName');
  if (
    rootManifest.displayName !== EXPECTED_DISPLAY_NAME ||
    claudeManifest.displayName !== EXPECTED_DISPLAY_NAME
  ) {
    throw new Error(
      `Manifest "displayName" must equal "${EXPECTED_DISPLAY_NAME}" in plugin.json and .claude-plugin/plugin.json`,
    );
  }

  assertNonEmptyString(rootManifest.license, 'plugin.json:license');
  assertNonEmptyString(claudeManifest.license, '.claude-plugin/plugin.json:license');
  if (rootManifest.license !== EXPECTED_LICENSE || claudeManifest.license !== EXPECTED_LICENSE) {
    throw new Error(
      `Manifest "license" must equal "${EXPECTED_LICENSE}" in plugin.json and .claude-plugin/plugin.json`,
    );
  }

  for (const field of ['version', 'description', 'homepage', 'repository']) {
    const rootVal = assertNonEmptyString(rootManifest[field], `plugin.json:${field}`);
    const claudeVal = assertNonEmptyString(
      claudeManifest[field],
      `.claude-plugin/plugin.json:${field}`,
    );
    if (rootVal !== claudeVal) {
      throw new Error(
        `Manifest field "${field}" mismatch between plugin.json and .claude-plugin/plugin.json`,
      );
    }
  }

  const rootAuthor = assertNonEmptyString(rootManifest.author?.name, 'plugin.json:author.name');
  const claudeAuthor = assertNonEmptyString(
    claudeManifest.author?.name,
    '.claude-plugin/plugin.json:author.name',
  );
  if (rootAuthor !== claudeAuthor) {
    throw new Error(
      'Manifest field "author.name" mismatch between plugin.json and .claude-plugin/plugin.json',
    );
  }

  // .claude-plugin/plugin.json required extras
  if (
    !Array.isArray(claudeManifest.keywords) ||
    claudeManifest.keywords.length === 0 ||
    !claudeManifest.keywords.every((k) => typeof k === 'string' && k.trim().length > 0)
  ) {
    throw new Error('.claude-plugin/plugin.json:keywords must be a non-empty array of strings');
  }
  assertNonEmptyString(claudeManifest.documentationUrl, '.claude-plugin/plugin.json:documentationUrl');
  assertNonEmptyString(claudeManifest.supportUrl, '.claude-plugin/plugin.json:supportUrl');

  // .claude-plugin/marketplace.json parity
  const marketName = assertNonEmptyString(marketplace.name, '.claude-plugin/marketplace.json:name');
  if (marketName !== EXPECTED_PLUGIN_NAME) {
    throw new Error(`.claude-plugin/marketplace.json:name must equal "${EXPECTED_PLUGIN_NAME}"`);
  }

  const ownerName = assertNonEmptyString(
    marketplace.owner?.name,
    '.claude-plugin/marketplace.json:owner.name',
  );
  if (ownerName !== rootAuthor) {
    throw new Error(
      '.claude-plugin/marketplace.json:owner.name must match plugin.json:author.name',
    );
  }

  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    throw new Error('.claude-plugin/marketplace.json:plugins must be a non-empty array');
  }

  const entry = marketplace.plugins[0];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('.claude-plugin/marketplace.json:plugins[0] must be an object');
  }

  const entryName = assertNonEmptyString(
    entry.name,
    '.claude-plugin/marketplace.json:plugins[0].name',
  );
  if (entryName !== EXPECTED_PLUGIN_NAME) {
    throw new Error(
      `.claude-plugin/marketplace.json:plugins[0].name must equal "${EXPECTED_PLUGIN_NAME}"`,
    );
  }

  const entrySource = assertNonEmptyString(
    entry.source,
    '.claude-plugin/marketplace.json:plugins[0].source',
  );
  if (entrySource !== './') {
    throw new Error('.claude-plugin/marketplace.json:plugins[0].source must equal "./"');
  }

  const entryDesc = assertNonEmptyString(
    entry.description,
    '.claude-plugin/marketplace.json:plugins[0].description',
  );
  if (entryDesc !== rootManifest.description) {
    throw new Error(
      '.claude-plugin/marketplace.json:plugins[0].description must match plugin.json:description',
    );
  }
}

function stripInlineYamlComment(text) {
  const match = /\s+#/.exec(text);
  return (match ? text.slice(0, match.index) : text).trim();
}

function readQuotedScalar(lines, startIdx, firstLineRest, quoteChar, filePath, key) {
  let lineIdx = startIdx;
  let pos = 1; // skip opening quote
  let current = firstLineRest;
  let value = '';

  while (true) {
    while (pos < current.length) {
      const ch = current[pos];
      if (quoteChar === '"') {
        if (ch === '\\') {
          if (pos + 1 < current.length) {
            const next = current[pos + 1];
            if (next === 'n') value += '\n';
            else if (next === 't') value += '\t';
            else if (next === 'r') value += '\r';
            else value += next;
            pos += 2;
            continue;
          }
          // Line-continuation backslash at end of line
          pos += 1;
          break;
        }
        if (ch === '"') {
          return { value, nextIndex: lineIdx + 1 };
        }
        value += ch;
        pos += 1;
      } else {
        // Single-quoted YAML: '' escapes a literal '
        if (ch === "'") {
          if (pos + 1 < current.length && current[pos + 1] === "'") {
            value += "'";
            pos += 2;
            continue;
          }
          return { value, nextIndex: lineIdx + 1 };
        }
        value += ch;
        pos += 1;
      }
    }

    lineIdx += 1;
    if (lineIdx >= lines.length) {
      throw new Error(`Unterminated ${quoteChar}-quoted scalar for "${key}" in ${filePath}`);
    }
    value += '\n';
    current = lines[lineIdx];
    pos = 0;
  }
}

function parseFrontmatter(rawContent, filePath) {
  const normalized = rawContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length < 3 || !/^---[ \t]*$/.test(lines[0])) {
    throw new Error(`Missing opening --- frontmatter fence in ${filePath}`);
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---[ \t]*$/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    throw new Error(`Missing closing --- frontmatter fence in ${filePath}`);
  }

  const fmLines = lines.slice(1, endIdx);
  const fields = new Map();
  let i = 0;

  while (i < fmLines.length) {
    const line = fmLines[i];
    if (/^\s*(?:#.*)?$/.test(line)) {
      i += 1;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!keyMatch) {
      i += 1;
      continue;
    }

    const key = keyMatch[1];
    const trimmedRest = keyMatch[2].trim();

    if (/^[|>](?:[+-]\d*|\d+[+-]?)?$/.test(trimmedRest)) {
      const isFolded = trimmedRest.startsWith('>');
      const blockLines = [];
      i += 1;
      while (i < fmLines.length) {
        const nextLine = fmLines[i];
        if (nextLine.trim() === '') {
          blockLines.push('');
          i += 1;
          continue;
        }
        if (/^[ \t]+/.test(nextLine)) {
          blockLines.push(nextLine);
          i += 1;
          continue;
        }
        break;
      }
      const indents = blockLines
        .filter((l) => l.length > 0)
        .map((l) => /^[ \t]*/.exec(l)[0].length);
      const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
      const stripped = blockLines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : ''));
      const value = isFolded
        ? stripped
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join(' ')
        : stripped.join('\n').trim();
      fields.set(key, value);
      continue;
    }

    if (trimmedRest.startsWith('"') || trimmedRest.startsWith("'")) {
      const quote = trimmedRest[0];
      const extracted = readQuotedScalar(fmLines, i, trimmedRest, quote, filePath, key);
      fields.set(key, extracted.value);
      i = extracted.nextIndex;
      continue;
    }

    const parts = [];
    if (trimmedRest.length > 0) {
      parts.push(stripInlineYamlComment(trimmedRest));
    }
    i += 1;
    while (i < fmLines.length) {
      const nextLine = fmLines[i];
      if (/^[ \t]+\S/.test(nextLine)) {
        if (parts.length === 0 && /^[ \t]+(?:-\s|[A-Za-z0-9_-]+:)/.test(nextLine)) {
          break;
        }
        parts.push(stripInlineYamlComment(nextLine.trim()));
        i += 1;
        continue;
      }
      if (nextLine.trim() === '') {
        let lookahead = i + 1;
        while (lookahead < fmLines.length && fmLines[lookahead].trim() === '') {
          lookahead += 1;
        }
        if (lookahead < fmLines.length && /^[ \t]+\S/.test(fmLines[lookahead])) {
          i += 1;
          continue;
        }
      }
      break;
    }
    fields.set(key, parts.join(' ').trim());
  }

  return fields;
}

function collectMarkdownFiles(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (stat.isFile() && entry.toLowerCase().endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function validateMarkdownBoundaries(filePath, content) {
  for (const cmd of DENYLISTED_PLANNER_COMMANDS) {
    if (content.includes(cmd)) {
      throw new Error(`Denylisted planner command "${cmd}" found in ${filePath}`);
    }
  }

  const forbiddenPathMatch = FORBIDDEN_PATH_REGEX.exec(content);
  if (forbiddenPathMatch) {
    throw new Error(
      `Forbidden relative path "${forbiddenPathMatch[0].trim()}" found in ${filePath}`,
    );
  }

  const prescriptiveMatch = PRESCRIPTIVE_CODING_REGEX.exec(content);
  if (prescriptiveMatch) {
    throw new Error(
      `Prescriptive coding/TDD directive "${prescriptiveMatch[0]}" found in ${filePath}`,
    );
  }
}

/**
 * Validates a single self-contained skill directory.
 * @param {string} skillDir
 */
export function validateSkillDir(skillDir) {
  const absSkillDir = path.resolve(skillDir);
  assertNoSymlinks(absSkillDir, { isRepoRoot: false });

  const dirName = path.basename(absSkillDir);
  const skillMdPath = path.join(absSkillDir, 'SKILL.md');
  const skillMdContent = assertNonEmptyRegularFile(skillMdPath, `${dirName}/SKILL.md`);

  const frontmatter = parseFrontmatter(skillMdContent, skillMdPath);

  const fmName = frontmatter.get('name');
  if (fmName !== dirName) {
    throw new Error(
      `Frontmatter "name" (${fmName ?? '<missing>'}) must match directory name "${dirName}" in ${skillMdPath}`,
    );
  }

  const fmDesc = frontmatter.get('description');
  if (typeof fmDesc !== 'string' || fmDesc.trim().length === 0) {
    throw new Error(`Frontmatter "description" must be non-empty in ${skillMdPath}`);
  }

  const fmLicense = frontmatter.get('license');
  if (fmLicense !== EXPECTED_LICENSE) {
    throw new Error(
      `Frontmatter "license" (${fmLicense ?? '<missing>'}) must equal "${EXPECTED_LICENSE}" in ${skillMdPath}`,
    );
  }

  const fmDisableModel = frontmatter.get('disable-model-invocation');
  if (fmDisableModel !== 'true') {
    throw new Error(
      `Frontmatter "disable-model-invocation" (${fmDisableModel ?? '<missing>'}) must equal "true" in ${skillMdPath}`,
    );
  }

  // Verify ./references/<file>.md links and boundaries across every .md file inside the skill directory.
  const refRegex = /\.\/references\/([A-Za-z0-9._/-]+\.md)/g;
  const referencesRoot = path.resolve(absSkillDir, 'references') + path.sep;
  const markdownFiles = collectMarkdownFiles(absSkillDir);
  const combinedParts = [];
  for (const mdFile of markdownFiles) {
    const relLabel = (path.relative(absSkillDir, mdFile) || path.basename(mdFile))
      .split(path.sep)
      .join('/');
    const content = assertNonEmptyRegularFile(mdFile, `${dirName}/${relLabel}`);
    for (const match of content.matchAll(refRegex)) {
      const relTarget = match[1];
      const targetPath = path.resolve(absSkillDir, 'references', relTarget);
      if (!targetPath.startsWith(referencesRoot)) {
        throw new Error(`Invalid ./references/ path "${match[0]}" in ${mdFile}`);
      }
      assertNonEmptyRegularFile(targetPath, `${dirName}/references/${relTarget}`);
    }
    validateMarkdownBoundaries(mdFile, content);
    combinedParts.push(content);
  }
  const combinedText = combinedParts.join('\n');

  // Cross-skill contract parity checks for matching skill names.
  if (UNTRUSTED_DATA_SKILLS.has(dirName) && !combinedText.includes('<untrusted_ticket_data>')) {
    throw new Error(
      `Skill "${dirName}" is missing required "<untrusted_ticket_data>" contract marker`,
    );
  }

  if (STATE_DRIFT_SKILLS.has(dirName) && !combinedText.includes('STATE_DRIFT')) {
    throw new Error(`Skill "${dirName}" is missing required "STATE_DRIFT" contract marker`);
  }

  if (CIRCUIT_OPEN_SKILLS.has(dirName) && !combinedText.includes('CIRCUIT_OPEN')) {
    throw new Error(`Skill "${dirName}" is missing required "CIRCUIT_OPEN" contract marker`);
  }

  if (PROVENANCE_FOOTER_SKILLS.has(dirName) && !PROVENANCE_FOOTER_REGEX.test(combinedText)) {
    throw new Error(
      `Skill "${dirName}" is missing required remote provenance footer contract rule`,
    );
  }

  return {
    skillName: dirName,
    markdownFiles: markdownFiles.length,
  };
}

/**
 * Validates the entire repository structure, manifests, symlinks, and skills.
 * @param {string} rootDir
 * @param {{ allowMissingSkills?: boolean, runGitLsFiles?: (dir: string) => string | null }} [options]
 */
export function validateRepo(rootDir, { allowMissingSkills = false, runGitLsFiles } = {}) {
  const absRoot = path.resolve(rootDir);

  assertNoSymlinks(absRoot, { isRepoRoot: true });
  checkGitIndexSymlinks(absRoot, runGitLsFiles);

  assertNonEmptyRegularFile(path.join(absRoot, 'LICENSE'), 'LICENSE');
  assertNonEmptyRegularFile(path.join(absRoot, 'README.md'), 'README.md');

  validateManifests(absRoot);

  const skillsRoot = path.join(absRoot, 'skills');
  let skillsStat = null;
  try {
    skillsStat = fs.lstatSync(skillsRoot);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }

  if (!skillsStat) {
    if (allowMissingSkills) {
      return { ok: true, validatedSkills: [] };
    }
    throw new Error(`Missing required skills directory: ${skillsRoot}`);
  }

  if (!skillsStat.isDirectory()) {
    throw new Error(`Expected skills to be a directory: ${skillsRoot}`);
  }

  const presentSkillDirs = [];
  for (const entry of fs.readdirSync(skillsRoot)) {
    const entryPath = path.join(skillsRoot, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isDirectory()) {
      presentSkillDirs.push(entry);
    }
  }
  presentSkillDirs.sort();

  if (!allowMissingSkills) {
    if (presentSkillDirs.length === 0) {
      throw new Error(`Skills directory must not be empty: ${skillsRoot}`);
    }
    for (const required of REQUIRED_SKILLS) {
      if (!presentSkillDirs.includes(required)) {
        throw new Error(`Missing required skill directory: skills/${required}`);
      }
    }
  }

  for (const skillName of presentSkillDirs) {
    validateSkillDir(path.join(skillsRoot, skillName));
  }

  return {
    ok: true,
    validatedSkills: presentSkillDirs,
  };
}

function parseCliArgs(argv) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const opts = {
    rootDir: defaultRoot,
    allowMissingSkills: false,
    skillDir: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-missing-skills') {
      opts.allowMissingSkills = true;
    } else if (arg === '--root') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for --root');
      }
      opts.rootDir = path.resolve(argv[++i]);
    } else if (arg === '--skill-dir') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for --skill-dir');
      }
      opts.skillDir = path.resolve(argv[++i]);
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return opts;
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    const selfReal = fs.realpathSync(fileURLToPath(import.meta.url));
    const entryReal = fs.realpathSync(path.resolve(process.argv[1]));
    if (process.platform === 'win32') {
      return selfReal.toLowerCase() === entryReal.toLowerCase();
    }
    return selfReal === entryReal;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const { rootDir, allowMissingSkills, skillDir } = parseCliArgs(process.argv.slice(2));
    if (skillDir) {
      const res = validateSkillDir(skillDir);
      console.log(`OK: validated skill "${res.skillName}" (${res.markdownFiles} markdown file(s))`);
    } else {
      const res = validateRepo(rootDir, { allowMissingSkills });
      console.log(
        `OK: validated repository (${res.validatedSkills.length} skill(s): ${res.validatedSkills.join(', ') || 'none'})`,
      );
    }
  } catch (err) {
    console.error(`Validation failed: ${err.message}`);
    process.exitCode = 1;
  }
}
