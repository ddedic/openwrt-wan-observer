# Adaptive collector

Experimental. The package does not enable collection during installation. Install and authorize your chosen measurement tool separately; verify its terms permit your use. This adapter supports Ookla CLI JSON output. It does not bundle the binary or accept agreements.

## Setup

Copy this generic example to a **private** file and adjust it for your device. Paths, server choice, interface and plan speeds are operator configuration, not public project defaults.

```json
{
  "enabled": false,
  "interval_minutes": 30,
  "adaptive": true,
  "start_hour": 0,
  "end_hour": 24,
  "download_mbps": 100,
  "upload_mbps": 20,
  "threshold_percent": 80,
  "binary": "/usr/bin/speedtest",
  "server_id": 123,
  "interface": ""
}
```

`server_id: 123` is illustrative, not a recommended endpoint. Select an available permitted server. A fixed server improves comparisons; it does not isolate server congestion from ISP congestion. Set the interface to the actual WAN device when appropriate. Interface binding is not proof of the complete route; verify routing independently.

```sh
wan-observer-collect configure < /path/to/private-config.json
wan-observer-collect status
```

Configuration is validated JSON, never shell-sourced. Default location: `/etc/wan-observer/collector.json`. Configure retention/storage through the existing CLI environment variables. `timeout` must support `-k`; the package depends on `coreutils-timeout`.

After enabling collection in the configuration, add this **once**, preserving existing root crontab entries:

```cron
* * * * * /usr/bin/wan-observer-collect tick >/dev/null 2>&1
```

Ensure the router’s cron service is enabled and running. A new/changed configuration runs on the next eligible tick; unchanged saves do not trigger extra tests. Normal tests then align with epoch-based interval boundaries. Supported intervals: 15, 30, 60 and 120 minutes. Windows use UTC, start inclusive/end exclusive; 0–24 is all day. Overnight windows and weekday selection are not implemented.

## Adaptive behavior

- Download **or** upload below the configured percentage triggers follow-ups. The percentage is an operational threshold, not a legal/contractual test.
- Follow-ups are due five minutes after the prior attempt began, maximum three per burst. Healthy results end the burst early.
- Failed/invalid results also trigger bounded follow-ups. They are separate events, never synthetic zero-speed measurements.
- Maximum 24 follow-ups per UTC day, independent of normal scheduled tests. This is a test-count limit, not a hard data-transfer cap.
- Each attempt times out after 120 seconds, with a forced termination allowance of another 10 seconds.
- A directory lock serializes WAN Observer runs and configuration changes. It does not lock manual tests run outside WAN Observer.
- No automatic failover, VPN changes, firewall changes, QoS changes or external alerts.

A 30-minute schedule means about 48 regular tests per day. At an illustrative 500 MB per test, that is about 24 GB/day before follow-ups. Actual traffic varies substantially. Tests temporarily compete with other users; busy-link detection and CPU context are still missing.

## Storage, status and recovery

Measurements remain bounded by the importer’s retention count. Sanitized collector outcomes retain the last 200 attempts in `collector-events.json`. Runtime state lives under `/tmp/wan-observer-collector`; status shows the next due time and recent outcomes. Reboots retain persisted events/measurements but reset burst/day accounting and schedule an eligible test on the next tick. Firmware upgrade preservation is not implemented.

A hard interruption can leave `.lock`. Confirm no collector or its speed-test child is running before removing the empty runtime lock directory. Failed imports preserve the original measurement history. Writes use atomic replacement, not guaranteed power-loss durability. Flash wear, storage-full conditions and firmware package lifecycle still need broader validation.

Pause through the SSH preview or configure `enabled: false`. A running test is allowed to finish; changes during a running test are rejected so the user can retry. To uninstall manual scheduling, remove only the WAN Observer cron entry, then remove the package. Keep/export history first. No other cron entries or network settings need to change.

## Preview

The dashboard’s schedule controls modify the real collector only in explicit SSH mode. Demo/local-history mode cannot schedule tests. Plan/threshold comparisons are under advanced report settings; changing them locally does not change the collector’s detection threshold. The collector configuration is the authority for automatic detection.

The report summarizes recorded tests, not continuous availability. Slow-result groups and later healthy tests do not prove a continuous outage or sustained recovery. Its print view is a diagnostic report, not regulatory certification.
