# Changelog

Notable changes to WAN Observer. Router package versions follow the tags below; download builds and checksums from [Releases](https://github.com/ddedic/openwrt-wan-observer/releases).

## Unreleased

Internal structure and verification.

- Organized the dashboard into feature-owned views, workflows, transport and shared rules; split the CGI into authentication, HTTP, service, validation and command modules.
- Added pinned linting, formatting, dependency-boundary checks and CI coverage across the repository's languages.
- Added installed-package and browser tests for settings, keyboard focus and CSV/PDF downloads. Verified the candidate on a real Flint 2 running firmware 4.11.0, including an isolated manual-worker test; existing configuration, history, cron and scheduler state were preserved byte-for-byte.

## 0.5.3 — 2026-11-12

Run Speedtest fixed for the dashboard.

- **Run Speedtest** from the GL.iNet dashboard no longer fails with _Program error_. The dashboard's web server passes `HOME=/`, so the Ookla CLI could not find its accepted license and exited with its license prompt. The collector now always uses the home directory of the account running the test. The 0.5.1 fix only covered a missing `HOME`.

## 0.5.2 — 2026-11-12

Installed version in the dashboard.

- The dashboard footer shows the installed version, linked to its release notes.
- The 0.5.1 dashboard package contained an outdated dashboard build. This release ships a fresh build, and packaging now always rebuilds the dashboard first.
- The dashboard package now requires the collector package of the same version, so both always upgrade together.

## 0.5.1 — 2026-11-12

Fix for dashboard-started speed tests.

- **Run Speedtest** from the GL.iNet dashboard no longer fails with _Program error_. The dashboard starts tests without `HOME`, which made the Ookla CLI abort; the collector now uses the account's home directory. Scheduled tests were not affected.
- Project website at <https://ddedic.github.io/openwrt-wan-observer/>, built from `site/` and published by the `Website` workflow.
- Social metadata now describes OpenWrt speed-test history with a native GL.iNet dashboard, and uses a designed 1200×630 preview instead of the raw dashboard capture.

## 0.5.0 — 2026-11-11

Local quality history and clearer test records.

- Latest-attempt status kept apart from the last successful reading; time-proportional charts; failed tests handled safely.
- Optional local history from the existing GL Network Quality service. No additional WAN probes; off by default.
- Settings for overnight windows, UTC or router time, longer intervals, editable plan and threshold, and a monthly test-data limit.
- Data-use estimates from measured bytes when available, with unknown or partial accounting shown as such.
- Accessible settings and export dialogs, improved loading state, theme-aware controls and a source link.
- Screenshots refreshed from the real Flint 2 dashboard; installation, upgrade, contribution and security guidance.

## 0.4.5 — 2026-11-11

Reliability and diagnostics.

- Attempt coverage preserved explicitly, more failures retained, legacy originals kept during migration.
- Failures classified safely; new attempts linked to measurements with opaque IDs.
- Visible dashboards refresh automatically and explain stale or readiness states.
- CSV and PDF include jitter, loaded latency, packet loss, actual test bytes and coverage limits.
- Read-only setup checks and OpenWrt backup preservation entries.
- CLI-only passive quality history and a test-byte start guard. Installation still enables no collection.

## 0.4.4 — 2026-11-11

- Larger, better balanced application logo with tighter title spacing.
- Refreshed README screenshots.

## 0.4.3 — 2026-11-11

- Fixed the native GL.iNet header logo alignment and vertical centring.

## 0.4.2 — 2026-11-11

- WAN Observer mark beside the native router title, in the host theme colours.
- README logo now follows the light or dark GitHub theme.

## 0.4.1 — 2026-11-11

- More space above the native header.
- Original artwork, a shorter README and a separate technical guide.

## 0.4.0 — 2026-11-11

Native Flint interface.

- Uses the router's own title, cards, controls and charts.
- Latest test separated from period history and exports.
- Authenticated **Run Speedtest** with overlap protection and completion feedback.
- Editable, persistent plan download and upload speeds.
- Illustrative data-use estimate before enabling scheduled tests.
- Better settings, error and empty states, and mobile layout.

## 0.3.0 — 2026-11-11

First GL.iNet SDK4 release.

- Native dashboard under **Flow Control → WAN Observer**; core package alone for headless OpenWrt collection.
- Opt-in collection with schedule controls and adaptive follow-up history.
- CSV export and a dedicated vector A4 PDF with optional appendix.
