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
