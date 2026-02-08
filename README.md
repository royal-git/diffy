# Diffy

Terminal-first desktop Git diff viewer.

Open from any repo with one command and review changes in a side-by-side UI.

## Screenshot

![Diffy UI](docs/screenshot.png)

## Highlights

- Side-by-side and unified diff views
- Word wrap toggle
- Search + next/previous match navigation
- Chunk-level accept/reject tracking
- Theme presets (persisted)
- Git ref and PR compare modes from terminal

## Requirements

- macOS
- `git`
- Node.js + npm
- Optional: GitHub CLI `gh` (only for `diffy --pr <number>`)

## Install From GitHub

### Global install (recommended)

```bash
npm i -g github:<owner>/<repo>
diffy --help
```

### Run without install

```bash
npx github:<owner>/<repo> --help
```

### Dev mode (clone + link)

```bash
git clone https://github.com/<owner>/<repo>.git
cd diffy
npm install
npm link
diffy --help
```

## Quick Start

Run inside any Git repository:

```bash
diffy
```

## CLI Usage

Show local changes (tracked + untracked):

```bash
diffy
```

Compare current branch commits against a ref:

```bash
diffy -b origin/master
```

Explicit base/head compare:

```bash
diffy --base origin/main --head origin/feature/my-branch
```

Open a PR diff in the current project:

```bash
diffy --pr 123
```

## Behavior Notes

- `diffy` includes untracked files.
- `diffy -b <ref>` compares branch commits (not unstaged edits).
- `diffy --pr <number>` resolves base/head from `gh` and fetches PR refs.
