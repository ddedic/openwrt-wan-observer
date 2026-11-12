# Complete Technabit migration — 12 November 2026

Baseline: `725a94dabd067948983b35cc0c969b48c38399ec`. Owner explicitly requested
full completion and proper verification rather than another partial handoff.
Previous UI/foundation CI is green. Upstream checked unchanged at
`technabit/technabit-skills@300f61d8bed25f403824ddbbeced633b4bc7804c`.

## Research and reuse decisions before implementation

- Ruff configuration/API: <https://docs.astral.sh/ruff/configuration/>. Adopt pinned
  Ruff 0.17.4 for Python recommended error/unused checks and formatting. Root config
  is explicit; inline/nested weakening cannot hide problems.
- ShellCheck: <https://github.com/koalaman/shellcheck>; adopt native 0.11.0 analysis
  targeting POSIX sh, including extensionless executable sources. Official binary
  distributed by pinned shellcheck-py 0.11.0.1 is development-only (wrapper MIT,
  analyzer GPL-3.0-or-later).
- shfmt: <https://github.com/mvdan/sh>; adopt 3.14.1 (BSD-3-Clause), POSIX dialect,
  fixed indentation. Reuse upstream Go installer/binary, not a custom formatter.
- Luacheck: <https://github.com/lunarmodules/luacheck> and its documented standard
  environments. Adopt 1.2.0 (MIT), Lua51 globals and semantic checks; host analyzer
  runtime may differ from router Lua51, while actual CGI tests use Lua51/cjson.
- StyLua official README/source:
  <https://raw.githubusercontent.com/JohnnyMorganz/StyLua/main/README.md>.
  Adopt official npm-distributed 2.6.0 (MPL-2.0), explicit Lua51 syntax and root config.
- jq: <https://jqlang.org/manual/v1.6/>. Retain jq1.6+ as source compiler and contract
  runtime; compile actual library filters with an empty terminal expression.
  No maintained jq style engine was demonstrated suitable: a guessed jqfmt project
  was unavailable; gojq is a different runtime and its canonical Query.String is
  not a source-layout formatter. Do not invent a formatter or migrate runtimes.
- ESLint import/spacing tooling: upstream
  <https://github.com/un-ts/eslint-plugin-import-x> and
  <https://eslint.style/rules/padding-line-between-statements>. Registry peer/engine
  inspection confirms import-x4.18.1 and Stylistic5.10.0 support ESLint10/Node24.
  Preserve within-group evaluation order; do not alphabetize imports/registrations.
- CGI: use ordinary Lua51 modules/require and existing cjson/ubus; the CGI owner
  records focused official-module/API sources in its own worklog before extraction.

All additions run on development/CI hosts only. No new router dependency, kernel
requirement, visual design or external service is introduced. Custom code is only
project-owned canonical discovery, orchestration and policy/boundary checks that
upstream tools cannot supply for this mixed-language repository. Inspect actual
versions and negative controls; installation alone is not compatibility proof.

## Ownership and completion scope

CGI transport/auth, application service, command adapter and validators become
cohesive Lua modules, with a tiny executable entry and complete installed manifest.
UI report algorithms finish their named ownership split; readability/import checks
cover runtime, integration harnesses and verification tooling. Python's consumer
moves to the stable source contract so the temporary root UI bridge can be removed.
Shell/jq delivery layout remains native OpenWrt; cohesive CLIs are not split solely
by length. Every live source gets a final inventory disposition and real checker.
CSS/HTML rendering stays frozen, with exact stylesheet source preserved.

Final gate: all-language lint/discovery and changed-file formatting/boundaries;
negative controls; full Python/UI/tooling suites; installed-IPK CGI replay; release
bundle and IPK content checks; deterministic rebuild; synthetic browser smoke if a
compatible local browser is available; fresh review/fix pass; green final GitHub CI;
commit/push and exact local/remote synchronization. No live speed tests, production
router changes, merge or release. Any actual environment limitation is reported
precisely rather than labelled passing.

## Follow-up supplier inspection

- shfmt-py4.2.0 is independently versioned packaging, not a different formatter:
  <https://raw.githubusercontent.com/MaxWinterstein/shfmt-py/v4.2.0/README.md>.
  Installed binary reports upstream v3.14.1. Python tool wheels are locked with
  hashes and installed binary-only to avoid its unverified local-binary fallback.
- Lua policy parsing reuses luaparse0.3.1's documented Lua51 AST/comments API:
  <https://raw.githubusercontent.com/fstirlitz/luaparse/master/README.md>.
  Grammar is stable and release old; do not rely on it alone: Luacheck, StyLua's
  Lua51 parser/verification and actual Lua51 installed-package tests also run.
  This small MIT development parser fills comment/boundary-policy gaps, not lint.
- Reproducible browser proof uses Playwright1.65.0 (Apache-2.0, Node>=20) and
  Vue2.7.16 runtime (MIT) as dev-only suppliers:
  <https://playwright.dev/docs/test-webserver>,
  <https://playwright.dev/docs/downloads>,
  <https://v2.vuejs.org/v2/guide/installation.html>.
  Browser serves only the compiled app and test host on loopback with synthetic
  API responses. This exercises real Vue2/Chromium DOM and downloads, not physical
  GL.iNet components/firmware. Actual release bundle retains host-provided Vue.

## Final local execution and evidence

All final-source checks passed: 125 Python integration contracts (including actual
Lua 5.1/cjson and installed-IPK CGI replay), 79 UI tests, 24 quality/artifact tests,
all-source semantic lint and formatting, explicit-base quality and zero resolved
JavaScript boundary violations. Fourteen original VNode fixture hashes remain exact.
The UI extraction also matched 288 deterministic baseline report/CSV cases.

Two sequential package rebuilds produced identical bytes. Current 0.5.3-1 packages:
core 14,684 bytes, SHA256
`ab0b17c26729f2ae83a0f4711be9c2d11c22d1d71a08f12a38c21e8c113db6b7`;
admin 290,430 bytes, SHA256
`ab746a9135457fb80cb42519c7e39f8c87956b88b8cfb0930a1a94eff75b625c`.
Release artifact contracts exclude development tools, tests and fixtures; installed
module bytes/modes and missing-module failure are covered. Packages were built
locally only; no router installation, release or speed test occurred.

Chromium passed two real-DOM desktop/mobile scenarios using the bundle extracted
from the built admin IPK: dirty settings confirmation, save payload, focus trapping
and restoration, Escape, no mobile horizontal overflow, actual CSV/PDF downloads.
The synthetic host uses real Vue 2 runtime but does not reproduce proprietary
GL.iNet components. Real firmware and actual SDK compilation remain untested.
Local evidence is under `.local/technabit-completion/`; synthetic screenshots are
under `.local/browser-evidence/`. CI reproduces the source/package/browser gates.

Checker negative controls exposed and fixed two meaningful gaps: inherited
`SHELLCHECK_OPTS` could hide warnings, and jq pruned unused definitions before
reporting their unknown builtins. The wrapper now clears external shell/make/Lua
startup overrides; jq references every column-zero library definition in a
nonexecuting branch. Positive and negative regression controls pass. jq source
formatting is deliberately not claimed. Make recipe checks use include stubs,
not the complete OpenWrt SDK. Lua layout is owned by StyLua; only Luacheck's
redundant line-length check is disabled.

Shell formatting retains POSIX behavior. The detached manual collector worker is
now a named function retaining its child workspace/traps; this removes false
cross-subshell assignment diagnostics without disabling ShellCheck analysis.
Python formatting uses Ruff; the test timestamp helper changed from a lambda
binding to a named function. Existing behavior assertions were retained.

UI runtime `npm audit --omit=dev` reports zero vulnerabilities. Root audit reports
one low-severity development-only Vue 2 compiler advisory,
<https://github.com/advisories/GHSA-5j4c-8p2g-v4jx>. Browser proof loads runtime-only
`vue.runtime.min.js` with render functions and controlled synthetic fixtures; the
compiler is unused, and Vue is excluded from the router bundle. Upgrading the
fixture to Vue 3 would invalidate host compatibility proof, so this bounded
supplier limitation is documented rather than forced through an incompatible fix.

Final publication gate: fresh independent review, pushed source commit, green CI
on the final branch head and exact local/remote synchronization. Record results
below when available.

## Independent review and clean-runner fixes

Fresh read-only review of `725a94d..f577a24` found one important CI setup-order
issue and no additional substantiated runtime regression. The newly added
installed-IPK test invokes the real UI build, so the offline matrix must install
UI dependencies before Python tests. The clean runner reproduced the failure;
its UI install now precedes the Python suite. The reviewer independently reran
79 UI and 24 quality/artifact tests and delivered the required explicit handoff.

First CI run <https://github.com/ddedic/openwrt-wan-observer/actions/runs/43226009109>
also caught a Linux portability failure in the jq checker: Node supplies a socket
for child stdin, which Linux cannot reopen as `/dev/stdin`. The retained positive
jq control failed exactly there. The checker now writes its synthetic filter to
a temporary regular file, invokes jq's documented `-f` API and removes the directory
in `finally`; no router source/runtime changed. The same positive and unknown-builtin
negative controls must pass locally and on the final Linux run. This is a small
adaptation of the already researched upstream jq API, not a new compiler.
