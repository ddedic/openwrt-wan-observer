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

The browser bundle runs inside the GL.iNet admin panel; it is not a generic LuCI app. Generic OpenWrt users can install the collector alone. The SDK recipe and IPK format do not establish compatibility with every firmware or package manager. The supported test target is GL-MT6000 (Flint 2), firmware 4.11.0; native-quality access is limited to the GL.iNet 4.11 interface.

## Using the router page

After signing in, open **Flow Control → WAN Observer**. **Run Speedtest** starts one immediate test, including while scheduled testing is paused; a reached or unknown configured budget blocks manual starts too. Status separates the latest attempt from the latest successful reading. Failures describe observed errors, without inferring their cause.

**Settings** controls scheduled testing; 15, 30, 60, 120, 180, 240, 360 or 720-minute intervals; all-day or overnight windows in UTC/router time; adaptive follow-ups; plan speeds and slow-below percentage; the optional monthly start guard; and independent passive-quality history. Existing configurations keep their interval, adaptive flag, hours and UTC window semantics. The new quality-history flag defaults false and the budget defaults zero (unset). No binary installation, server setup or license acceptance takes place in the GUI.

The history selector shows 24 hours, 7 days or 30 days. Charts use actual test times and distinguish failures from throughput readings; lines between tests do not measure the intervening time. Optional quality history shows latency, jitter, loss and DNS timing from retained GL Network Quality snapshots, with sample counts rather than uptime or outage claims.

**Export → Download PDF** produces an A4 report with an optional test appendix; **Download CSV** exports the selected period. PDF and CSV timestamps stay in UTC. Dashboard dates use the router's configured IANA timezone when the browser supports it, otherwise explicitly fall back to UTC; a current UTC offset is not enough to infer historical daylight-saving rules. Schedule-window timezone selection is independent of that display fallback. Browser download policies can block exports on untrusted HTTP admin origins.

The visible page refreshes every 30 seconds and when returning to the tab, preserving unsaved settings and bounded manual-test polling. Exports include available jitter, loaded latency, packet loss, actual test bytes and attempt coverage; missing metrics remain unknown. The PDF remains a speed-test report and does not include the optional passive-quality summary.

## Opt-in adaptive collection

See [collector setup and recovery](COLLECTOR.md). The collector uses an existing operator-installed Ookla CLI and `timeout`; it never installs a binary or accepts its terms for you. A cron tick checks the configured schedule. Low results or failed tests can trigger three five-minute follow-ups, bounded by 24 extras per UTC day. Healthy results stop the burst early. Adaptive limits cap test counts. Optional actual-byte accounting and the Settings/CLI monthly budget add a start guard; one allowed test can overshoot it. See [accounting limits](COLLECTOR.md#actual-test-bytes-and-optional-budget).

## Core behaviour

- POSIX shell + jq; no Python, PHP, database server or container runtime on the router.
- Correct bytes-per-second to Mbps conversion for completed Ookla results.
- Optional values stay unknown instead of becoming zero.
- Private local JSONL history, serialized writes and atomic replacement.
- Independent count-based retention for valid measurements and collector attempts (default 1,000 each, maximum 10,000), with explicit incomplete legacy coverage.
- Allowlisted numeric fields, UTC timestamps, sanitized failure codes and optional opaque collector-generated attempt IDs; IP/MAC addresses, hostnames, ISP labels, result links and arbitrary backend fields are discarded.
- CSV export includes actual test bytes when available; absent or invalid byte totals remain unknown.
- Optional native-quality CLI reads an already-enabled GL.iNet 4.11 service without starting probes; [commands and retention](COLLECTOR.md#optional-native-quality-history).

## Router page API

The CGI at `/cgi-bin/wan-observer` uses the existing authenticated GL.iNet root/admin session; it is not a public monitoring API. GET accepts no query (7 days), or exactly `period=1`, `period=7` or `period=30`. It returns `collector`, `measurements`, `readiness` and `quality`; quality history is read only when enabled, with no recording or probes from a GET. Missing/invalid configuration returns `collector: null`, empty measurements and an unconfigured quality state. Unavailable quality leaves speed-test history available; unknown metrics remain null.

POST supports the separate sole-field action `{"action":"run_speedtest"}`, or the schedule fields described in [collector setup](COLLECTOR.md#manual-tests-and-plan-speeds). It rejects unknown fields and invalid values. Optional settings omitted by older clients are preserved. There is no install, license-acceptance, arbitrary command or native-service-enable action.

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

The package installs the history, collector, readiness and optional native-quality CLIs with their jq modules. Installation does not run network tests, bundle Ookla software, accept third-party terms, change DNS/firewall/VPN settings, or enable a daemon. The optional collector invokes an operator-provided binary only after configuration and an explicit manual request or enabled schedule. The SDK recipe has not yet been validated across firmware releases.

## Storage

Default history location: `/etc/wan-observer/history`. It survives normal restarts on typical writable OpenWrt installations. The package provides native sysupgrade preservation for the default `/etc/wan-observer/` directory; verify the backup contract below on the actual firmware before upgrading. Set `WAN_OBSERVER_STORE` to a private directory on persistent external storage if desired. Each import rewrites bounded history; frequent collection increases flash writes. Prefer suitable external storage for long-running deployments.

Files are mode 0600 and the store directory is mode 0700. Do not point the store at an untrusted directory. A hard interruption can leave `.lock`; after confirming no importer is running, remove that empty directory to recover. Atomic rename reduces partial-file risks but does not guarantee durability during sudden power loss. Package removal intentionally leaves history for the owner to export or remove.

## Backup and restore

The package installs `/lib/upgrade/keep.d/wan-observer`, listing `/etc/wan-observer/`. Standard OpenWrt 21.02 sysupgrade recursively includes existing files there: `collector.json`, measurements, persisted attempt/usage history, native-quality daily files, and future state files in that directory. The package also declares `collector.json` as a conffile but ships no operational configuration, so installing/upgrading the IPK supplies no replacement settings. Runtime locks, in-progress tests and timing state under `/tmp/wan-observer-collector` are excluded.

Before upgrading, stop scheduling and allow any running test to finish. Run `sysupgrade -l` and confirm every desired file under `/etc/wan-observer/` appears. Create a private backup using the firmware's standard `sysupgrade -b /path/to/private-backup.tar.gz`, inspect its file list with `tar -tzf /path/to/private-backup.tar.gz`, and copy it off the router. Keep a separate known-good backup before any restore. A system backup may contain router secrets; store it privately.

Restore a trusted, inspected backup through the matching firmware's supported restore flow (`sysupgrade -r /path/to/private-backup.tar.gz` on standard OpenWrt). This restores system configuration as well as WAN Observer files; it is not a WAN Observer-only importer. Verify configuration and history before explicitly resuming scheduling. Package installation performs no restore and overwrites no operator state.

This keep list follows the [OpenWrt 21.02 sysupgrade implementation](https://github.com/openwrt/openwrt/blob/openwrt-21.02/package/base-files/files/sbin/sysupgrade); it is not proof that every GL.iNet firmware preserves state. Reset/no-keep upgrades discard it. External storage paths selected through environment variables require a separate backup. Packages, the operator's licensed measurement binary, and root cron policy require their own preservation/reinstallation checks. No firmware flash, reboot, or hardware restore has been validated by the offline lifecycle tests.

### Roll back or remove

Before changing package versions, pause scheduled tests, let any running test finish, export needed reports and make a private backup of configuration/history. Retain the exact matching core and UI IPKs from the previous known-good release. Follow the firmware's supported package downgrade procedure for both packages together, then check configuration, history and readiness before resuming. Older versions may not understand newer fields or formats; no automatic reverse migration is promised. Preserve the current backup separately rather than overwriting it with an older snapshot.

To remove WAN Observer, remove only its cron entry and uninstall `wan-observer-glinet` and `wan-observer` through the firmware package manager. Default history is intentionally retained. Do not delete `/etc/wan-observer/` unless you have independently decided to discard that private data. Router reset, no-keep firmware upgrade and arbitrary downgrade are not preservation guarantees.

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

## Website

The project site at <https://ddedic.github.io/openwrt-wan-observer/> is one static page in `site/`: HTML, CSS and the self-hosted Manrope font. It has no JavaScript, trackers or external requests; the product views switch with CSS only.

The **Website** workflow (`.github/workflows/pages.yml`) runs on pushes to `main` that touch `site/`, `docs/assets/` or the workflow, and on manual dispatch. It assembles `_site/` from the page, the self-hosted font and social-preview image in `site/assets/`, and the public screenshots and logos in `docs/assets/` (copied unchanged). It checks that every local `href`/`src` and every absolute `https://ddedic.github.io/openwrt-wan-observer/assets/` social-metadata URL exists in the artifact, then deploys with the official Pages actions pinned to commit SHAs. Replacing an approved capture in `docs/assets/` therefore updates the README and the site together.

Preview the same artifact locally:

```sh
mkdir -p /tmp/wan-observer-site/assets
cp site/index.html site/styles.css /tmp/wan-observer-site/
cp site/assets/manrope-latin-wght.woff2 site/assets/social-preview.png \
   docs/assets/dashboard.png docs/assets/settings.png \
   docs/assets/logo-dark.svg docs/assets/icon.svg docs/assets/MANROPE-OFL.txt /tmp/wan-observer-site/assets/
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/wan-observer-site
```

## Development

Install a POSIX shell, jq, Python 3, Node/npm, Lua 5.1 and its matching lua-cjson module. On Debian/Ubuntu, `sudo apt-get install jq lua5.1 lua-cjson` supplies the CGI test dependencies. CGI tests execute the actual Lua entry point with real cjson and synthetic ubus/process boundaries; they do not need a router.

```sh
python3 -m unittest discover -s tests -v
sh -n package/wan-observer/files/wan-observer
sh -n package/wan-observer/files/wan-observer-collect
sh -n package/wan-observer/files/wan-observer-readiness
sh -n package/wan-observer/files/wan-observer-quality
luac5.1 -p package/wan-observer-glinet/files/wan-observer.cgi
npm --prefix package/wan-observer-glinet/ui test
```

Tests are synthetic and offline. Python is only a development dependency.

## Third-party notices

The project code and original logo composition use the [MIT license](../LICENSE), copyright © 2026 Danijel Dedic. The outlined Manrope wordmark retains its [SIL OFL 1.1 notice](assets/MANROPE-OFL.txt); no runtime font download is required. The website self-hosts the Manrope font file under the same licence.

The bundled UI uses jsPDF and esbuild-generated third-party license notices. Preserve the emitted `view.js.LEGAL.txt` when packaging. The GitHub footer icon uses [Octicons](https://github.com/primer/octicons) under MIT, copyright © 2026 GitHub Inc.; its [notice](../package/wan-observer-glinet/files/OCTICONS-LICENSE.txt) is included in the UI package. [Source provenance and notices](../THIRD_PARTY_NOTICES.md) are retained in the repository. The operator-installed Ookla CLI is separate and is not covered by the project MIT license.

## Limitations

- Speed tests are samples. Gaps are unmeasured time; failed tests do not establish an outage or its cause.
- Concurrent traffic, VPN routing, server choice and router load can affect results. Whole-router traffic and router-load context are not recorded.
- Actual test-byte accounting is partial; unknown attempts block a configured budget. A start guard permits one-test overshoot and does not cap whole-router data use. The displayed data-use estimate is illustrative.
- Optional native-quality snapshots have unknown source freshness and do not prove throughput or outage duration. Recording is opt-in and can have gaps while the collector is busy; passive snapshots do not trigger full tests.
- Reports support troubleshooting; they are not certified measurements or findings of a contract breach.
- Native integration was checked on Flint 2 firmware 4.11.0. Other firmware releases, mobile behavior and firmware-upgrade preservation need further validation.

## Roadmap

| Stage | Status |
| --- | --- |
| Normalize existing results, bounded history, CSV | Available; synthetic tests and hardware smoke test |
| GL.iNet SDK4 router dashboard and direct PDF | 0.5.0-1 installed and checked on Flint 2 firmware 4.11.0; 98 Python/Lua and 48 JavaScript tests pass |
| Opt-in collection with adaptive follow-ups | Count caps and optional CLI byte start guard; partial accounting |
| Disposable local dashboard and browser printing | Developer-only |
| OpenWrt SDK build and package lifecycle | Not yet verified |
| Native-quality history | Optional GL.iNet 4.11 snapshots, Settings/CLI opt-in through the minute tick; no extra WAN probes |
| Whole-router traffic and router load | Planned |
