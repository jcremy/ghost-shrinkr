# Project guidelines for Claude

## Commit messages

All commit messages must use Conventional Commits prefixes:

- `feat:` — a new feature
- `fix:` — a bug fix
- `docs:` — documentation only changes
- `style:` — formatting, whitespace, missing semicolons; no code logic change
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `perf:` — performance improvement
- `test:` — adding or fixing tests
- `chore:` — build process, tooling, dependencies, misc. housekeeping
- `build:` — changes that affect the build system
- `ci:` — changes to CI configuration files and scripts

Format:

```
<type>: <short imperative summary>

<optional longer body explaining the why>
```

Keep the summary under ~72 characters, imperative mood ("add X", not "added X" or "adds X"). Use the body for context, not the title.

## Plan files

Plan files live in `docs/plans/` and must be prefixed with today's date in `YYYYMMDD-` format, followed by a short slug:

```
docs/plans/20260411-alpine-migration.md
docs/plans/20260502-offline-support.md
```

This keeps plans chronologically sortable and makes it obvious when each one was drafted. Never omit the prefix, even for a quick sketch.

## Messaging: durability and waste

When writing about file bloat, digital waste, or the "why" of this project (README, PRD, landing copy, etc.), follow these rules. They are load-bearing and were set after an explicit correction — drifting back into the old style is a regression, not a judgement call.

**Blame systems and defaults, never users.** The 3 MB receipt photo is what phones produce because they default to max resolution. The 20 MB PDF is what scanners ship when nothing in their setup asks "what is this for?". The waste is a failure of defaults and affordances, not a failure of the people forwarding the files. Say so.

**Banned vocabulary when contrasting the tool with users.** Do not use any of these to imply that the user is doing something wrong:

- "attention", "attentive", "pay attention"
- "deliberate", "thoughtful", "careful", "care"
- "second thought", "without thinking"
- "pleasure", "laziness", "disengagement", "indifference"
- "moment of attention", "worth taking", "worth noticing"

Every one of those words quietly says "we noticed, they didn't." They are disqualified regardless of how softly they're phrased.

**Preferred vocabulary.** Describe the system, not the person:

- "invisible by default"
- "nothing in the chain surfaces the cost"
- "the defaults ship big files because nothing forces them to ship small ones"
- "no affordance for checking"
- "the missing affordance"
- "a place to see the file, see the size, and decide"
- "surface what defaults hide"

**The tool's role.** GhostShrinkr's job is to show the file and its size so the user can decide. Not to grade behaviour, not to teach a lesson, not to imply that other choices were wrong. "Show, not grade" is the rule.

**If you feel tempted to write a sentence like "X is worth doing because attention is worth having" — stop.** Rewrite as a system observation: "X is missing from the default tooling and this adds it." Same substance, no judgement.

## Releases (macOS .dmg via Tauri + GitHub Actions)

Release procedure for tagging a new version. Follow in order — the CHANGELOG step in particular must happen *before* the tag, because the generated GitHub Release body links to `CHANGELOG.md` on `main`.

### 1. Pick the version (semver)

- **Major (`vX.0.0`)** — breaking behavior change for existing users (removed feature, changed default that produces visibly different output, etc.). Rare.
- **Minor (`vX.Y.0`)** — new user-visible feature, backward compatible.
- **Patch (`vX.Y.Z`)** — bug fix, CI change, packaging fix, internal refactor. No visible behavior change.

Default assumption: most releases are patches. Do not bump major out of enthusiasm.

### 2. Update `CHANGELOG.md` before tagging

Add a new section at the top:

```md
## [vX.Y.Z] — YYYY-MM-DD

### Added / Changed / Fixed / Removed

- bullet point per change
```

Use only the subsections that apply. Write from the user's perspective, not the developer's (say "Mac app no longer shows 'damaged' on first launch", not "Added ad-hoc signing to CI workflow").

### 3. Commit the CHANGELOG (and any other release-prep changes)

- Stage the CHANGELOG and any code that's part of this release by **explicit path**. Never `git add -A` (user rule — see `feedback_git_staging.md`).
- Commit message: use `docs:` prefix for CHANGELOG-only commits, or match the prefix of the substantive change if bundling.

### 4. Tag and push

```bash
git push               # make sure main is up to date on origin
git tag vX.Y.Z
git push --tags
```

Do not use annotated tags (`-a`) unless the user specifically wants them — lightweight tags are simpler and the GitHub Release carries the notes anyway.

### 5. What the workflow does automatically on tag push

`.github/workflows/build-macos.yml` fires on `v*` tags and:

1. Syncs the version from the git tag into `Cargo.toml` + `tauri.conf.json` in the runner workspace only (repo files are not modified).
2. Rasterizes `macos/src-tauri/icons/app-icon.svg` into the PNGs + `.icns` that Tauri expects, via `rsvg-convert` + `sips` + `iconutil`.
3. Installs Rust stable via `dtolnay/rust-toolchain@stable`.
4. Runs `tauri-apps/tauri-action@v0` which builds the `.app` and `.dmg`. Ad-hoc signing (`"signingIdentity": "-"` in `tauri.conf.json`) means the `.app` inside the `.dmg` is signed during bundling — NOT post-hoc, which would be ineffective.
5. Creates a **public** GitHub Release with the `.dmg` attached. The release body links to `CHANGELOG.md` for full notes.
6. Also uploads the `.dmg` as a CI artifact (fallback for `workflow_dispatch` runs that don't create releases).

### 6. Verify

After ~4 minutes:

```bash
gh run list --workflow=build-macos.yml --limit 1   # confirm success
gh release view vX.Y.Z                              # confirm release published
```

Open https://github.com/jcremy/ghost-shrinkr/releases/latest and confirm the `.dmg` is attached. The web app's footer "Mac app" link auto-resolves to this URL — no update needed.

Optional smoke test: download the `.dmg`, mount, launch. First launch requires right-click > Open (ad-hoc signed, not notarized — this is expected without an Apple Developer account).

### 7. `workflow_dispatch` (manual trigger, no tag)

```bash
gh workflow run build-macos.yml
```

Does NOT create a release. Skips the version sync (uses whatever version is hardcoded in the repo files). Only uploads a CI artifact. Useful for testing the pipeline without publishing.

### Gotchas

- **Repo `Cargo.toml` and `tauri.conf.json` always sit at version "1.0.0"** (or whatever baseline). The git tag is the source of truth; the files are only bumped at build time inside the runner. Do not "keep them in sync with the tag" in commits — that defeats the automation.
- **`workflow_dispatch` builds the baseline version** (currently `1.0.0`). If that's wrong, tag a real release instead of manually dispatching.
- **CHANGELOG must be pushed before tagging.** If you tag first, the Release body links to a changelog that doesn't mention this version. Order: CHANGELOG commit → push main → tag → push tags.
- **Never re-use a tag.** If a build fails mid-release, delete the tag (`git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`), fix the problem, re-tag, push. Do not force-push an existing tag — downstream caches (Homebrew, direct downloaders) can serve the old artifact.
- **Web version updates independently.** Pushing to `main` redeploys the web app via `.github/workflows/deploy.yml`. The macOS build only runs on tags. Don't couple them in your head — a `main` push can go out without creating a native release.
