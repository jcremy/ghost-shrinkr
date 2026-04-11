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
