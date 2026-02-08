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
- Node.js + npm
- Optional: GitHub CLI `gh` (only for `diffy --pr <number>`)

## Dev Setup (Recommended)

### 1. Clone and install dependencies

```bash
git clone https://github.com/royal-git/diffy.git
cd diffy
npm install
```

### 2. Install terminal command from local checkout

```bash
npm i -g .
rehash
diffy --help
```

### 3. Build desktop app (prod-like)

```bash
npm run desktop:build
```

### 4. Install app bundle

- Open generated DMG in `dist/`
- Drag `Diffy.app` to `Applications`
- Launch once from `Applications` (macOS security prompt)

### 5. Use from terminal in any repo

```bash
cd /path/to/any/git/repo
diffy
```

## Daily Workflows

### Dev hot reload

```bash
npm run desktop:dev
```

### Rebuild production app after changes

```bash
npm run desktop:build
```

### Reinstall CLI after changing `bin/diffy.cjs`

```bash
npm i -g .
rehash
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

## Troubleshooting

### `diffy: command not found`

```bash
npm i -g .
rehash
which diffy
```

### macOS "cannot verify app" (unsigned beta)

```bash
xattr -dr com.apple.quarantine /Applications/Diffy.app
open /Applications/Diffy.app
```
