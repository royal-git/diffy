# Diffy

Terminal-first desktop Git diff viewer for macOS.

Run `diffy` from any repository and review file changes in a desktop UI.

## Screenshot

![Diffy UI](docs/screenshot.jpg)

## Highlights

- Side-by-side and unified diff views
- Markdown preview for README/`.md` files
- Image preview (current + base when available)
- Word wrap toggle
- Search with next/previous navigation
- Chunk-level accept/reject tracking
- Persisted theme presets
- Git ref and PR compare modes from terminal

## Requirements

- macOS
- `git`
- Optional: GitHub CLI `gh` (only for `diffy --pr <number>`)

## Install (Users)

### 1. Install the app

- Download the latest `Diffy.dmg` release artifact.
- Open the DMG and drag `Diffy.app` into `Applications`.
- Launch `Diffy.app` once from `Applications` (macOS trust prompt).

### 2. Install terminal command

```bash
npm i -g github:royal-git/diffy
```

Now you can run:

```bash
diffy --help
```

## Install (Developers)

```bash
git clone https://github.com/royal-git/diffy.git
cd diffy
npm install
npm link
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

## Launch Behavior

- `diffy` prefers launching installed `Diffy.app` (production path).
- If no installed app is found, it falls back to local Electron runtime in a dev checkout.

## Build Release App (Maintainers)

```bash
npm run desktop:build
```

Artifacts are generated in `dist/` (including DMG/app outputs).
