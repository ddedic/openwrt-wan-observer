# UI final completion — 12 November 2026

Source baseline: `725a94dabd067948983b35cc0c969b48c38399ec`.
Scope: UI JavaScript ownership/readability only; CSS, HTML, rendering and behavior
remain frozen. Measurements own the stable report-data public interface; the app
continues owning reactive state and lifetimes. Affected checks: root ESLint and
Prettier, UI integration/measurement suites, strict baseline VNode hashes, package
build and coordinator-owned full integration/boundary checks.

## Focused research before implementation

- ECMAScript export/re-export contract:
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export>.
  Explicit named re-exports preserve bindings without a compatibility wrapper.
- Existing esbuild bundling/tree shaking API:
  <https://esbuild.github.io/api/#tree-shaking>. Retain installed 0.28.2 and static
  ES module imports; release still emits its existing browser CommonJS bundle.
- Technabit upstream revision remains the coordinator-checked
  `300f61d8bed25f403824ddbbeced633b4bc7804c`. Its GitHub document URL returned 404
  during this focused check; locally installed accepted rules/profile were read.

Decision: adapt existing pure report algorithms into named responsibility modules
and keep explicit public exports from measurements/report-data.js. No new library
is needed for project-specific attempt reconciliation, usage accounting or CSV
contracts. Existing Vue 2 host and esbuild/jsPDF versions, licenses, runtime size
constraints and router dependencies remain unchanged. No kernel/hardware feature
is introduced. Real browser/firmware compatibility remains untested here.

Implementation clarification: the actual measurement contract is CommonJS, not ES
modules. Preserve explicit `module.exports` and `require` bindings for existing
Node consumers and esbuild; no module-system conversion is part of this work.
Serena cannot parse these JavaScript files because its active language is Python.
AST-assisted native source editing is used for this language-specific limitation.

## Ownership and execution

The stable `src/measurements/report-data.js` explicitly exports its original 18
bindings. Actual algorithms now live in `attempt-reconciliation.js` (durable ID,
legacy matching, interrupted/storage reconciliation), `report-timeline.js` (period,
coverage, incidents and calendar), `speed-series.js` (fixed-grid chart samples),
`measurement-statistics.js` (quantiles), `data-usage.js` (estimated/measured transfer),
`csv-export.js` (column serialization), `report-format.js` (time/speed formatting)
and `report-status.js` (status ordering, labels and observed failure messages).
No empty module, wildcard export, new dependency or alternate implementation was
added. The temporary root report-data bridge was removed after the Python CGI
consumer moved to the stable source interface; no remaining tracked code consumes
that removed path. The coordinator owns the Python edit.

Pinned lint fixes add required braces, declaration/return and import spacing,
and import groups while preserving relative initialization order. Nested branches
now use guard returns and named local responsibilities invoked at their original
evaluation sites. Callback-bound parameters are explicit. Early verification
caught missing helper parameters in readiness/history/fixture branches; corrected
them before final proof, retaining the failed run in local evidence. Assertions,
expected hashes and existing test cases were not weakened or regenerated.

## Verification and evidence

Local evidence directory: `.local/technabit-completion/` (ignored development
artifacts, not release content).

- New public-boundary/reconciliation tests first failed because the intended owner
  modules did not exist (`ui-boundary-red.txt`). After extraction, UI **79/79**
  pass: all 77 retained tests, including 14 strict native/plain VNode hashes, plus
  two public-contract/storage-reconciliation tests (`ui-tests-final.txt`).
- Baseline `725a94d` versus new ownership: **288 deterministic payload/period
  cases** compare complete reports, exact CSV, both chart series, matching attempts,
  measured usage and estimates. Includes durable/invalid/legacy IDs, duplicate
  events, busy/pending failures, unknown codes, storage failures, unknown metrics
  and retention/coverage combinations (`ui-report-equivalence-final.txt`).
- Root-pinned ESLint passes all owned UI JavaScript without suppression/overrides
  (`ui-lint-final-check.txt`); pinned Prettier passes the same nonempty selection
  (`ui-format-check.txt`). `git diff --check` passes.
- Dependency-cruiser: **68 modules, 122 dependencies, zero violations**
  (`ui-boundaries-final.txt`). Coordinator repeats full repository graph/checks.
- Release UI build passes: **877.7 KiB** minified browser bundle plus existing
  **9.3 KiB** legal notices (`ui-build-final.txt`). No runtime dependency changes.
- Exact `view.css` and rendering-hash fixture bytes match source baseline.

Limits: synthetic VNode/Node/bundle proof is not real Vue DOM, browser, GL.iNet or
firmware execution. No design, live router operation, commit, push or deployment
was performed by this packet. Coordinator owns final review, Python/package replay,
full repository checks and publication. UI paths freeze after this handoff.

Supplemental module-contract verification used the official Node CommonJS module
API: <https://nodejs.org/api/modules.html#moduleexports>. The version-specific
Node 24 docs URL was inaccessible through the research browser; the unchanged
`require`/`module.exports` contract was also exercised on the installed project
Node runtime. This does not claim newer Node-only APIs are usable on routers.
