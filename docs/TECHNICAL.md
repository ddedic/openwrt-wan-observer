# WAN Observer — technical guide

Build, CLI and operational details for developers and router administrators.

## Build the IPKs

Builds OpenWrt 21.02-style IPKs for both packages on your computer:

```sh
npm --prefix package/wan-observer-glinet/ui ci
npm --prefix package/wan-observer-glinet/ui run build
npm --prefix package/wan-observer-glinet/ui test
python3 tools/build-ipk.py
```

The browser bundle runs inside the GL.iNet admin panel. Generic OpenWrt users can install the collector alone.

## Using the router page

After signing in, open **Flow Control → WAN Observer**. **Run Speedtest** runs one immediate test (also while scheduling is paused). **Settings** pauses/resumes collection, changes testing hours and frequency, toggles adaptive follow-ups and edits the plan download/upload speeds used for comparisons. The history period controls the charts, test list and exports. **Export → Download PDF** generates a dedicated A4 report with an optional detailed appendix; **Download CSV** exports the selected period. Browser download policies can block exports on untrusted HTTP admin origins.

## Opt-in adaptive collection

See [collector setup and recovery](COLLECTOR.md). The collector uses an existing operator-installed Ookla CLI and `timeout`; it never installs a binary or accepts its terms for you. A cron tick checks the configured schedule. Low results or failed tests can trigger three five-minute follow-ups, bounded by 24 extras per UTC day. Healthy results stop the burst early. Limits are test counts; there is no enforced byte budget.

## Core behaviour

- POSIX shell + jq; no Python, PHP, database server or container runtime on the router.
- Correct bytes-per-second to Mbps conversion for completed Ookla results.
- Optional values stay unknown instead of becoming zero.
- Private local JSONL history, serialized writes and atomic replacement.
- Retention by imported-record count (default 1,000, maximum 10,000).
- Allowlisted numeric fields and UTC timestamps; IP/MAC addresses, hostnames, ISP labels, result links and arbitrary backend fields are discarded.
- CSV export with stable columns.

## CLI (try locally)

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

## OpenWrt SDK package

Place `package/wan-observer` inside a matching OpenWrt SDK's `package/` directory, make the packages feed containing jq available, select `wan-observer`, then build:

```sh
make package/wan-observer/compile V=s
```

The package installs `/usr/bin/wan-observer` and its jq module. Installation does not run network tests, bundle Ookla software, accept third-party terms, change DNS/firewall/VPN settings, or enable a daemon. The optional collector invokes an operator-provided binary only after explicit configuration and scheduling. The SDK recipe has not yet been validated across firmware releases.

## Storage

Default history location: `/etc/wan-observer/history`. It survives normal restarts on typical writable OpenWrt installations. Firmware upgrade preservation is not implemented yet. Set `WAN_OBSERVER_STORE` to a private directory on persistent external storage if desired. Each import rewrites bounded history; frequent collection increases flash writes. Prefer suitable external storage for long-running deployments.

Files are mode 0600 and the store directory is mode 0700. Do not point the store at an untrusted directory. A hard interruption can leave `.lock`; after confirming no importer is running, remove that empty directory to recover. Atomic rename reduces partial-file risks but does not guarantee durability during sudden power loss. Package removal intentionally leaves history for the owner to export or remove.

## Privacy

No telemetry, cloud account, real network fixtures or stored credentials. Existing measurement tools may contact external services under their own terms. The importer makes no network requests. Opt-in collection runs the configured external tool; SSH preview mode connects only to the explicitly configured router.

Normalized data still reveals times, performance and a public test-server ID. Review exports before sharing. Raw source files remain your responsibility; WAN Observer does not delete them.

## Developer desktop preview

Developer-only; separate from the OpenWrt package. Requires Python 3.9+; no router or speed test needed:

```sh
python3 tools/preview.py
```

Open **http://127.0.0.1:8765**. The default view is labelled **synthetic demo** (download/upload charts, plain-language report, event sequence, print view, CSV). Stop with Ctrl+C. Add `--store /path/to/history` to read a local snapshot of imported history (requires jq); Refresh reloads that snapshot and does not fetch from a router.

To view a configured router and change its schedule through existing SSH access:

```sh
python3 tools/preview.py --ssh-target root@router.example --identity ~/.ssh/router_key
```

Use that exact address for schedule saves. Credentials remain with SSH; no key is uploaded to the browser or router. It listens only on loopback, serves fixed routes, and in SSH mode its schedule API requires a same-origin request and a per-session token. It runs with your SSH account's privileges: do not deploy it as a server or expose it through a proxy or tunnel. The collector continues when the preview is closed.

## Development

```sh
python3 -m unittest discover -s tests -v
sh -n package/wan-observer/files/wan-observer
sh -n package/wan-observer/files/wan-observer-collect
npm --prefix package/wan-observer-glinet/ui test
```

Tests are synthetic and offline. Python is only a development dependency.

## Roadmap

| Stage | Status |
| --- | --- |
| Normalize existing results, bounded history, CSV | Available; synthetic tests and hardware smoke test |
| GL.iNet SDK4 router dashboard and direct PDF | Verified on Flint 2 firmware 4.11.0 (0.4.1) |
| Opt-in collection with adaptive follow-ups | Available; count caps, no enforced byte budget |
| Disposable local dashboard and browser printing | Developer-only |
| OpenWrt SDK build and package lifecycle | Not yet verified |
| WAN traffic, router load and measurement context | Planned |
