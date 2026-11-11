# Adaptive collector

Experimental. The package does not enable collection during installation. Install and authorize your chosen measurement tool separately; verify its terms permit your use. This adapter supports Ookla CLI JSON output. It does not bundle the binary or accept agreements.

## Setup

Copy this generic example to a **private** file and adjust it for your device. Paths, server choice, interface and plan speeds are operator configuration, not public project defaults.

```json
{
  "enabled": false,
  "interval_minutes": 120,
  "adaptive": false,
  "start_hour": 0,
  "end_hour": 24,
  "download_mbps": 100,
  "upload_mbps": 20,
  "threshold_percent": 80,
  "binary": "/usr/bin/speedtest",
  "server_id": 123,
  "interface": "",
  "quality_history_enabled": false,
  "window_timezone": "UTC",
  "monthly_budget_bytes": 0
}
```

This example leaves scheduled collection disabled, uses a two-hour interval and keeps adaptive follow-ups off. It does not overwrite existing configuration unless you apply it. Keep your existing settings when upgrading. A missing monthly budget means no start guard. Older configurations default to quality history off and UTC windows; omitted optional settings preserve existing saved values when reconfiguring.

`server_id: 123` is illustrative, not a recommended endpoint. Select an available permitted server. A fixed server improves comparisons; it does not isolate server congestion from ISP congestion. Set the interface to the actual WAN device when appropriate. Interface binding is not proof of the complete route; verify routing independently.

```sh
wan-observer-collect configure < /path/to/private-config.json
wan-observer-collect status
```

Configuration is validated JSON, never shell-sourced. Default location: `/etc/wan-observer/collector.json`. Configure retention/storage through the existing CLI environment variables. `timeout` must support `-k`; the package depends on `coreutils-timeout`.

Check `wan-observer-readiness` first. A disabled collector can still report missing binary/scheduler prerequisites; readiness cannot verify licensing or server access. For scheduled speed tests, set `enabled: true`; for passive quality history, set `quality_history_enabled: true`. These are independent opt-ins. Apply your private configuration again and add this **once** for either feature, preserving existing root crontab entries:

```cron
* * * * * /usr/bin/wan-observer-collect tick >/dev/null 2>&1
```

Ensure the router’s cron service is enabled and running. Timing changes become due on the next eligible tick; unchanged saves and changes to plan, threshold, budget or quality-history settings do not add an immediate speed test. Normal tests align with epoch-based interval boundaries. Supported intervals: 15, 30, 60, 120, 180, 240, 360 and 720 minutes. Windows are start inclusive/end exclusive; 0–24 is all day. A start later than the end is an overnight window, for example 22–6. Choose `window_timezone: "UTC"` (legacy default) or `"router"` to use the router’s configured local timezone for window eligibility. Interval spacing remains epoch-based across daylight-saving changes. Weekday selection is not implemented.

Once initial CLI setup is complete, the GL.iNet Settings dialog edits these schedule options, plan/threshold, quality history and the monthly allowance. It does not install the measurement binary, select a server or accept third-party terms.

## Readiness

`wan-observer-readiness` performs local checks without running a test. The root-authenticated GL.iNet GET endpoint returns the same checks in `readiness`, alongside the existing collector and measurement data. Missing or invalid configuration returns `collector: null` and an empty measurements array so setup can be reported without exposing private configuration.

The status distinguishes `config_missing`, `config_invalid`, `disabled`, `binary_missing`, `scheduler_missing`, `scheduler_stopped`, `clock_uninitialized`, and `ready`. Checks report configuration validity, executable availability, presence of the exact once-per-minute root cron recipe above (other expressions report `scheduler_missing`), and whether `pidof crond` finds the scheduler (`unknown` if that utility is unavailable). Additional checks report whether the clock is initialized, available storage in KiB and executable availability; license status remains `unknown`. Router timezone metadata is reported when configured. A disabled collector still reports these checks. Quality-only operation requires cron and an initialized clock but does not require the speed-test executable. `ready` describes these local prerequisites; it does not prove binary licensing, server access, a successful measurement, or future cron execution. Installation creates no operational config or cron entry and starts no service.

## Adaptive behavior

- Download **or** upload below the configured percentage triggers follow-ups. The percentage is an operational threshold, not a legal/contractual test.
- Follow-ups are due five minutes after the prior attempt began, maximum three per burst. Healthy results end the burst early.
- Failed/invalid results also trigger bounded follow-ups. They are separate events, never synthetic zero-speed measurements.
- Maximum 24 follow-ups per UTC day, independent of normal scheduled tests. This is a test-count limit, not a hard data-transfer cap.
- Each attempt times out after 120 seconds, with a forced termination allowance of another 10 seconds.
- A directory lock serializes WAN Observer runs and configuration changes. It does not lock manual tests run outside WAN Observer.
- No automatic failover, VPN changes, firewall changes, QoS changes or external alerts.

A 30-minute schedule means about 48 regular tests per day. At an illustrative 500 MB per test, that is about 24 GB/day before follow-ups. Actual traffic varies substantially. Tests temporarily compete with other users; busy-link detection and CPU context are still missing.

## Actual test bytes and optional budget

Completed results retain actual `download_bytes` and `upload_bytes` when supplied by the measurement tool; missing values stay unknown. `wan-observer-collect status` reports `usage` for the UTC calendar month, including known bytes, unknown attempts and when accounting began. This is partial accounting of collector-run test bytes, not a router traffic meter or a complete historical month. The dashboard estimates scheduled use from recent measured test bytes when available, otherwise from an explicitly labelled 500 MB example. Such projections remain separate from actual accounting.

Add `"monthly_budget_bytes": 10000000000` to a private full configuration and apply it with `configure` to request a 10 GB start guard. The field defaults to `0` (unset). The GL.iNet **Monthly data limit** field accepts whole decimal GB from 1 to 10,000; leave it empty to clear the limit. The CLI accepts whole bytes from 0 to 9,007,199,254,740,991. Existing schedule/plan edits preserve an omitted budget. With a configured budget, the collector refuses to start a manual or scheduled attempt when known bytes have reached the limit or accounting is uncertain. Attempts also require accounting to be saved safely. An allowed test can overshoot the limit by that test's transfer; it is not a hard transfer cap. Missing byte totals, interrupted attempts and tests crossing a UTC month boundary can leave usage unknown. With a configured budget, that uncertainty blocks further starts rather than assuming zero consumption.

## Optional native-quality history

`wan-observer-quality tick` appends one local snapshot from the GL.iNet 4.11 `network-quality` service only when that service is already enabled. It starts no probes and installs no cron entry or service. Unsupported, disabled and error observations remain explicit; no fallback ping/DNS tests run. Enable **Quality history** in GL.iNet Settings or set `quality_history_enabled: true` in the collector configuration to record it through the existing minute cron tick. Recording continues while full speed tests are paused and when the speed-test start guard blocks testing. A running collector lock can skip a minute; this is not continuous coverage. Reads from the dashboard do not append history. Neither the switch nor the CLI starts or enables the native GL service.

```sh
wan-observer-quality tick
wan-observer-quality status
wan-observer-quality list 1440
wan-observer-quality series 7
```

Snapshots retain allowlisted responsiveness, jitter, loss and DNS timing values in private daily files under `/etc/wan-observer/quality`. Retention defaults to 30 UTC calendar days (`WAN_OBSERVER_QUALITY_RETENTION_DAYS`, 1 to 30), capped at 1,440 observations per day. `WAN_OBSERVER_QUALITY_STORE` selects another private location. Native source freshness is unknown: observation time records when the snapshot was read, not when every native value was measured. These values describe sampled quality, not throughput or outage duration. Other firmware interfaces remain unsupported; missing values stay null. The dashboard shows a passive-quality chart and sample counts when history is enabled. Error observations are not outage counts, and snapshots do not drive follow-up speed tests.

`series` accepts exactly `1`, `7` or `30` days and reads existing history without accessing the native service. It returns 180 time bins with counts, median latency/jitter/DNS timing and maximum loss; bins without valid samples have null metrics. Available/error counts describe observations in the requested window. `observed_since_epoch` is the earliest retained observation, not proof of complete monitoring coverage.

## Storage, status and recovery

Measurements remain bounded by the importer’s retention count. Sanitized collector outcomes use the same configured retention count in `collector-events.json`. Legacy coverage is reported as incomplete rather than inventing missing attempts. Read-only status preserves original files; the first later write saves legacy `collector-events.json` once as `collector-events.legacy.json`. Coverage describes the fully observed retained attempt window and cannot recover failures discarded by older versions. Optional collector-generated opaque attempt IDs associate attempts with completed measurements without storing personal identifiers. Sanitized failure codes distinguish interruption, backend exit, timeout, invalid results and storage errors; they do not establish an outage's cause. Runtime state lives under `/tmp/wan-observer-collector`; status shows the next due time and recent outcomes. Reboots retain persisted events/measurements but reset burst/day accounting and schedule an eligible test on the next tick. The package installs an OpenWrt sysupgrade keep list for `/etc/wan-observer/`, including configuration and all default history files. Runtime state under `/tmp` is excluded. Verify the actual firmware backup before upgrading; see [backup and restore](TECHNICAL.md#backup-and-restore).

A hard interruption can leave `.lock`. Confirm no collector or its speed-test child is running before removing the empty runtime lock directory. Failed imports preserve the original measurement history. Writes use atomic replacement, not guaranteed power-loss durability. Flash wear, storage-full conditions and firmware package lifecycle still need broader validation.

## Manual tests and plan speeds

`wan-observer-collect run` performs one attempt in the foreground; `start` takes the collector lock and finishes the attempt in a detached child (used by the GL.iNet **Run Speedtest** button). Both use the configured binary, server, interface and timeout, work while scheduled testing is paused or outside the testing window, and record the reason `manual`. They do not change the next scheduled test, follow-up bursts or the daily follow-up allowance; a degraded or failed manual result starts no follow-ups. While any test holds the lock, other runs, ticks and settings changes are rejected; a scheduled test that falls due meanwhile runs on the next tick. `status` reports `busy` and `manual_started`.

The `schedule` command requires the five fields `enabled`, `adaptive`, `interval_minutes`, `start_hour` and `end_hour`. It also accepts optional paired `download_mbps`/`upload_mbps` (whole numbers 1–100000), `threshold_percent` (whole 1–100), `monthly_budget_bytes`, `quality_history_enabled` and `window_timezone`. Omitted optional fields retain their saved values. Plan/threshold/budget/quality-only changes keep the next scheduled time; the collector uses the saved plan for adaptive detection, and the dashboard and reports use it for comparisons.

Pause scheduled speed tests through the native dashboard, SSH preview or `enabled: false`; quality history has its own independent switch. A running test is allowed to finish; changes during a running test are rejected so the user can retry. To uninstall manual scheduling, remove only the WAN Observer cron entry, then remove the package. Keep/export history first. No other cron entries or network settings need to change.

## Preview

The dashboard’s schedule controls modify the real collector only in explicit SSH mode. Demo/local-history mode cannot schedule tests. The collector configuration is the authority for automatic detection; the GL.iNet dashboard edits the plan speeds there.

The report summarizes recorded tests, not continuous availability. Slow-result groups and later healthy tests do not prove a continuous outage or sustained recovery. The dedicated PDF provides diagnostic records and does not provide regulatory certification.
