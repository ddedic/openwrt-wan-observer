# WAN Observer

Internet slow again? Keep a history you can inspect, export and discuss with your provider.

[![Offline tests](https://github.com/ddedic/openwrt-wan-observer/actions/workflows/test.yml/badge.svg)](https://github.com/ddedic/openwrt-wan-observer/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

WAN Observer is a lightweight, local-first internet-performance history tool for OpenWrt routers. Built for small devices, with portable exports and no cloud account.

> **Status: experimental.** The router package imports results, exports CSV and includes an opt-in adaptive collector. A temporary desktop dashboard shows reports and can control a connected router’s schedule. A native router dashboard is on the roadmap. There are no stable or prebuilt releases yet.

[Try the preview](#dashboard-preview) · [Use the CLI](#try-locally) · [Roadmap](#roadmap) · [Contribute](CONTRIBUTING.md)

The goal is to help people understand recurring connection problems and share useful measurements with their provider. Results are diagnostic records, not certified evidence or proof that a provider breached a contract.

## Available now

- POSIX shell + jq; no Python, PHP, database server or container runtime on the router.
- Correct bytes-per-second to Mbps conversion for completed Ookla results.
- Optional values stay unknown instead of becoming zero.
- Private local JSONL history, serialized writes and atomic replacement.
- Retention by imported-record count (default 1,000, maximum 10,000).
- Allowlisted numeric fields and UTC timestamps; IP/MAC addresses, hostnames, ISP labels, result links and arbitrary backend fields are discarded.
- CSV export with stable columns.

## Dashboard preview

Requires Python 3.9+ on your development computer. No router connection or speed test is needed:

```sh
git clone https://github.com/ddedic/openwrt-wan-observer.git
cd openwrt-wan-observer
python3 tools/preview.py
```

Open **http://127.0.0.1:8765**. The default view is prominently labelled **synthetic demo**, with separate download/upload charts, a plain-language report, event sequence, print view and CSV export. Stop with Ctrl+C.

To inspect your already imported history instead, add `--store /path/to/history`. This reads a local snapshot; Refresh reloads that snapshot. It does not fetch new results from a router. Imported history additionally requires jq.

This temporary developer UI is separate from the OpenWrt package. It listens only on loopback, serves fixed routes, and is read-only unless explicitly connected through SSH. In SSH mode its schedule API requires a same-origin request and a per-session token. Do not deploy it as a production server or expose it through a proxy or tunnel. The final router interface is a later milestone.

## Try locally

Requirements: jq 1.6+ and a POSIX shell with BusyBox-compatible `head -c`, `mktemp` and `tail -n` utilities.

```sh
export WAN_OBSERVER_LIB="$PWD/package/wan-observer/files"
export WAN_OBSERVER_STORE="$PWD/.local/history"
sh package/wan-observer/files/wan-observer normalize-ookla < /path/to/result.json
sh package/wan-observer/files/wan-observer import-ookla < /path/to/result.json
sh package/wan-observer/files/wan-observer list
sh package/wan-observer/files/wan-observer export-csv > /path/to/private-report.csv
```

Input must be a single completed JSON object with `type: result`, a UTC whole-second timestamp, and numeric download/upload bandwidth. Input is limited to 1 MiB. Unsupported timestamps or partial/progress records are rejected rather than guessed. This is not a raw JSONL progress-stream importer.

Set `WAN_OBSERVER_MAX_RECORDS` to a count from 1 to 10,000. Retention keeps the most recently **imported** records, not the newest timestamps; duplicates are not yet deduplicated.

## OpenWrt package

Place `package/wan-observer` inside a matching OpenWrt SDK's `package/` directory, make the packages feed containing jq available, select `wan-observer`, then build:

```sh
make package/wan-observer/compile V=s
```

The package installs `/usr/bin/wan-observer` and its jq module. Installation does not run network tests, bundle Ookla software, accept third-party terms, change DNS/firewall/VPN settings, or enable a daemon. The optional collector invokes an operator-provided binary only after explicit configuration and scheduling. The SDK recipe has not yet been validated across firmware releases; no prebuilt release is published.

Default history location: `/etc/wan-observer/history`. It survives normal restarts on typical writable OpenWrt installations. Firmware upgrade preservation is not implemented yet. Set `WAN_OBSERVER_STORE` to a private directory on persistent external storage if desired. Each manual import rewrites bounded history; frequent collection increases flash writes. Prefer suitable external storage for long-running deployments.

Files are mode 0600 and the store directory is mode 0700. Do not point the store at an untrusted directory. A hard interruption can leave `.lock`; after confirming no importer is running, remove that empty directory to recover. Atomic rename reduces partial-file risks but does not guarantee durability during sudden power loss. Package removal intentionally leaves history for the owner to export or remove.

## Privacy

No telemetry, cloud account, real network fixtures or stored credentials. Existing measurement tools may contact external services under their own terms. The importer makes no network requests. Opt-in collection runs the configured external tool; SSH preview mode connects only to the explicitly configured router.

Normalized data still reveals times, performance and a public test-server ID. Review exports before sharing. Raw source files remain your responsibility; WAN Observer does not delete them. Never put real results, screenshots, router backups or configuration exports in an issue or pull request.

## Development

```sh
python3 -m unittest discover -s tests -v
sh -n package/wan-observer/files/wan-observer
sh -n package/wan-observer/files/wan-observer-collect
```

Tests are synthetic and offline. Python is only a development dependency.

See [scope](docs/SCOPE.md), [upstream research](docs/RESEARCH.md) and [contributing](CONTRIBUTING.md). Not affiliated with OpenWrt, GL.iNet, Ookla or any ISP. License: MIT; external tools retain their own licenses.

## Roadmap

| Stage | Status |
| --- | --- |
| Normalize existing results, bounded history, CSV | Available; synthetic tests and hardware smoke test |
| Disposable local dashboard | Available for development; synthetic demo and local history |
| OpenWrt SDK build and package lifecycle | Not yet verified |
| Opt-in collection with adaptive follow-ups | Available; count caps, no enforced byte budget |
| WAN traffic, router load and measurement context | Planned |
| Temporary desktop report and browser printing | Available; final UI pending |
| Native router dashboard | Planned |

See [scope and limitations](docs/SCOPE.md) for the delivery boundaries. Feature requests and small, focused contributions are welcome. Start with [contributing](CONTRIBUTING.md); report vulnerabilities through [private security reporting](https://github.com/ddedic/openwrt-wan-observer/security/advisories/new).

## Maintainer and license

Created and maintained by [Danijel Dedic (@ddedic)](https://github.com/ddedic). Copyright © 2026 Danijel Dedic. Released under the [MIT License](LICENSE).

## Opt-in adaptive collection

See [collector setup and recovery](docs/COLLECTOR.md). The collector uses an existing operator-installed Ookla CLI and `timeout`; it never installs a binary or accepts its terms for you. A cron tick checks the configured schedule. Low results or failed tests can trigger three five-minute follow-ups, bounded by 24 extras per UTC day. Healthy results stop the burst early.

To view a configured router and change its schedule through your existing SSH access:

```sh
python3 tools/preview.py --ssh-target root@router.example --identity ~/.ssh/router_key
```

Open `http://127.0.0.1:8765` using that exact address for schedule saves. Credentials remain with SSH; no key is uploaded to the browser or router. This is a temporary local development bridge with the privileges of your SSH account. Do not expose it publicly. The collector continues when the preview is closed.
