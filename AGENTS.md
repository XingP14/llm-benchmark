# LLM Benchmark Agent Instructions

This repository is maintained by automated and human agents. Before making any
change, read this file and `docs/PROJECT-GOVERNANCE.md`.

## Non-Negotiable Rules

1. Keep `master` releasable. If GitHub Actions, `npm run build`, or the targeted
   Jest suite is red, stop feature work and fix the failure first.
2. Do real benchmark/runtime work before roadmap or market-research work. Pure
   roadmap commits are allowed only when they are tied to a concrete next code,
   test, CI, package, or release task.
3. Never commit secrets or private benchmark configs. Do not commit `config.json`,
   `config-*.json`, `.env*`, `.npmrc`, runtime databases, or local result files.
4. Keep commits small and searchable. Use concise Conventional Commit subjects;
   put long evidence in the commit body or docs, not in the subject.
5. Preserve user work. Do not reset, force-push, rebase, or delete local state
   unless the maintainer explicitly asked for that action.

## Required Work Loop

1. Check state:
   - `git status --short --branch`
   - `git log --oneline --decorate -n 8`
   - current CI state for `XingP14/llm-benchmark`
2. Pick work from this priority order:
   - failing CI or release blocker
   - security issue
   - runtime/package bug
   - test gap for existing behavior
   - documentation drift that affects install, API, Docker, or publishing
   - roadmap/spec grooming
3. Before committing, run the narrowest relevant verification from
   `docs/PROJECT-GOVERNANCE.md`.
4. Run the local watchdog gate when available:
   - `/usr/local/bin/heartbeat-watchdog.sh check llm-benchmark "<commit subject>"`
5. Commit only after recording verification evidence. If verification cannot run,
   write down the blocker in the commit body or `docs/ci-failures.md`.

## Project-Specific Guardrails

- The canonical governance document is `docs/PROJECT-GOVERNANCE.md`.
- `ROADMAP.md` is useful for planning but contains a long automated history. Do
  not treat every old roadmap note as current product scope.
- `docs/TESTING_STANDARD.md` contains testing policy, but some coverage numbers
  are stale; verify with fresh commands before relying on them.
- Runtime output belongs outside source control: `coverage/`, `data/`, `dist/`,
  `memory/`, `results/`, `test-data/`, `node_modules/`, and local config files
  are ignored on purpose.
- Do not publish npm, Docker, or GitHub releases manually unless the release
  checklist passes and the maintainer explicitly approves.
