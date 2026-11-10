# WAN Observer

Reusable internet-performance history for OpenWrt routers.

**Early development — headless foundation only.** The current package imports existing Ookla JSON, stores a bounded history and exports CSV. Continuous collection, scheduling, a dashboard and printable reports are planned; they are **not implemented yet**. No background service or network test starts on installation.

The goal is to help people understand recurring connection problems and share useful measurements with their provider. Results are diagnostic records, not certified evidence or proof that a provider breached a contract.

## Available now

- POSIX shell + jq; no Python, PHP, database server or container runtime on the router.
- Correct bytes-per-second to Mbps conversion for completed Ookla results.
- Optional values stay unknown instead of becoming zero.
- Private local JSONL history, serialized writes and atomic replacement.
- Retention by imported-record count (default 1,000, maximum 10,000).
- Allowlisted numeric fields and UTC timestamps; IP/MAC addresses, hostnames, ISP labels, result links and arbitrary backend fields are discarded.
- CSV export with stable columns.

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

The package installs `/usr/bin/wan-observer` and its jq module. It does not bundle or run Ookla software, accept third-party terms, change DNS/firewall/VPN settings, or enable a daemon. The SDK recipe has not yet been validated across firmware releases; no prebuilt release is published.

Default history location: `/etc/wan-observer/history`. It survives normal restarts on typical writable OpenWrt installations. Firmware upgrade preservation is not implemented yet. Set `WAN_OBSERVER_STORE` to a private directory on persistent external storage if desired. Each manual import rewrites bounded history; suitability for frequent unattended collection must be addressed before the scheduler milestone.

Files are mode 0600 and the store directory is mode 0700. Do not point the store at an untrusted directory. A hard interruption can leave `.lock`; after confirming no importer is running, remove that empty directory to recover. Atomic rename reduces partial-file risks but does not guarantee durability during sudden power loss. Package removal intentionally leaves history for the owner to export or remove.

## Privacy

No telemetry, cloud account, real network fixtures or stored credentials. Existing measurement tools may contact external services under their own terms. This foundation itself makes no network requests.

Normalized data still reveals times, performance and a public test-server ID. Review exports before sharing. Raw source files remain your responsibility; WAN Observer does not delete them. Never put real results, screenshots, router backups or configuration exports in an issue or pull request.

## Development

```sh
python3 -m unittest discover -s tests -v
sh -n package/wan-observer/files/wan-observer
```

Tests are synthetic and offline. Python is only a development dependency.

See [scope](docs/SCOPE.md), [upstream research](docs/RESEARCH.md) and [contributing](CONTRIBUTING.md). Not affiliated with OpenWrt, GL.iNet, Ookla or any ISP. License: MIT; external tools retain their own licenses.
