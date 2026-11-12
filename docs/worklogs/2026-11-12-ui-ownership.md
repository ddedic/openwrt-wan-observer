# UI ownership extraction — 12 November 2026

Baseline: `d8bcf8ef53eff7eea1eb9c2ad6e3a1a47dbc781c`; foundation CI passed:
<https://github.com/ddedic/openwrt-wan-observer/actions/runs/43205418860>.
Owner authorization: proceed with the next UI component/workflow restructuring.
Technabit upstream checked unchanged at `300f61d8bed25f403824ddbbeced633b4bc7804c`.

## Focused external research before implementation

- Vue 2 render functions and functional rendering:
  <https://v2.vuejs.org/v2/guide/render-function.html>.
  Reuse the host's existing render-function contract. Named stateless view
  functions return VNodes using the page's original `h`; do not insert component
  instances or wrappers that could change refs, focus or native host selection.
- Vue 2 option/method composition: <https://v2.vuejs.org/v2/api/#mixins>.
  Adapt existing methods into explicit workflow factories and spread their named
  methods into one page. Avoid implicit mixin hook merging/collisions. Reactive
  state, lifecycle hooks, abort ownership and DOM refs stay on that page.
- esbuild bundling/API: <https://esbuild.github.io/api/#bundle> and
  <https://esbuild.github.io/api/#external>. Reuse installed esbuild 0.28.2 to
  evaluate the complete modular application in existing test VM environments;
  leave jsPDF external only in the synthetic harness so its Node-compatible
  initialization stays identical to the former tests. Release builds keep bundling it.
- Technabit portable core/frontend ownership, pinned source:
  <https://github.com/technabit/technabit-skills/blob/300f61d8bed25f403824ddbbeced633b4bc7804c/docs/frontend-conventions.md>.

Reuse/adapt decision: no new library, framework, renderer, CSS or runtime upgrade.
Vue 2 is a host compatibility constraint (its EOL is acknowledged); adopting Vue 3
or a new state library would alter the SDK integration rather than solve the
ownership problem. These adaptations have no new licensing/kernel/hardware
requirements. Existing Vue/esbuild licenses/notices remain unchanged. Browser and
real-firmware compatibility beyond existing evidence remains untested.

## Intended ownership

- Tiny root SDK entry; `src/app/` owns the page, lifecycle/dialog control and metadata.
- History reads, manual speed-test polling, settings and exports each own workflow
  modules. Their factories take the request function; Vue still binds methods to
  the existing page state. No workflow owns a new global store.
- Settings/export dialog views, current status, history, header/footer and chart
  rendering own named files with deliberate data/callback contracts. Render helpers
  use the parent's `h` to preserve VNode context, refs and native/plain behavior.
- Shared measurement/report models and time interpretation are narrow actual
  multi-consumer modules. Chart geometry is independent of VNode rendering.
- Existing Python CGI tests directly consume root `ui/report-data.js`; preserve
  this compatibility entry with explicit exports until the Python packet can move
  that consumer. Do not change Python merely to hide a retained path.
- Integration harness/fixtures stay under `ui/tests/` outside production sources.

## Verification plan

Retain all existing behavior assertions and add module/renderer characterization.
Compare synthetic VNode contracts before/after across native/plain, loading/error,
setup, settings/export and recorded/empty states. Test real dialog callbacks,
focus/ref behavior, workflow cancellation/deduplication via existing assertions.
Prove test-import boundary rules with positive/negative fixtures; a suspicious
escaped test-path pattern in the original boundary configuration is investigated
with a failing regression before changing it. Record actual results below.

## Execution evidence and decisions

- Assembly contract initially failed because the new modules did not exist (RED).
  After extraction, named method groups compose without collisions and independent
  `data()` results do not share reactive objects (GREEN).
- All 14 pre-extraction native/plain synthetic VNode contracts still match. Four
  additional action tests drive settings edits/blur/discard, export appendix/Escape,
  focus trapping and repeated history expand/filter callbacks on the owning page.
- Initial checks caught missing imports and remaining moved test paths; corrected
  actual consumers without removing assertions. One action test used the wrong
  filter label; matched the existing `Slow and failed only` copy instead.
- Direct matching disproved the suspected test-path regex defect. New failing
  resolver controls proved missing nested integration-helper, feature-to-app and
  cross-feature guards. Added those rules; the negative controls now reject them.
- Ruling: history owns the charts because its selected period owns their data.
  Cost: future shared consumers need a deliberate contract, not a private import.
- Ruling: keep `view.css` at its original path and exact bytes. Moving/formatting it
  initially caused source-selector assertions to fail; restored original bytes
  rather than weakening assertions. Cost: a deliberate root stylesheet remains
  until a style move has its own rendered evidence.
- Views receive explicit callbacks for page flags, preserving repeated calls
  without re-rendering. Settings retains its own reactive form object. No extra
  Vue instance, global store or wrapper DOM was introduced.
- Report/time ASTs and all chart-geometry function ASTs match baseline (excluding
  positions/raw literals). CSS, CLI/jq/CGI, UI lockfile and runtime dependencies are
  unchanged. Existing Python report-data consumer retains an explicit entry.
- UI: 77 tests pass (58 retained + 14 rendering + one assembly + four actions).
  Tooling: 10 pass, including expanded resolver controls. Strict changed-file
  lint/format/boundaries pass: 74 graph modules, zero violations.
- Local IPKs, unchanged 0.5.3-1 version: core 14,636 bytes; admin 288,496 bytes
  (2,008 bytes larger). Browser bundle 876.4 KiB. No new router library/dependency,
  kernel requirement or deployment. Real firmware/browser proof remains untested.

## Integration and final review

Python integration passed 106/106 with the project's existing local Lua 5.1/cjson
runtime. All 12 workflow method ASTs and page name/data/computed/lifecycle ASTs
independently match baseline. No test assertions were dropped: review compared
all 49 legacy test bodies and found only module/CSS path updates.

Fresh review of `d8bcf8e..72c1b9a` independently passed UI 77/77, tooling 10/10,
strict quality (47 changed JS files, 74 graph modules), all 14 baseline VNode hashes,
PDF AST and exact CSS parity. Its in-memory release build confirmed jsPDF bundled,
no test/fixture/preview inputs, and exactly one version marker. Explicit completion
handoff was delivered through the native parent channel.

The reviewer identified one dropped public-site exclusion while the production
boundary rule was expanded. Although graded Minor because no live source used that
edge, the coordinator treated it as an Important regression of an existing
ownership contract. Added a real resolver control, observed RED, restored `^site/`,
then GREEN: tooling 10/10, UI 77/77, strict quality zero violations. No remaining
reported findings. No second review substitutes for that regression proof.

Evidence limits: no real Vue/native DOM, browser or firmware execution; JSDoc is
not static type checking. Reviewer did not independently repeat Python/IPKs, but
coordinator results above bind to the same runtime source; only boundary tooling
and documentation changed afterward. CGI/non-JS semantic auditing remains outside
this UI packet. No universal compatibility or whole-repository compliance claim.

Publication follows the reviewed source/fix commit on the existing review branch;
no merge, deployment or release. Final remote identity is checked by coordinator.
