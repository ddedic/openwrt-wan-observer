<p align="center">
  <img src="docs/assets/logo.svg#gh-light-mode-only" alt="WAN Observer" width="363" height="64">
  <img src="docs/assets/logo-dark.svg#gh-dark-mode-only" alt="WAN Observer" width="363" height="64">
</p>

<p align="center"><strong>Local speed-test history for your router — so “the internet is slow again” becomes a record you can inspect, export and share with your provider.</strong></p>

<p align="center">
  <a href="https://github.com/ddedic/openwrt-wan-observer/actions/workflows/test.yml"><img src="https://github.com/ddedic/openwrt-wan-observer/actions/workflows/test.yml/badge.svg" alt="Offline tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/status-experimental-orange.svg" alt="Status: experimental">
  <img src="https://img.shields.io/badge/GL.iNet-SDK4%20plugin-2c2a5a.svg" alt="GL.iNet SDK4 plugin">
</p>

<p align="center">
  <a href="https://ddedic.github.io/openwrt-wan-observer/"><strong>Website</strong></a> ·
  <a href="https://github.com/ddedic/openwrt-wan-observer/releases"><strong>Download</strong></a> ·
  <a href="#install-on-a-glinet-flint-2">Install</a> ·
  <a href="docs/TECHNICAL.md">Technical guide</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <img src="docs/assets/dashboard.png" alt="WAN Observer dashboard inside a router admin page, showing latest test, download and upload history against plan speeds, and a test list" width="900">
</p>

<p align="center"><sub>WAN Observer running on a GL.iNet Flint 2, firmware 4.11.0.</sub></p>

## Why

Intermittent slowdowns are hard to prove from memory. WAN Observer keeps a bounded, private history of speed tests on the router itself and turns it into charts, a plain-language summary and exports you can hand to support. No cloud account or WAN Observer telemetry. The operator-installed speed-test tool contacts its own external services.

## Features

- **Native router page** — GL.iNet SDK4 plugin under **Flow Control → WAN Observer**, using the admin panel's own components and theme.
- **Run Speedtest** — one immediate test on demand, also while scheduling is paused.
- **Schedules you control** — pause/resume, 15-minute to 12-hour intervals, all-day or overnight windows in UTC or router time. Data-use estimates use measured bytes when available and a clearly labelled example otherwise.
- **Your plan as the baseline** — editable plan speeds and slow-result threshold; time-proportional charts keep failed attempts separate from the latest successful reading.
- **Optional adaptive follow-ups** — opt in to up to 3 extra tests, 5 minutes apart, after a slow or failed test; capped at 24 extras per UTC day.
- **Current history and exports** — the visible dashboard refreshes every 30 seconds; PDF and CSV include available latency, jitter, packet loss, loaded latency and actual test bytes.
- **Bounded history** — retain valid measurements and successful/failed attempts independently (default 1,000 each, max 10,000), with explicit incomplete legacy coverage.
- **Optional quality history** — record existing GL Network Quality snapshots locally, with latency, jitter, loss and DNS timing; no extra WAN probes. Requires the GL.iNet 4.11 service.
- **Optional data start guard** — set a monthly allowance in Settings; recorded test bytes count toward it, unknown accounting blocks new starts, and one allowed test can go over. [Setup and limits](docs/COLLECTOR.md).
- **Small footprint** — POSIX shell + jq on the router. No Python, database or container.
- **Privacy by allowlist** — IP/MAC addresses, hostnames, ISP labels and result links are discarded on import.

<details>
<summary>Testing settings</summary>

![Testing settings on Flint 2](docs/assets/settings.png)

</details>

## Install on a GL.iNet Flint 2

Requires SSH/root access, an `opkg`-based firmware with jq and `coreutils-timeout`, and a separately installed, permitted Ookla Speedtest CLI. Check the [compatibility table](#compatibility-and-status) before installing. The router page requires both packages; installing the core alone provides CLI tools, not a generic LuCI page.

1. Download **`wan-observer`** and **`wan-observer-glinet`** IPKs with the same version/revision, plus their `SHA256SUMS` file, from [Releases](https://github.com/ddedic/openwrt-wan-observer/releases). Keep that release's files in a directory of their own. Verify the downloads on your computer with `sha256sum -c SHA256SUMS-*.txt` (macOS: `shasum -a 256 -c SHA256SUMS-*.txt`).
2. Copy them to the router and install both:
   ```sh
   opkg install /path/to/wan-observer_*.ipk /path/to/wan-observer-glinet_*.ipk
   ```
3. Follow [collector setup](docs/COLLECTOR.md): configure the binary, permitted server and plan while collection is disabled, check readiness, then explicitly enable the schedule and add its cron entry when wanted. Setup still requires operator CLI work.
4. Sign in to the admin panel and open **Flow Control → WAN Observer**.

Keep a private backup before upgrading or removing packages; see [preservation and rollback](docs/TECHNICAL.md#backup-and-restore).

**Installation runs no tests.** Scheduled speed tests and quality history stay off until you opt in. Quality history reads an already-enabled GL service; it does not enable that service. Existing settings are preserved on upgrade. WAN Observer does not bundle Ookla software or accept third-party terms for you.

## Compatibility and status

| Component                                         | Status                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GL.iNet SDK4 plugin (`wan-observer-glinet` 0.5.0) | 0.5.0-1 installed and checked on GL-MT6000 (Flint 2), firmware 4.11.0; screenshots show the current native dashboard and settings. |
| Core collector/CLI (`wan-observer`)               | Synthetic offline tests and Flint 2 smoke checks; not universal firmware validation                                                |
| Other OpenWrt builds / SDK package recipe         | Not yet validated across firmware releases                                                                                         |
| Local desktop preview (`tools/preview.py`)        | Developer-only tool                                                                                                                |

Experimental. Version 0.5.0 adds quality-history and byte-budget controls, clearer setup/attempt states and time-proportional charts. Existing two-hour, adaptive-off, all-day settings remain unchanged; quality history defaults off, the budget stays unset and existing UTC windows stay UTC. Full details: [limitations](docs/TECHNICAL.md#limitations).

> Results are diagnostic records, not certified evidence or proof that a provider breached a contract. Speed tests use data; frequent unattended tests can use a lot of it, and the optional byte budget checks whether another test may start. One test can exceed it; accounting covers recorded test bytes, not all router traffic.

## Documentation

- [Technical guide](docs/TECHNICAL.md) — building IPKs, CLI, OpenWrt SDK, storage, privacy, development
- [Collector setup and recovery](docs/COLLECTOR.md)
- [Changelog](CHANGELOG.md)
- [Website](https://ddedic.github.io/openwrt-wan-observer/) — project overview

## Contributing

Bug reports, feature requests and small, focused pull requests are welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md). Please never attach real results, screenshots, router backups or configuration exports. Report vulnerabilities via [private security reporting](https://github.com/ddedic/openwrt-wan-observer/security/advisories/new).

## License

The outlined logo uses Manrope under the [SIL Open Font License](docs/assets/MANROPE-OFL.txt). See [third-party notices](docs/TECHNICAL.md#third-party-notices) for bundled UI components.

[MIT](LICENSE) © 2026 Danijel Dedic. Created and maintained by [@ddedic](https://github.com/ddedic). External tools keep their own licenses. Not affiliated with OpenWrt, GL.iNet, Ookla or any ISP.
