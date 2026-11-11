# Research and reuse decisions

Checked 2026-11-11. No private infrastructure, measurements, or credentials are needed to build this project.

| Component | Evidence | Decision |
| --- | --- | --- |
| Speedtest Tracker | [Features](https://docs.speedtest-tracker.dev/features), [upstream dependencies](https://github.com/alexjustesen/speedtest-tracker/blob/1.x/composer.json): MIT, PHP/Laravel, scheduled tests, exports | Useful existing alternative for a server. Do not embed a PHP application in a small router package. |
| speedtest-netperf | [OpenWrt README](https://github.com/openwrt/packages/blob/master/net/speedtest-netperf/files/README.md), [package recipe](https://github.com/openwrt/packages/blob/master/net/speedtest-netperf/Makefile): GPL-2.0, native router tests and CPU context | Candidate future backend. Public volunteer servers explicitly discourage continuous/high-rate use. Do not schedule them by default. |
| bandwidth-monitor | [Upstream](https://github.com/awlx/bandwidth-monitor), [dependencies](https://github.com/awlx/bandwidth-monitor/blob/main/go.mod): AGPL-3.0, Go, packet/netlink monitoring | Broader live-monitoring product; no code copied. Reassess before implementing overlapping telemetry. |
| Ookla CLI | [Official distribution](https://www.speedtest.net/apps/cli); installed CLI 1.2 help confirms machine-readable throughput uses **bytes**, not bits | Optional externally installed tool; no binary redistribution or automatic license acceptance. Terms must be checked independently for the intended use. Importing existing JSON does not execute it. |
| jq / OpenWrt packaging | [jq manual](https://jqlang.org/manual/), OpenWrt script-package recipe above | Reuse jq for parsing, validation, numeric conversion and CSV quoting; POSIX shell for a small architecture-independent package. No Python/container runtime on the router. |
| Certified measurements | [RTR explanation](https://www.rtr.at/TKP/service/rtr-nettest/help/certified_measurement/netztestfaq_definition_certified_measurement.de.html) | Reports are diagnostic records, not certified measurements or automatic findings of contractual breach. |

The narrow custom gap is bounded, privacy-minimizing measurement history and portable exports on a router, with measurement-context checks planned. Phase one only imports existing test JSON. It does not claim to solve scheduling, path verification or continuous monitoring yet.

Compatibility: jq 1.6+ and POSIX shell are the runtime target. OpenWrt SDK packaging and vendor firmware installation must be tested separately. The initial recipe is not evidence of compatibility with every OpenWrt/GL.iNet release. No kernel modules are required.

## Disposable local preview — 2026-11-11

Reuse Python's [HTTP server API](https://docs.python.org/3/library/http.server.html) for a developer-only loopback preview. Upstream explicitly excludes production use. Fixed routes and the existing CLI's validated projection avoid directory serving and duplicate measurement validation. No third-party UI code or runtime dependencies are added; Python is needed only on the development computer, never on the router. The temporary UI is disposable pending the final design. It makes no speed tests or router configuration changes. Synthetic fixtures demonstrate behavior; live collection and router UI integration remain untested and unimplemented.

## Foundation verification

2026-11-11: nine offline development tests pass. Synthetic normalize/import/list/CSV smoke test passed on a GL-MT6000 with BusyBox1.33.2 and jq1.6. Its jq lacks the optional regex library; timestamp validation uses parsing and round-trip comparison instead. Test files were temporary and removed; no throughput test, daemon or firmware package was installed. SDK compilation and package lifecycle testing remain unverified.

## Report-focused preview revision — 2026-11-11

Reviewed [Speedtest Tracker features](https://docs.speedtest-tracker.dev/features): charts, filtering, export and thresholds are established patterns. Reuse the existing local preview and native browser APIs instead of adding its server runtime to this disposable prototype. [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) persists only comparison preferences in the browser; failures must be handled. [Print CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing) supports a printable report without a PDF service. No upstream source copied. Keep synthetic data visibly identified in print; report counts of observed slow tests, never infer outage duration from sparse samples. Router configuration and scheduling remain outside this temporary report UI.

## Adaptive collector — 2026-11-11

Reviewed [OpenWrt cron service source](https://github.com/openwrt/openwrt/blob/main/package/utils/busybox/files/cron) and [Speedtest Tracker scheduler configuration](https://docs.speedtest-tracker.dev/getting-started/environment-variables). Reuse OpenWrt cron as a once-per-minute trigger with a small serial POSIX-shell collector; a fixed cron expression alone cannot express bounded degradation follow-ups. Installed Ookla 1.2.0.84 supports JSON and interface/server selection; timeout is available on the target. No binary redistribution or terms acceptance. Defaults remain disabled in the public package. Keep persistent bounded history, ephemeral scheduler state, and sanitized execution outcomes. A reboot resets burst/day accounting; document that limitation. Hourly/half-hourly baselines reserve their own runs; extra tests are capped separately. Until WAN context is implemented, low speed is an observation, not attribution to the ISP.


Collector dependency checked against [OpenWrt coreutils package source](https://github.com/openwrt/packages/blob/master/utils/coreutils/Makefile): `coreutils-timeout` provides the required timeout/kill-after behavior. No upstream source copied. Verification: 24 offline tests, a real router collection/import smoke test, and browser verification of live history and idempotent schedule save. Degradation/recovery bursts were tested with synthetic backend responses, not by disrupting the real connection. SDK build/install remains unverified.

## Native GL.iNet integration — 2026-11-11

Inspected [gl-sdk4-plugin-kit](https://github.com/go-wombat/gl-sdk4-plugin-kit) (MIT, last upstream push 2026-08-18), especially [custom backend authentication](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/backend-auth.md) and [menu registration](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/menu.md). Its verified matrix includes MT6000 4.9.1 but does not establish compatibility with the target vendor 4.11 build. The target's installed package layout confirms menu.d, dynamically loaded Vue views, nginx CGI and gl-session APIs; LuCI is not installed. Reuse the native menu/view/session contract rather than introducing another router web server or bypassing login. Validate the exact target contract locally before deployment; do not assert general firmware compatibility.

Backend implementation decision: use installed Lua/cjson/libubus-lua to validate the current root session in process, avoiding session tokens in process arguments. Keep plugin commands fixed and request fields allowlisted. Authenticated API reads and writes must fail closed for absent/invalid/non-root sessions; no cookie-only write authorization or permissive CORS. No third-party code copied at this point. Proposed UI package should preserve the standalone OpenWrt collector rather than making generic collection depend on GL-specific packages.

Live backend verification on GL-MT6000 4.11: direct libubus returns session fields at the top level. The CGI accepted an existing root session and an idempotent schedule save, rejected absent or invalid sessions, and blocked cross-origin writes and unknown configuration fields. Scheduling updates merge only the five schedule fields under the collector lock. No web server configuration was needed. The native view and installable UI package still require separate verification.

## Dedicated PDF export — 2026-11-11

Reviewed [jsPDF upstream](https://github.com/parallax/jsPDF) and [pdf-lib documentation](https://pdf-lib.js.org/). Both support direct document generation and vector drawing in the browser. Use a pinned, locally bundled PDF library for the approved page layout, with pagination driven by the selected report data. The router should serve the bundle without running a PDF process. No HTML print, screenshot export or external service is needed. Final library version, compressed bundle footprint, rendering and text extraction remain to be checked during implementation.

Approved implementation uses the [SDK4 CommonJS Vue component contract](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/template/webpack.config.js), a local browser bundle and [jsPDF 4.2.1](https://github.com/parallax/jsPDF/releases/tag/v4.2.1), MIT. Use vector operations only. The GL package uses the [OpenWrt 21.02 IPK layout](https://github.com/openwrt/openwrt/blob/openwrt-21.02/scripts/ipkg-build); verify install through target opkg. The router needs neither Node nor PDF rendering software.

The installed 0.3.0-3 packages were verified on Flint 2 SDK4 4.11.0. The browser loaded the native Flow Control menu, showed real measurements and saved the existing schedule. The PDF generator produced valid A4 pages including a paginated appendix. Chrome blocked saving the browser-generated file on the router's HTTP origin. Use a trusted HTTPS admin origin for browser download verification. No TLS configuration changes were made.

## Initial theme investigation and manual Run Speedtest — 2026-11-11

The shadow-root and cell-grid UI described in this investigation was superseded by the native Vue page below.

Reuses findings above; no upstream source re-fetched because the reviewed contracts are unchanged. References: the [SDK4 CommonJS Vue view contract](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/template/webpack.config.js) and [backend authentication](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/backend-auth.md); [CSS custom properties inherit into shadow trees](https://developer.mozilla.org/en-US/docs/Web/CSS/--*) and [inherited font properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Inheritance); WAI-ARIA APG [tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) and [roving tabindex](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex); [OpenWrt BusyBox](https://github.com/openwrt/openwrt/tree/main/package/utils/busybox) shell job control.

Decisions:

- Theme: the on-device SDK4 4.11 Default, Classic and Dark themes expose semantic CSS variables (`--background-card`, `--text-title`, `--primary`, `--secondary`, `--warning`, `--error`, `--border`, `--shadow` and similar) on the host document. The view's shadow root consumes those inherited variables with neutral fallbacks and inherits the host font. No vendor CSS, palette values or theme files are copied or bundled; the extracted token list stays outside Git. No runtime CDN.
- Status grid: one tooltip element, shown on hover, keyboard focus and tap; measured slots use one roving tab stop with arrow-key navigation; empty slots stay informational. Colour is always paired with a plain-English legend and text details.
- Manual run: reuse the existing CGI session/root/same-origin checks and the collector lock, binary, server, interface and timeout. The CGI accepts only `{"action":"run_speedtest"}` and calls a fixed collector command; no request data reaches the shell. The collector takes the lock synchronously, then finishes the single attempt in a detached child so the HTTP request does not wait up to 130 seconds. Schedule state, follow-up bursts and daily allowance are not modified; the event reason is `manual`.
- Plan baseline: the schedule request optionally accepts both `download_mbps` and `upload_mbps` (integers 1–100000) alongside the five legacy fields. Plan-only changes keep the next scheduled time.

Untested assumptions: GL 4.11 nginx/fcgiwrap lets the detached child survive after the CGI exits (the child ignores HUP; BusyBox `setsid` is not required); the semantic theme variables are defined on the document for all three themes at runtime and switch live; the host font stack is inherited by the view. Verify on the target before installing.

## Native SDK4 page composition — 2026-11-11

Reviewed the MIT [gl-sdk4-plugin-kit component reference](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/components.md) and [native chart notes](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/charts.md) with its [`gl-line-chart-v1` contract fixture](https://github.com/go-wombat/gl-sdk4-plugin-kit/blob/main/docs/fixtures/gl-line-chart-contracts.json) (verified there on MT3000 4.8.1 and MT6000 4.9.1). A private extract of the target 4.11 admin bundle confirms global registration of `gl-title`, `gl-card`, `gl-button`, `gl-switch` and `gl-line-chart`; their 4.11 props were not re-extracted.

Decision: the view becomes a light-DOM Vue 2 render component using those native components when registered, with plain fallbacks. No chart library is bundled; the firmware chart renders download and upload separately with a grey plan reference. Values sit on a fixed time grid (slot = schedule interval, at most 180 slots) and are null where no completed test exists, so lines break at gaps. The kit's adapter is not vendored; the view remounts the chart when data changes, which avoids the documented stale-reference issue. Status colours (green/amber/red/grey) are scoped and fixed rather than taken from theme accents. Dialogs remain plain elements because no dialog component is in the verified portable contract.

Untested on 4.11: exact rendering and spacing of each native component; whether `plugins.tooltip`/`legend` and `y.title` options reach Chart.js; `gl-switch` event name (`input` and `change` are both handled idempotently). Known contract limit: `pointRadius: 0` hides an isolated test between gaps in the chart; the Recent tests list shows every test.


## Approved polish deployment — 2026-11-11

Installed 0.4.0-1 on GL-MT6000 4.11.0. Browser inspection confirmed native cards, title, buttons, switch and both charts render in the real admin layout. Settings expose editable stored plan speeds and an unchanged save round trip succeeded. The real schedule remains 120 minutes with adaptive follow-ups off. Manual execution was verified through the actual authenticated CGI using an isolated synthetic backend: 202 accepted, 409 overlap, completed event, unchanged schedule and operation while paused. No full bandwidth test was started for this verification. Theme switching and physical mobile-device behavior remain unverified. The plain-HTTP Chrome download restriction still applies. Offline verification: 28 Python and 4 browser-data/PDF tests pass; dependency audit reports no production advisories.

## 2026-11-11 — Approved logo integration

Reuse the existing original SVG mark in the native title, with host theme colours and no runtime dependency. Owner approved the Opus header preview. For the README, adapt GitHub’s theme-specific image fragments instead of OS-based picture selection: https://github.blog/changelog/2021-11-24-specify-theme-context-for-images-in-markdown/ . GitHub mobile behaviour remains unverified; non-GitHub renderers may show both variants. No new component or font is needed.

## 2026-11-11 — App logo alignment beside native `gl-title`

- Source (read-only, installed Flint firmware `/www/js/app.ab987315.js.gz`): `gl-title` renders `div#view-title-wrapper > div.title + div(slot)`; scoped CSS `#view-title-wrapper[data-v-0d29ad7a]{min-height:36px;display:flex;align-items:center;…;margin:0 16px 14px}`, `.title{font-size:22px;font-weight:700;margin-right:10px}`.
- Cause: in `.wo-brand` (flex, centred, gap 12px) the wrapper's 16px left margin widened the gap to ~28px, and its 14px bottom margin made the centred margin box sit the title 7px above the 28px mark.
- Decision: reuse native `gl-title` unchanged; adapt only container CSS — `.wo-brand>#view-title-wrapper[id]{margin:0}` (specificity beats the scoped rule) and move the 14px to `.wo-brand:has(>#view-title-wrapper){padding-bottom:14px}` (h1 fallback untouched) so header height/spacing are unchanged. No JS change.

## 2026-11-11 — Approved larger header mark

Reuse the existing SVG path and native GL title integration documented above. Owner approved Opus’s 45×30px treatment: crop viewBox to the drawing (4 10.5 60 40), stroke 5.5 units, dot radius 5, title gap 10px. This corrects excessive internal SVG whitespace without a new component, font or runtime dependency. Existing native title margin fix is retained.
