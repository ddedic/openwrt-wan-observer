# Complete repository migration plan

**Goal:** Finish the adopted Technabit ownership/convention migration and prove the
final package/application contracts without changing design or router behavior.
**Spec:** accepted proposal, project profile, and owner instruction for full completion.
**Baseline:** 725a94d. Execute remaining work, verification and publication in this run.

- [x] Reuse/pin compatible Python, Lua, shell, jq and JavaScript checkers; canonical
      all-source selection, strict explicit-base scope, no silent overrides/suppressions.
- [x] Finish CGI auth/HTTP/service/adapter/validator ownership and install manifest;
      preserve all existing tests and add installed-package execution tests.
- [x] Finish UI named report algorithms/readability, import grouping and semantic
      callback contracts; remove compatibility bridge after actual consumer migration.
- [x] Apply language-native formatting, remove actual unused bindings, retain exact
      CSS/markup and runtime dependency/security/storage contracts.
- [x] Prove positive/negative checker cases, all source discovery and package contents;
      run full integration/UI/tooling tests and deterministic builds on final source.
- [x] Reconcile every inventory entry/profile convention; document bounded evidence
      and exact exceptions (no false whole-project runtime/firmware claims).
- [ ] Fresh read-only review, one meaningful fix pass with regressions, then final
      local/remote checks and green GitHub CI. Publish review branch, no merge/release.

## Coordination and review focus

CGI delegate owns Lua, CGI tests, IPK manifest and its research worklog. Root owns
quality tools/CI/configs and remaining Python/shell sources. UI delegate owns UI
JavaScript/its tests. Root does not format delegate files until they hand off.

Review actual authenticated session failures, bounded input/command projection,
cleanup, installed module lookup and modes; untouched optional settings and unknown
measurements; rendered VNode/callback/focus parity; source discovery incl extensionless
shell and ignored/untracked/renamed files; no weakening through nested config/directives;
no test/fixture/development package in artifacts; no new router dependencies.
