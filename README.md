# Diffy

Desktop git diff viewer you run from terminal.

## Prerequisites

- macOS
- `git`
- Node.js + npm
- Optional: GitHub CLI `gh` (only needed for `diffy --pr <number>`)

## Install (from GitHub)

### Option 1: Global install from GitHub (best for normal use)

```bash
npm i -g github:<owner>/<repo>
diffy --help
```

### Option 2: Run directly with `npx` (no install)

```bash
npx github:<owner>/<repo> --help
```

### Option 3: Clone + link (best for development)

```bash
git clone https://github.com/<owner>/<repo>.git
cd diffy
npm install
npm link
diffy --help
```

## Which method should I use?

- Use `npm i -g github:<owner>/<repo>` if you just want to use Diffy.
- Use `npm link` only if you plan to edit/contribute code.

## New Machine Quick Start

On a new machine, this is the easiest path:

```bash
npm i -g github:<owner>/<repo>
diffy --help
```

Then run `diffy` inside any git repository.

## Usage

Run inside a git repository:

```bash
diffy
```

Compare current branch commits against a ref:

```bash
diffy -b origin/master
```

Explicit base/head comparison:

```bash
diffy --base origin/main --head origin/feature/my-branch
```

Open a GitHub pull request diff (uses `gh`):

```bash
diffy --pr 123
```

## Notes

- `diffy` shows local uncommitted changes, including untracked files.
- `diffy -b <ref>` compares your current branch commits against `<ref>`.
- `diffy --pr <number>` requires GitHub CLI (`gh`) and a repo whose `origin` points to the PR base repository.
