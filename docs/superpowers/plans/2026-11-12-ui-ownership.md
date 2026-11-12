# UI ownership implementation plan

Execute inline; preserve the approved presentation and behavior.
**Goal:** Turn the flat UI source into owned page, feature, workflow and rendering
modules without changing the SDK export, interactions, CSS or router API.
**Spec:** `docs/architecture/technabit-profile.md` and
`docs/worklogs/2026-11-12-ui-ownership.md` (owner-authorized next packet).
**Stack:** Existing Vue 2/CommonJS/esbuild/Node tests; no new dependencies.

## Constraints and review focus

Keep one page instance as state/ref/abort owner. Stateless view functions must use
its `h` and explicit data/callback inputs; no wrapper DOM or new Vue instances.
Retain current static/native control variants, one version marker, CSS bytes and
module side-effect order. Preserve config edits, stale responses, bounded polling,
focus restoration and selected history periods. Protect integration harness and
fixtures from the production graph. Keep root report-data compatibility for the
Python consumer. Non-JS semantic checks and CGI changes remain separate packets.

## Tasks

- [x] Capture baseline rendering characterization using the maintained esbuild
      harness; demonstrate missing new module contracts before extraction.
- [x] Extract page/workflow/dialog/status/history/header/footer owners and move
      report/PDF/time/icon/chart sources to their meaningful source paths.
      Keep the SDK entry and Python compatibility path deliberate and small.
- [x] Update legacy integration test imports/harness without removing assertions;
      add narrow view/workflow contracts and boundary negative controls.
- [x] Format changed files and run strict checks against `d8bcf8e` after logical edits.
- [x] Run UI/tooling tests, Python affected integration checkpoint, build/IPKs and
      source/rendering parity. Update source dispositions/profile/evidence.
- [x] Obtain fresh read-only review; fix important findings with RED→GREEN proof.
      Commit/push the existing review branch and verify remote SHA and cleanliness.

## Ledger

Pre-flight: method factories retain existing names and page `this`; the bundled
VM harness must preserve injected time/timers/browser globals across module moves.
Ruling: keep the root report-data compatibility entry for its real Python consumer;
cost: one documented root bridge until that consumer migrates with Python checks.

Tasks 1–3: ownership extraction and module contract RED→GREEN, UI 77/77.
Task 4: resolver controls RED→GREEN; tooling 10/10 and strict changed-file checks pass.
Ruling: retain exact CSS bytes/path; a style move requires rendered evidence.
Initial formatting was reverted and original assertions remain strict.

Task 5: complete — Python 106/106, UI 77/77, tooling 10/10, IPKs built.
Task 6: reviewed at 72c1b9a; restored public-site boundary with resolver RED→GREEN;
post-fix UI/tooling/quality pass. Published source/fix at 5c1389e; local/remote identity matched and tree was clean.
