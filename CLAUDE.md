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
