# Technabit foundation implementation plan

Execute inline in this session using the executing-plans workflow.

**Goal:** Establish reviewable conventions and quality checks, then extract router
transport and settings validation while preserving the app's behavior.
**Architecture:** Keep delivery paths and the UI entry in place during this packet.
New UI modules live under `ui/src/`; the entry composes them. Root quality tooling
uses maintained development-only tools.
**Tech stack:** Existing Vue 2/CommonJS, esbuild, Node test runner; root ESLint,
Prettier and dependency-cruiser.
**Spec:** `docs/architecture/technabit-profile.md` and the owner's approved proposal.

## Constraints and review focus

No rendering/CSS, runtime dependency, API, auth policy, or release change. Preserve
missing-metric behavior and operator state. Review cookie renewal/missing tokens,
GET versus POST options, abort propagation, non-JSON errors, and untouched settings
outside UI entry ranges. Tests must exercise these conditions. Root tools must
select untracked/renamed files and reject empty selection and hidden overrides.

## Task 1: Standards and executable quality foundation

- [x] Record upstream research/profile and original source disposition inventory.
- [x] Add root development package, pinned ESLint/Prettier/dependency-cruiser,
      explicit contexts, formatter/editor defaults and resolver-based boundaries.
- [x] Test passing and failing lint/boundary cases, canonical discovery, untracked
      and renamed file discovery, empty/invalid bases and disallowed arguments.
- [x] Add local/CI commands with explicit base; don't call legacy code compliant.

Interfaces: root `npm run quality -- --base <commit>` checks changed files;
`npm run lint` selects all live JS; `npm test` verifies tooling contracts.
Tooling tests may use isolated synthetic directories, never mutate live source.

## Task 2: Router transport and settings validation

- [x] Write adjacent tests for `createRouterApi({fetch, getCookie})` returning
      `(signal, body, query = '') => Promise<payload>` and
      `validateSettings(form, initial = {}) => fieldErrors`; observe missing-module RED.
- [x] Move existing request/validation behavior to
      `ui/src/infrastructure/router-api.js` and
      `ui/src/features/settings/settings-validation.js`.
- [x] Bind browser dependencies in the existing entry so VM integration tests still
      exercise the same environment and lifecycle. Leave state/rendering in place.
- [x] Include adjacent tests in the existing npm test discovery; run the full UI
      suite and strict changed-file checks.

## Task 3: Integration and completion

- [x] Run quality/tooling tests, Python integration, UI tests/build and IPK build.
- [x] Verify unchanged CSS and no new runtime/package dependencies; record results
      and remaining work. Request a fresh review of this packet, fix important findings.
- [ ] Commit and push the review branch, verify remote SHA and clean worktree.
      Do not merge or release.

## Execution ledger

Pre-flight: quality and extraction share the root file selector and UI test
command; adjacent tests must be included explicitly. No interface conflict.
Ruling: keep the current UI entry path for this packet to preserve build/test
consumers; full src entry/component moves remain next. Cost if wrong: the flat
entry remains temporarily, but no undocumented install-path migration occurs.

Task 1: complete — root discovery, formatter/lint and resolver negative controls
verified. Task 2: complete — extraction RED→GREEN, UI 58/58, differential validation
and unchanged rendering AST evidence. Task 3: review/fix/verification complete —
Python 106/106, UI 58/58, tooling 10/10, IPKs built; publication is the final step.
Final: fixed nested lint/format overrides and inline formatter suppression — actual
checker regressions RED→GREEN; root suite 10/10.
