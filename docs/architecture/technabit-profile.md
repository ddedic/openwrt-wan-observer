# WAN Observer engineering profile

Accepted scope: the owner's 12 November 2026 instruction to execute the proposed
behavior-preserving migration, starting with conventions, quality checks, router
transport and settings validation. Later packets remain planned.

## Standards and ownership

Canonical source: <https://github.com/technabit/technabit-skills>.
Adopted revision: `300f61d8bed25f403824ddbbeced633b4bc7804c` (31 October 2026).
Last upstream check: 12 November 2026. Responsible lead: repository maintainer.
Check upstream before each work packet and weekly during active work; do not
silently change dependencies or update a shared skill checkout concurrently.

Apply the portable core, frontend ownership and backend boundary rules. Reference
React/Hono stacks are optional examples. This is an incremental adoption, not a
claim that untouched source already satisfies every rule.

## Stack and delivery contracts

- Router: POSIX shell, BusyBox-compatible utilities, jq 1.6+, Lua 5.1/cjson/ubus.
  No new router dependencies. Supported actual test target remains GL-MT6000,
  GL.iNet firmware 4.11.0; SDK compatibility beyond this is unproven.
- UI: host-provided Vue 2 render functions, CommonJS SDK4 export, esbuild 0.28.2,
  jsPDF 4.2.1, existing CSS. Keep current installed paths and API payloads.
- Development: Node 24/npm; Python 3 and existing unittest contracts. New quality
  dependencies live only in the root development package and never in IPKs.
- Preserve root/admin session verification, allowlisted commands, privacy filters,
  bounded retention, atomic writes, budget guards and operator-owned state.
- Preserve CSS bytes/order, markup, copy, focus behavior and async lifetimes.
  All visual/interaction design belongs to Opus 5.5 and requires owner review.
- No live router operations, speed tests, release, deployment or credential access
  are part of this packet. Publish the working branch for review; do not merge it.

## Ownership and allowed dependencies

Keep `package/wan-observer` (collector) and `package/wan-observer-glinet` (admin
integration) as delivery boundaries. Keep the public `site/` and local
`tools/preview/` independently owned. Do not create speculative shared packages.

UI target: application composition imports features and infrastructure. Features
own their components, pure rules and workflows. Presentation receives data and
callbacks. Transport adapters own requests; page workflows own cancellation,
supersession, refresh and manual-test polling. Infrastructure cannot import UI
features or the application. Settings validation is pure and cannot import them.
No production dependency may reach a test, preview, verification tool or fixture.
Existing flat UI files are retained until their named packet moves them.

Use PascalCase for components and named contracts, kebab-case for other modules,
camelCase for functions and locals, and SCREAMING_SNAKE_CASE for fixed module
constants. Preserve external protocol names (for example `download_mbps`). Use
explicit exports, meaningful responsibility boundaries, and adjacent focused tests.
No empty mandatory files, generic helpers buckets or line-count-driven splits.
JavaScript contracts use JSDoc where useful; TypeScript conversion is not required.

## Enforcement and migration limits

The first packet introduces ESLint recommended rules, Prettier and resolver-based
JavaScript boundaries. Strict changed-file checking uses an explicit Git base,
includes untracked/renamed live files, rejects empty code selection and disallows
rule overrides/inline suppressions. The checker pins root ESLint and Prettier
configuration; JavaScript formatter-ignore comments are lint errors. Full JavaScript lint discovers UI, tests,
preview and quality tooling. Formatting applies to changed files; mass formatting
of untouched legacy files is a separate packet. See the worklog for actual proof.

Python semantic lint/formatting, Lua semantic lint, shell semantic lint and jq
style enforcement remain planned, not waived and not claimed as implemented.
Existing Python behavior tests, shell syntax and Lua syntax checks remain required.
Before those languages change, add and prove their compatible checks or record a
specific reviewed exception. This packet changes JavaScript and configuration only.
Import-group/statement-padding automation and full component naming/boundary
migration also remain planned; use readable grouping while writing new modules.

The source inventory records every original live file and its first-packet
status. Later packets must update its disposition without losing tests/assets.
Run affected tests per edit and the integration/package checkpoint for this
transport extraction. A synthetic test is not real firmware or browser proof.
