import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DENYLISTED_PLANNER_COMMANDS,
  REQUIRED_SKILLS,
  validateRepo,
  validateSkillDir,
} from './validate-repo.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = path.join(THIS_DIR, 'validate-repo.mjs');

const tempDirs = [];

function makeTempDir(prefix = 'kinasr-validate-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createValidManifests(rootDir) {
  const description =
    'Work-orchestration and session-hygiene skills around AI coding agents and planners.';

  writeFile(path.join(rootDir, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026 kinasr\n');
  writeFile(path.join(rootDir, 'README.md'), '# Kinasr Skills\n\nWork orchestration toolkit.\n');

  writeFile(
    path.join(rootDir, 'plugin.json'),
    JSON.stringify(
      {
        name: 'kinasr-skills',
        displayName: 'Kinasr Skills',
        version: '0.1.0',
        license: 'MIT',
        author: { name: 'kinasr' },
        description,
        homepage: 'https://github.com/Kinasr/skills',
        repository: 'https://github.com/Kinasr/skills',
        suggestedPrompts: [
          'Initialize work tracking for this repository',
          'Triage untriaged issues and propose readiness states',
          'Audit the open backlog for blockers and stale items',
        ],
      },
      null,
      2,
    ),
  );

  writeFile(
    path.join(rootDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'kinasr-skills',
        displayName: 'Kinasr Skills',
        version: '0.1.0',
        description,
        author: { name: 'kinasr' },
        homepage: 'https://github.com/Kinasr/skills',
        repository: 'https://github.com/Kinasr/skills',
        license: 'MIT',
        keywords: ['work-tracking', 'triage', 'backlog', 'agent-skills'],
        documentationUrl: 'https://github.com/Kinasr/skills#readme',
        supportUrl: 'https://github.com/Kinasr/skills/issues',
      },
      null,
      2,
    ),
  );

  writeFile(
    path.join(rootDir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        name: 'kinasr-skills',
        owner: { name: 'kinasr' },
        plugins: [
          {
            name: 'kinasr-skills',
            source: './',
            description,
          },
        ],
      },
      null,
      2,
    ),
  );
}

function createValidSkill(skillsBaseDir, skillName) {
  const skillDir = path.join(skillsBaseDir, skillName);
  const configs = {
    'setup-flow': {
      desc: '"Initialize or update work-tracking config in .agents/work-tracking.md and passive rules in AGENTS.md."',
      ref: 'templates.md',
      body: [
        'Use `./references/templates.md` for templates.',
        'Insert `@AGENTS.md` in `./CLAUDE.md` or `@../AGENTS.md` in `.claude/CLAUDE.md` if opted in.',
      ].join('\n'),
      refBody: '# Templates\n\n`Schema: 1`\n',
    },
    triage: {
      desc: '"Triage single tickets or small batches in topological waves to assign readiness, types, and blockers."',
      ref: 'batch-wave.md',
      body: [
        'Wrap external text in `<untrusted_ticket_data>` tags.',
        'Handle `STATE_DRIFT` and `CIRCUIT_OPEN`.',
        'Append a branch-free provenance footer: `<!-- kinasr-skills: triage | <UTC> | <sha> -->`.',
        'See `./references/batch-wave.md` for wave dispatch.',
      ].join('\n'),
      refBody: '# Batch Wave\n\nTopological wave protocol.\n',
    },
    'backlog-audit': {
      desc: '"Audit the open backlog dependency graph, PR links, conflicts, and stale items without deep code reads."',
      ref: 'audit-rules.md',
      body: [
        'Wrap external text in `<untrusted_ticket_data>` tags.',
        'Handle `STATE_DRIFT` and `CIRCUIT_OPEN`.',
        'Append a branch-free provenance footer on remote comments.',
        'See `./references/audit-rules.md` for predicates.',
      ].join('\n'),
      refBody: '# Audit Rules\n\nBounded graph checks.\n',
    },
    'to-tickets': {
      desc: '"Slice a finished design spec or inline plan into vertical ready:direct tickets in topological order."',
      ref: 'slice-rules.md',
      body: [
        'Wrap external text in `<untrusted_ticket_data>` tags.',
        'See `./references/slice-rules.md` for slicing.',
      ].join('\n'),
      refBody: '# Slice Rules\n\nVertical slicing protocol.\n',
    },
    handoff: {
      desc: '"Generate a git-grounded session handoff snapshot and optionally post a redacted update to the active ticket."',
      ref: null,
      body: [
        'Print local snapshot first.',
        'When posting remotely, append a branch-free provenance footer `<!-- kinasr-skills: handoff | <UTC> | <sha> -->` or `[kinasr-skills: ...]`.',
      ].join('\n'),
      refBody: null,
    },
  };

  const cfg = configs[skillName];
  const skillMd = [
    '---',
    `name: ${skillName}`,
    `description: ${cfg.desc}`,
    'license: MIT',
    'disable-model-invocation: true',
    '---',
    '',
    `# ${skillName}`,
    '',
    cfg.body,
    '',
  ].join('\n');

  writeFile(path.join(skillDir, 'SKILL.md'), skillMd);
  if (cfg.ref) {
    writeFile(path.join(skillDir, 'references', cfg.ref), cfg.refBody);
  }
  return skillDir;
}

function createFullValidRepo(rootDir) {
  createValidManifests(rootDir);
  const skillsDir = path.join(rootDir, 'skills');
  for (const name of REQUIRED_SKILLS) {
    createValidSkill(skillsDir, name);
  }
  return rootDir;
}

function runCli(args) {
  return spawnSync(process.execPath, [VALIDATOR_PATH, ...args], {
    encoding: 'utf8',
  });
}

describe('validate-repo positive assertions', () => {
  it('passes strict validateRepo and CLI --root on a complete valid fixture (with CRLF support)', () => {
    const root = createFullValidRepo(makeTempDir());
    // Convert handoff/SKILL.md to CRLF to verify cross-OS line-ending handling
    const handoffPath = path.join(root, 'skills', 'handoff', 'SKILL.md');
    const crlf = fs.readFileSync(handoffPath, 'utf8').replace(/\n/g, '\r\n');
    fs.writeFileSync(handoffPath, crlf, 'utf8');

    const res = validateRepo(root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.validatedSkills, [...REQUIRED_SKILLS].sort());

    const cli = runCli(['--root', root]);
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /^OK: validated repository/);
  });

  it('passes validateSkillDir and CLI --skill-dir on isolated copies of each skill', () => {
    for (const skillName of REQUIRED_SKILLS) {
      const isolatedParent = makeTempDir(`skill-${skillName}-`);
      const skillDir = createValidSkill(isolatedParent, skillName);

      const res = validateSkillDir(skillDir);
      assert.equal(res.skillName, skillName);

      const cli = runCli(['--skill-dir', skillDir]);
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, new RegExp(`OK: validated skill "${skillName}"`));
    }
  });

  it('passes --allow-missing-skills for Phase 1 (absent skills/) and Phase 2 (partial skills/)', () => {
    const phase1Root = makeTempDir('phase1-');
    createValidManifests(phase1Root);

    const p1Res = validateRepo(phase1Root, { allowMissingSkills: true });
    assert.equal(p1Res.ok, true);
    assert.deepEqual(p1Res.validatedSkills, []);

    const p1Cli = runCli(['--root', phase1Root, '--allow-missing-skills']);
    assert.equal(p1Cli.status, 0, p1Cli.stderr);

    const phase2Root = makeTempDir('phase2-');
    createValidManifests(phase2Root);
    createValidSkill(path.join(phase2Root, 'skills'), 'setup-flow');
    createValidSkill(path.join(phase2Root, 'skills'), 'handoff');

    const p2Res = validateRepo(phase2Root, { allowMissingSkills: true });
    assert.equal(p2Res.ok, true);
    assert.deepEqual(p2Res.validatedSkills, ['handoff', 'setup-flow']);

    const p2Cli = runCli(['--root', phase2Root, '--allow-missing-skills']);
    assert.equal(p2Cli.status, 0, p2Cli.stderr);
  });

  it('supports multi-line block/quoted YAML descriptions and ignores SKILL.md line count', () => {
    const parent = makeTempDir('multiline-');
    const skillDir = createValidSkill(parent, 'setup-flow');
    const longBody = Array.from({ length: 260 }, (_, idx) => `- Rule line ${idx + 1}`).join('\n');

    // Folded multi-line block scalar + >250 lines
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: setup-flow',
        'description: >',
        '  Initialize or update work-tracking config',
        '  across repositories safely.',
        'license: MIT',
        'disable-model-invocation: "true"',
        '---',
        '',
        'Use `./references/templates.md`.',
        longBody,
        '',
      ].join('\n'),
    );
    assert.equal(validateSkillDir(skillDir).skillName, 'setup-flow');

    // Literal block scalar
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: setup-flow',
        'description: |',
        '  Line one',
        '  Line two',
        'license: MIT',
        'disable-model-invocation: true',
        '---',
        'Body',
      ].join('\n'),
    );
    assert.equal(validateSkillDir(skillDir).skillName, 'setup-flow');

    // Multi-line double-quoted scalar
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: setup-flow',
        'description: "Initialize tracking',
        '  with quoted multi-line scalar"',
        'license: MIT',
        'disable-model-invocation: true',
        '---',
        'Body',
      ].join('\n'),
    );
    assert.equal(validateSkillDir(skillDir).skillName, 'setup-flow');

    // Single-quoted scalar with escaped apostrophe
    writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: setup-flow',
        "description: 'Manage repo''s work tracking config'",
        'license: MIT',
        'disable-model-invocation: true',
        '---',
        'Body',
      ].join('\n'),
    );
    assert.equal(validateSkillDir(skillDir).skillName, 'setup-flow');
  });

  it('skips git-index check cleanly when git binary is missing (ENOENT) or .git is absent', () => {
    const root = createFullValidRepo(makeTempDir());
    assert.equal(
      validateRepo(root, { runGitLsFiles: () => null }).ok,
      true,
    );

    const enoentErr = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    assert.equal(
      validateRepo(root, {
        runGitLsFiles: () => {
          throw enoentErr;
        },
      }).ok,
      true,
    );
  });
});

describe('validate-repo symlink and git-index negative assertions', () => {
  it('rejects a filesystem symlink outside .git', (t) => {
    const root = createFullValidRepo(makeTempDir());
    const symlinkPath = path.join(root, 'skills', 'setup-flow', 'link.md');
    try {
      fs.symlinkSync(path.join(root, 'README.md'), symlinkPath);
    } catch (err) {
      if (process.platform === 'win32' && err?.code === 'EPERM') {
        t.skip('Filesystem symlink creation requires elevated permissions on Windows');
        return;
      }
      throw err;
    }

    assert.throws(() => validateRepo(root), /Symlink not allowed/);
    assert.throws(
      () => validateSkillDir(path.join(root, 'skills', 'setup-flow')),
      /Symlink not allowed/,
    );
  });

  it('rejects git index mode 120000 from runGitLsFiles', () => {
    const root = createFullValidRepo(makeTempDir());
    assert.throws(
      () =>
        validateRepo(root, {
          runGitLsFiles: () =>
            '100644 deadbeef 0\tREADME.md\n120000 cafe1234 0\tskills/triage/link.md\n',
        }),
      /mode 120000/,
    );
  });

  it('fails on non-ENOENT git execution errors', () => {
    const root = createFullValidRepo(makeTempDir());
    assert.throws(
      () =>
        validateRepo(root, {
          runGitLsFiles: () => {
            throw Object.assign(new Error('git permission denied'), { code: 'EACCES' });
          },
        }),
      /git permission denied/,
    );

    // Real .git file pointing to nonexistent gitdir triggers non-zero git exit (non-ENOENT)
    const gitCheck = spawnSync('git', ['--version'], { stdio: 'ignore' });
    if (!gitCheck.error) {
      writeFile(path.join(root, '.git'), 'gitdir: /nonexistent-gitdir-for-test\n');
      assert.throws(() => validateRepo(root), /git ls-files -s failed/);
    }
  });
});

describe('validate-repo static files and manifest parity negative assertions', () => {
  it('rejects missing or whitespace-only LICENSE and README.md', () => {
    for (const file of ['LICENSE', 'README.md']) {
      const missingRoot = createFullValidRepo(makeTempDir());
      fs.rmSync(path.join(missingRoot, file));
      assert.throws(() => validateRepo(missingRoot), new RegExp(`Missing required file ${file}`));

      const blankRoot = createFullValidRepo(makeTempDir());
      writeFile(path.join(blankRoot, file), '   \n\t\r\n ');
      assert.throws(() => validateRepo(blankRoot), new RegExp(`File ${file} must not be empty`));
    }
  });

  it('rejects malformed JSON in any of the 3 manifest/catalog files', () => {
    const targets = [
      'plugin.json',
      path.join('.claude-plugin', 'plugin.json'),
      path.join('.claude-plugin', 'marketplace.json'),
    ];
    for (const rel of targets) {
      const root = createFullValidRepo(makeTempDir());
      writeFile(path.join(root, rel), '{ invalid json');
      assert.throws(() => validateRepo(root), /Malformed JSON/);
    }
  });

  it('rejects $schema in root plugin.json', () => {
    const root = createFullValidRepo(makeTempDir());
    const p = path.join(root, 'plugin.json');
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    obj.$schema = 'https://example.com/schema.json';
    writeFile(p, JSON.stringify(obj, null, 2));
    assert.throws(() => validateRepo(root), /\$schema/);
  });

  it('rejects manifest and marketplace metadata drift across all checked fields', () => {
    const mutateJson = (root, relPath, mutator) => {
      const full = path.join(root, relPath);
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      mutator(data);
      writeFile(full, JSON.stringify(data, null, 2));
    };

    const cases = [
      ['root name', 'plugin.json', (d) => (d.name = 'other-plugin')],
      ['claude name', '.claude-plugin/plugin.json', (d) => (d.name = 'other-plugin')],
      ['displayName drift', '.claude-plugin/plugin.json', (d) => (d.displayName = 'Wrong Name')],
      ['version drift', '.claude-plugin/plugin.json', (d) => (d.version = '0.2.0')],
      ['description drift', '.claude-plugin/plugin.json', (d) => (d.description = 'Different')],
      ['author.name drift', '.claude-plugin/plugin.json', (d) => (d.author.name = 'other')],
      ['homepage drift', '.claude-plugin/plugin.json', (d) => (d.homepage = 'https://example.com')],
      ['repository drift', 'plugin.json', (d) => (d.repository = 'https://example.com/repo')],
      ['license drift', 'plugin.json', (d) => (d.license = 'Apache-2.0')],
      ['empty keywords', '.claude-plugin/plugin.json', (d) => (d.keywords = [])],
      ['missing documentationUrl', '.claude-plugin/plugin.json', (d) => delete d.documentationUrl],
      ['empty supportUrl', '.claude-plugin/plugin.json', (d) => (d.supportUrl = '  ')],
      ['marketplace name', '.claude-plugin/marketplace.json', (d) => (d.name = 'wrong')],
      ['marketplace owner.name', '.claude-plugin/marketplace.json', (d) => (d.owner.name = 'other')],
      [
        'marketplace plugins[0].name',
        '.claude-plugin/marketplace.json',
        (d) => (d.plugins[0].name = 'other'),
      ],
      [
        'marketplace plugins[0].source',
        '.claude-plugin/marketplace.json',
        (d) => (d.plugins[0].source = './skills'),
      ],
      [
        'marketplace plugins[0].description',
        '.claude-plugin/marketplace.json',
        (d) => (d.plugins[0].description = 'Mismatch'),
      ],
    ];

    for (const [label, relPath, mutator] of cases) {
      const root = createFullValidRepo(makeTempDir());
      mutateJson(root, relPath, mutator);
      assert.throws(() => validateRepo(root), Error, `Expected failure for ${label}`);
    }
  });
});

describe('validate-repo skill structure, frontmatter, boundaries, and contracts', () => {
  it('rejects missing/empty skill directories in strict mode vs allowMissingSkills', () => {
    const noSkillsRoot = makeTempDir('no-skills-');
    createValidManifests(noSkillsRoot);
    assert.throws(() => validateRepo(noSkillsRoot), /Missing required skills directory/);

    const missingOneRoot = createFullValidRepo(makeTempDir());
    fs.rmSync(path.join(missingOneRoot, 'skills', 'to-tickets'), { recursive: true, force: true });
    assert.throws(
      () => validateRepo(missingOneRoot),
      /Missing required skill directory: skills\/to-tickets/,
    );
    // Partial skills pass when allowMissingSkills is true
    assert.equal(validateRepo(missingOneRoot, { allowMissingSkills: true }).ok, true);

    // Empty skill directory fails even when allowMissingSkills is true
    const emptySkillRoot = createFullValidRepo(makeTempDir());
    fs.rmSync(path.join(emptySkillRoot, 'skills', 'handoff', 'SKILL.md'));
    assert.throws(() => validateRepo(emptySkillRoot), /Missing required file handoff\/SKILL\.md/);
    assert.throws(
      () => validateRepo(emptySkillRoot, { allowMissingSkills: true }),
      /Missing required file handoff\/SKILL\.md/,
    );
  });

  it('rejects missing frontmatter fences and invalid required frontmatter keys', () => {
    const badContents = [
      ['missing opening fence', 'name: setup-flow\n---\nbody\n'],
      ['missing closing fence', '---\nname: setup-flow\ndescription: x\nlicense: MIT\ndisable-model-invocation: true\n'],
      ['CRLF missing closing fence', '---\r\nname: setup-flow\r\ndescription: x\r\n'],
      ['name mismatch', '---\nname: wrong-name\ndescription: x\nlicense: MIT\ndisable-model-invocation: true\n---\n'],
      ['license mismatch', '---\nname: setup-flow\ndescription: x\nlicense: Apache-2.0\ndisable-model-invocation: true\n---\n'],
      ['missing description', '---\nname: setup-flow\nlicense: MIT\ndisable-model-invocation: true\n---\n'],
      ['empty description', '---\nname: setup-flow\ndescription: "   "\nlicense: MIT\ndisable-model-invocation: true\n---\n'],
      ['missing disable-model-invocation', '---\nname: setup-flow\ndescription: x\nlicense: MIT\n---\n'],
      ['false disable-model-invocation', '---\nname: setup-flow\ndescription: x\nlicense: MIT\ndisable-model-invocation: false\n---\n'],
    ];

    for (const [label, content] of badContents) {
      const parent = makeTempDir('fm-bad-');
      const skillDir = createValidSkill(parent, 'setup-flow');
      writeFile(path.join(skillDir, 'SKILL.md'), content);
      assert.throws(() => validateSkillDir(skillDir), Error, `Expected failure for ${label}`);
    }
  });

  it('rejects broken ./references/ links in SKILL.md', () => {
    const parent = makeTempDir('broken-ref-');
    const skillDir = createValidSkill(parent, 'triage');
    fs.rmSync(path.join(skillDir, 'references', 'batch-wave.md'));
    assert.throws(() => validateSkillDir(skillDir), /triage\/references\/batch-wave\.md/);
  });

  it('rejects every denylisted planner command in both SKILL.md and references/*.md', () => {
    for (const cmd of DENYLISTED_PLANNER_COMMANDS) {
      const parentSkill = makeTempDir('deny-skill-');
      const skillDir1 = createValidSkill(parentSkill, 'triage');
      fs.appendFileSync(path.join(skillDir1, 'SKILL.md'), `\nRun ${cmd}foo next.\n`);
      assert.throws(
        () => validateSkillDir(skillDir1),
        /Denylisted planner command/,
        `Expected SKILL.md rejection for ${cmd}`,
      );

      const parentRef = makeTempDir('deny-ref-');
      const skillDir2 = createValidSkill(parentRef, 'triage');
      fs.appendFileSync(
        path.join(skillDir2, 'references', 'batch-wave.md'),
        `\nFallback to ${cmd}bar.\n`,
      );
      assert.throws(
        () => validateSkillDir(skillDir2),
        /Denylisted planner command/,
        `Expected references/*.md rejection for ${cmd}`,
      );
    }
  });

  it('rejects forbidden relative paths in both SKILL.md and references/*.md', () => {
    const forbiddenSnippets = [
      'See ../other.md',
      'Run `./scripts/validate-repo.mjs`',
      'Read references/batch-wave.md directly',
      'Execute scripts/helper.mjs',
      '(../parent.md)',
      '"scripts/foo"',
    ];

    for (const snippet of forbiddenSnippets) {
      const p1 = makeTempDir('path-skill-');
      const s1 = createValidSkill(p1, 'triage');
      fs.appendFileSync(path.join(s1, 'SKILL.md'), `\n${snippet}\n`);
      assert.throws(() => validateSkillDir(s1), /Forbidden relative path/, `SKILL.md: ${snippet}`);

      const p2 = makeTempDir('path-ref-');
      const s2 = createValidSkill(p2, 'triage');
      fs.appendFileSync(path.join(s2, 'references', 'batch-wave.md'), `\n${snippet}\n`);
      assert.throws(
        () => validateSkillDir(s2),
        /Forbidden relative path/,
        `references: ${snippet}`,
      );
    }
  });

  it('rejects prescriptive coding and TDD directives in both SKILL.md and references/*.md', () => {
    const directives = [
      'Always write unit tests first before editing.',
      'You must write failing unit test first.',
      'Follow red-green-refactor strictly.',
      'Please run TDD on every ticket.',
      'You should enforce commit style across PRs.',
      'Always format pull request body automatically.',
    ];

    for (const line of directives) {
      const p1 = makeTempDir('tdd-skill-');
      const s1 = createValidSkill(p1, 'triage');
      fs.appendFileSync(path.join(s1, 'SKILL.md'), `\n${line}\n`);
      assert.throws(
        () => validateSkillDir(s1),
        /Prescriptive coding\/TDD directive/,
        `SKILL.md: ${line}`,
      );

      const p2 = makeTempDir('tdd-ref-');
      const s2 = createValidSkill(p2, 'triage');
      fs.appendFileSync(path.join(s2, 'references', 'batch-wave.md'), `\n${line}\n`);
      assert.throws(
        () => validateSkillDir(s2),
        /Prescriptive coding\/TDD directive/,
        `references: ${line}`,
      );
    }
  });

  it('rejects missing cross-skill contract markers across triage, backlog-audit, to-tickets, and handoff', () => {
    const cases = [
      ['triage', '<untrusted_ticket_data>'],
      ['backlog-audit', '<untrusted_ticket_data>'],
      ['to-tickets', '<untrusted_ticket_data>'],
      ['triage', 'STATE_DRIFT'],
      ['backlog-audit', 'STATE_DRIFT'],
      ['triage', 'CIRCUIT_OPEN'],
      ['backlog-audit', 'CIRCUIT_OPEN'],
      ['triage', 'provenance footer'],
      ['backlog-audit', 'provenance footer'],
      ['handoff', 'provenance footer'],
    ];

    for (const [skillName, marker] of cases) {
      // Check via validateSkillDir
      const isolatedParent = makeTempDir(`contract-skill-${skillName}-`);
      const skillDir = createValidSkill(isolatedParent, skillName);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const updated = fs
        .readFileSync(skillMdPath, 'utf8')
        .replaceAll(marker, 'REMOVED_MARKER')
        .replaceAll('<!-- kinasr-skills:', '<!-- removed:')
        .replaceAll('[kinasr-skills:', '[removed:');
      writeFile(skillMdPath, updated);

      assert.throws(
        () => validateSkillDir(skillDir),
        Error,
        `validateSkillDir should fail when ${skillName} lacks ${marker}`,
      );

      // Check via validateRepo
      const repoRoot = createFullValidRepo(makeTempDir(`contract-repo-${skillName}-`));
      writeFile(path.join(repoRoot, 'skills', skillName, 'SKILL.md'), updated);
      assert.throws(
        () => validateRepo(repoRoot),
        Error,
        `validateRepo should fail when ${skillName} lacks ${marker}`,
      );
    }
  });

  it('exits non-zero from CLI on invalid fixture or unknown flag', () => {
    const badRoot = makeTempDir('cli-bad-');
    createValidManifests(badRoot);
    const cliFail = runCli(['--root', badRoot]);
    assert.notEqual(cliFail.status, 0);
    assert.match(cliFail.stderr, /Validation failed:/);

    const cliBadFlag = runCli(['--unknown-flag']);
    assert.notEqual(cliBadFlag.status, 0);
    assert.match(cliBadFlag.stderr, /Unknown CLI argument/);
  });
});
