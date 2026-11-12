# Technabit foundation — 12 November 2026

Source baseline: `d2a10426f55aa6e5c01bb0fb2392b41de69b46a3`.
Scope: conventions and JavaScript quality foundation; extract the existing router
request function and settings validator without changing rendering or behavior.

## External research and reuse decision (before implementation)

- Technabit upstream checked at `300f61d8bed25f403824ddbbeced633b4bc7804c`:
  <https://github.com/technabit/technabit-skills/blob/300f61d8bed25f403824ddbbeced633b4bc7804c/docs/project-profiles.md>
  and its common/frontend/backend rules. Adapt the portable core to OpenWrt;
  no framework, runtime or styling conversion.
- ESLint flat config and Node API:
  <https://eslint.org/docs/latest/use/configure/configuration-files> and
  <https://eslint.org/docs/latest/integrate/nodejs-api>. Reuse recommended rules
  with explicit CommonJS/browser/Node contexts and no inline configuration.
- Prettier install/API: <https://prettier.io/docs/install> and
  <https://prettier.io/docs/api>. Reuse exact pinned formatting, not a custom engine.
- Dependency-cruiser rules/API:
  <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>
  and <https://github.com/sverweij/dependency-cruiser/blob/main/doc/api.md>.
  Reuse resolved dependency graphs for boundaries; string-only import greps cannot
  reliably catch normalized relative paths and re-exports.
- Existing esbuild bundling: <https://esbuild.github.io/api/#bundle>. Retain the
  current bundler and output format. No additional router framework is needed.
- Ruff configuration: <https://docs.astral.sh/ruff/configuration/>. Suitable
  candidate for the Python packet, but not adopted or required by this JS packet.

Registry metadata checked on 12 November: ESLint 10.14.0, @eslint/js 10.0.1,
Prettier 3.10.1, dependency-cruiser 18.7.2, globals 17.14.0. All are MIT and
compatible with the local Node 24.20.0. They run only on development/CI hosts;
no router RAM, kernel, package or runtime footprint is added. Actual installation,
checks and bundle/package results are recorded below, not inferred from metadata.

Custom code is limited to project-owned Git file selection and composing the
upstream APIs: the tools do not supply this repository's explicit-base,
untracked-file and cross-language inventory policy as one command.

## Plan and evidence

See [implementation plan](../superpowers/plans/2026-11-12-technabit-foundation.md).
Baseline UI suite: 49 tests passed. Python baseline and final checks: pending.

## Decisions and verification record

- Task 1: profile, 35-file original source inventory (with baseline SHA-256), root
  development tooling, editor defaults and CI quality job implemented. JavaScript
  lint selects all live JS/CJS/MJS, including legacy tests and preview/tooling.
- Tooling negative controls initially failed on a wrong dependency-cruiser CLI
  filename and an assumed nonzero JSON-reporter exit. Corrected after inspecting
  the installed binary/API: JSON output carries `summary.advisedExitCode`; the
  project checker explicitly rejects reported violations rather than relying on
  the raw CLI status. Removed an overly narrow graph inclusion filter so imports
  into root `tests/` and `site/` cannot disappear from boundary evaluation.
- Strict changed-file checking first failed for existing formatting and unused
  bindings. Removed unused catch bindings in the entry/time model, an unused test
  destructuring binding and documented the preview's intentional storage fallback.
  Only changed files were formatted. The resulting large entry diff reflects
  expansion of previously compressed code, not component/rendering redesign.
- Ruling: JavaScript rules land first; Python/Lua/shell/jq semantic checks remain
  explicit pending packets. This avoids an unrelated runtime/tool migration; the
  cost is that those languages cannot yet claim complete Technabit enforcement.
- Dependency research follow-up: ESLint 10's minimatch 10 dependency is reported by
  <https://github.com/advisories/GHSA-g3hv-75wg-m249>. ESLint 9.39.5 installed cleanly
  but reported unsupported status, so it was not retained. Inspected upstream
  <https://github.com/isaacs/minimatch/blob/v11.0.1/changelog.md> and ESLint/config-array
  call sites: their matching APIs do not use the removed v11 APIs. Pin scoped npm
  overrides to minimatch 11.0.8 for these two consumers, not the router UI.
  MIT tooling plus the transitive BlueOak-1.0.0 minimatch license are development-only.
  Actual discovery, matching and rejection controls pass with the override;
  root `npm audit --audit-level=moderate` reports zero vulnerabilities.
- Task 2 RED: both new adjacent test files failed with missing-module errors before
  extraction. Initial integration run caught one remaining `validate` call in Save;
  corrected it to `validateSettings`. Final UI suite: 58/58 passing (49 retained,
  nine new tests). No test was removed.
- Dashboard `render` and `renderDialog` ASTs match baseline after removing source
  position/raw-literal metadata. Settings validation matches the baseline for
  1,000 deterministic combinations including absent/invalid values and CLI budgets.
- CSS, chart/PDF/report-model source, router CLI/jq and CGI files are byte-unchanged
  (`git diff --exit-code` against baseline for those paths). No real-browser or
  real-firmware test was performed; AST and synthetic tests are bounded evidence.
- The default system Lua is 5.5 without matching cjson. The first Python baseline
  failed at that prerequisite (93 tests, one setup error). Reused this project's
  existing local Lua 5.1.5/cjson.safe test runtime via per-command PATH/LUA_CPATH;
  no global installation or auth changes. Final Python suite: 106 tests passed.
- Both IPKs rebuilt with the existing 0.5.3-1 package version for local validation;
  not a release. Sizes: core 14,636 bytes; admin 286,488 bytes. Root quality tools
  are not included by the package manifests. No router dependency was added.

## Final review and fix pass

Review of `d2a1042..fe0e1fc` found no runtime/rendering regression and two Important
quality-enforcement bypasses: nested ESLint configuration and inline formatter
suppression. The review explicitly reported completion through the native parent
channel. Evidence: coordinator review transcript, plus executable regression tests.

Both bypasses were reproduced by actual-checker tests in disposable repositories
before the fix (RED). A third test confirmed equivalent nested Prettier configuration
could weaken formatting. The checker now pins the root ESLint config and root
Prettier options; the built-in ESLint comment rule rejects JavaScript formatter
suppression. All three negative controls now fail as intended (GREEN), and a valid
actual-checker fixture passes. Final root suite: 10/10; full/changed JavaScript lint
and resolved graph pass, with 36 modules and zero boundary violations. No second
review was used to replace regression proof. No remaining reported findings/minors.

Review limitations reconciled: real browser/firmware and universal compatibility
are unproven; non-JS semantic lint remains planned; unrelated historical security
paths were not audited; supplier compatibility proof covers pinned current callers,
not all future minimatch APIs/patterns. These are limits of this packet's proof,
not claims of product-wide compliance. Future packets must recheck affected inputs.

Reproducible `npm ci` completed with zero audit vulnerabilities. Shell/Lua5.1 syntax
checks pass. Workflow parsed with Ruby's standard YAML parser after a Node YAML
module was unavailable; no parser dependency was added. Runtime source remains the
same as the 58-test UI/106-test Python/build checkpoint above.

## Publication receipt

Published `codex/technabit-foundation` to `origin` with source/fix commit
`a89c5df29d9030d47b6aedcae0cd7be372ae3d32`; `git ls-remote` matched local HEAD.
The working tree was clean. This receipt/checklist completion is a documentation-only
follow-up; its remote synchronization is verified in the coordinator transcript.
Main remains unchanged. No release, deploy or router operation was performed.

Next packet: page/workflow/component ownership extraction, then CGI boundaries and
non-JavaScript semantic quality tools, with focused research/checks before each.
