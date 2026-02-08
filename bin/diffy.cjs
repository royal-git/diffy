#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronMain = path.join(projectRoot, 'electron', 'main.cjs');
const electronBinary = require('electron');
const args = process.argv.slice(2);

let baseRef = null;
let headRef = null;
let pullRequestNumber = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    process.stdout.write(
      [
        'Usage: diffy [options]',
        '',
        'Options:',
        '  -h, --help              Show help',
        '  -b, --branch <ref>      Compare your current branch commits against a ref',
        '  -B, --base <ref>        Base ref for explicit comparison mode',
        '  -H, --head <ref>        Head ref for explicit comparison mode',
        '  --pr <number>           Open a GitHub PR diff in this repo (auto base/head via gh)',
        '',
        'Common usage:',
        '  diffy',
        '    Show local uncommitted changes in your current repo.',
        '',
        '  diffy -b origin/master',
        '    Compare commits on your current branch against origin/master.',
        '',
        '  diffy --pr 123',
        '    Open PR #123 diff in the current project.',
        '',
        '  diffy --base origin/main --head feature/my-branch',
        '    Compare head branch against base branch.',
        '',
        'Examples:',
        '  diffy',
        '  diffy -b origin/feature/calculator',
        '  diffy --base origin/main --head origin/feature/calculator',
        '  diffy --pr 123',
        '',
      ].join('\n')
    );
    process.exit(0);
  }
  if ((arg === '--base' || arg === '-B') && i + 1 < args.length) {
    baseRef = args[++i];
    continue;
  }
  if ((arg === '--head' || arg === '-H') && i + 1 < args.length) {
    headRef = args[++i];
    continue;
  }
  if ((arg === '--branch' || arg === '-b') && i + 1 < args.length) {
    // Convenience: compare current HEAD against the provided branch/ref.
    headRef = args[++i];
    if (!baseRef) baseRef = 'HEAD';
    continue;
  }
  if (arg === '--pr' && i + 1 < args.length) {
    pullRequestNumber = args[++i];
    continue;
  }
}

function log(message) {
  process.stdout.write(`[diffy] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[diffy] error: ${message}\n`);
  process.exit(1);
}

function verifyInsideGitRepo(cwd) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'ignore' });
  } catch {
    fail(`'${cwd}' is not a git repository.`);
  }
}

function runGit(cwd, gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

function verifyRef(cwd, refName, label) {
  if (!refName) return;
  if (refName.includes(':')) {
    fail(
      `${label} '${refName}' looks like a fetch refspec. ` +
      `Use a real ref after fetch, e.g. 'origin/feature/calculator' or 'jim2107054/feature/calculator'.`
    );
  }
  try {
    execFileSync('git', ['rev-parse', '--verify', refName], { cwd, stdio: 'ignore' });
  } catch {
    fail(`${label} ref '${refName}' was not found. Try 'git fetch --all --prune' first.`);
  }
}

function runGhJson(argsForGh) {
  try {
    const output = execFileSync('gh', argsForGh, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return JSON.parse(output);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      fail("GitHub CLI ('gh') is not installed. Install it or use -b/--base/--head.");
    }
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    fail(stderr || 'Failed to query PR metadata from gh.');
  }
}

function resolvePrRefs(cwd, prValue) {
  if (!/^\d+$/.test(prValue || '')) {
    fail(`PR number '${prValue}' is invalid. Expected a numeric value like '--pr 123'.`);
  }

  const pr = runGhJson([
    'pr',
    'view',
    prValue,
    '--json',
    'number,baseRefName,headRefName,headRepository,isCrossRepository',
  ]);

  if (!pr || !pr.baseRefName || !pr.headRefName) {
    fail('PR metadata is incomplete. Could not resolve base/head refs from gh.');
  }

  const prNum = String(pr.number || prValue);
  const headSyntheticRef = `refs/diffy/pr-${prNum}-head`;
  const baseSyntheticRef = `refs/diffy/pr-${prNum}-base`;

  try {
    // GitHub always exposes PR heads under pull/<id>/head on the base repo remote.
    // This works for same-repo and fork PRs without needing fork remotes locally.
    runGit(cwd, ['fetch', '--no-tags', 'origin', `pull/${prNum}/head:${headSyntheticRef}`]);
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    fail(
      stderr ||
      `Failed to fetch PR #${prNum} head from origin. ` +
      `Make sure this repo's 'origin' points to the PR's base repository.`
    );
  }

  let resolvedBaseRef = `origin/${pr.baseRefName}`;
  // If origin/<base> is missing locally, fetch an explicit base snapshot.
  try {
    runGit(cwd, ['rev-parse', '--verify', resolvedBaseRef]);
  } catch {
    try {
      runGit(cwd, ['fetch', '--no-tags', 'origin', `${pr.baseRefName}:${baseSyntheticRef}`]);
      resolvedBaseRef = baseSyntheticRef;
    } catch (error) {
      const stderr = error && error.stderr ? String(error.stderr).trim() : '';
      fail(stderr || `Failed to fetch PR base '${pr.baseRefName}' from origin.`);
    }
  }

  return {
    baseRef: resolvedBaseRef,
    headRef: headSyntheticRef,
    baseLabel: pr.baseRefName,
    headLabel: pr.headRefName,
    isCrossRepository: Boolean(pr.isCrossRepository),
  };
}

verifyInsideGitRepo(process.cwd());

if (pullRequestNumber && (baseRef || headRef)) {
  fail("Do not combine '--pr' with '-b/--branch/--base/--head'. Use one mode at a time.");
}

if (pullRequestNumber) {
  const resolved = resolvePrRefs(process.cwd(), pullRequestNumber);
  baseRef = resolved.baseRef;
  headRef = resolved.headRef;
  log(
    `Loaded PR #${pullRequestNumber} (${resolved.baseLabel}...${resolved.headLabel})` +
    (resolved.isCrossRepository ? ' from fork' : '')
  );
} else {
  verifyRef(process.cwd(), baseRef, 'Base');
  verifyRef(process.cwd(), headRef, 'Head');
}

if (baseRef && headRef) {
  log(`Comparing refs '${baseRef}...${headRef}'`);
} else {
  log('Opening working-tree diff (HEAD vs local changes)');
}

const child = spawn(electronBinary, [electronMain], {
  cwd: projectRoot,
  env: {
    ...process.env,
    DIFFY_REPO_PATH: process.cwd(),
    DIFFY_BASE_REF: baseRef || '',
    DIFFY_HEAD_REF: headRef || '',
  },
  detached: true,
  stdio: 'ignore',
});

child.unref();
