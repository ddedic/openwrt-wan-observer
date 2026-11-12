# WAN Observer engineering profile

Accepted scope: the owner's 12 November 2026 full behavior-preserving migration.
Foundation, UI ownership, CGI extraction and mixed-language enforcement are complete.
See the [completion worklog](../worklogs/2026-11-12-completion.md) for verification
and the explicit limits of synthetic testing.

## Standards and ownership

Canonical source: <https://github.com/technabit/technabit-skills>.
Adopted revision: `300f61d8bed25f403824ddbbeced633b4bc7804c` (31 October 2026).
Last upstream check: 12 November 2026. Responsible lead: repository maintainer.
Check upstream before each work packet and weekly during active work; do not
silently change dependencies or update a shared skill checkout concurrently.

Apply the portable core, frontend ownership and backend boundary rules. Reference
React/Hono stacks are optional examples. The project profile below adapts those rules to the existing router stack.

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
- Initial migration excluded live operations. The owner subsequently authorized
  actual-device validation; see the [native worklog](../worklogs/2026-11-12-native-validation.md).
  Publish the working branch for review; do not merge or release it.

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
UI owners now live under `src/app`, `src/features`, `src/measurements`, `src/time`,
`src/scheduling`, `src/collector`, `src/components` and `src/infrastructure`.
The root SDK entry preserves the host contract; report consumers use the explicit
`src/measurements/report-data.js` facade. The temporary root bridge is removed.
`view.css` stays byte-preserved at its existing path. Integration code lives under
`ui/tests`. Features cannot import the application or another feature's private
files; the application composes their view/workflow contracts.

Stateless named Vue 2 view functions use explicit data/callback inputs and adjacent
JSDoc `.types.js` contracts; the parent's `h` preserves VNode context and refs.
One page instance owns reactive state, lifecycle hooks, cancellation and dialog refs.
JSDoc documents inputs; no TypeScript-checking claim is made.

Python keeps native snake_case module/test names; Lua uses the `wan_observer`
namespace and kebab-case responsibility modules. External installed paths remain
OpenWrt-compatible. Use PascalCase for components and named contracts, kebab-case for other modules,
camelCase for functions and locals, and SCREAMING_SNAKE_CASE for fixed module
constants. Preserve external protocol names (for example `download_mbps`). Use
explicit exports, meaningful responsibility boundaries, and adjacent focused tests.
No empty mandatory files, generic helpers buckets or line-count-driven splits.
JavaScript contracts use JSDoc where useful; TypeScript conversion is not required.

## CGI ownership

The executable CGI only boots `wan_observer.application`. `http/` owns root/admin
session authentication and response mapping; `services/` owns dashboard projection
and finite operation results; `adapters/commands.lua` alone opens fixed command
processes; `contracts/` owns JSON/schedule validation. Services cannot import HTTP,
adapters cannot import services/HTTP, and contracts import only contracts.
The builder installs all modules under `/usr/lib/lua/wan_observer`; installed-IPK
contracts execute that tree without source fallback. No framework/router runtime
was added.

## Enforcement and evidence limits

All tracked and untracked live sources are discovered through Git, including
extensionless shell. Explicit-base checks include live renamed/untracked files;
empty scope fails and docs-only scope is valid. Root configurations are pinned;
inline suppressions, nested weakening, hidden shell options and unknown source
languages fail. JavaScript uses ESLint recommended, curly/no-nested-ternary,
import grouping and statement spacing; Prettier handles source/docs layout and
resolver-based dependency rules cover all project JavaScript.

Python uses hash-locked Ruff 0.17.4; Lua uses Luacheck 1.2.0 with Lua51 globals and
StyLua 2.6.0; POSIX shell uses ShellCheck 0.11.0 and shfmt 3.14.1. StyLua owns Lua
line layout, so Luacheck's duplicate line-length check is disabled; no semantic
unused-variable checks are disabled. Native format checks cover all these sources.
jq 1.6+ compiles every column-zero library definition through synthetic references,
including unused definitions, and retained behavior tests exercise the filters.
There is no adopted jq source formatter: existing layout is retained, rather than
claiming an unsupported style tool. GNU Make parses recipes with minimal SDK include
stubs; this establishes syntax only, not an actual OpenWrt SDK build.

Exact CSS/HTML/SVG hashes are registered in `tooling/quality/frozen-rendering.json`;
changes/new visual sources require the approved visual-design delivery. Fourteen
original rendered-tree fixtures remain unchanged. Chromium runs the actual built
IPK bundle with Vue 2 runtime and synthetic APIs at desktop/mobile sizes, testing
keyboard focus, settings save and CSV/PDF downloads. This proves real DOM behavior
in that test host, not native GL.iNet components, actual firmware or device behavior.
Subsequent owner-authorized validation installed the exact candidate on an actual
Flint 2/firmware 4.11.0, checked native login/API/settings/history/exports/focus and
an isolated fake-backend detached worker. Persistent data/configuration and schedule
were preserved byte-for-byte. See the native worklog for exact scope and limitations;
this does not establish other firmware or physical-phone compatibility.

The source inventory retains every original source mapping and records the final
canonical source census. Root quality tools, browser fixtures and development
suppliers cannot enter production bundles/IPKs. JSDoc contracts document inputs;
they are not static type checking. Root Vue 2 is a development-only runtime supplier;
its low-severity compiler advisory is recorded in the completion worklog. Production
UI runtime dependency audit is clean at verification time.
