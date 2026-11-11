# WAN Observer scope

WAN Observer records internet-connection measurements on OpenWrt routers. Its intended users want repeatable diagnostics and exports for discussions with their provider. It is not affiliated with OpenWrt, GL.iNet, Ookla or a regulator.

## First milestone

- Architecture-independent OpenWrt package, POSIX shell and jq.
- Import complete Ookla JSON results without invoking a network test.
- Normalize bandwidth from bytes/second to decimal Mbps.
- Allowlist numeric metrics and UTC timestamp; discard client/server IP addresses, MACs, ISP/customer labels, hostnames, result URLs and arbitrary backend text.
- Bounded local history, serialized atomic updates, restrictive file permissions.
- Stable JSON and CSV exports. Unknown metrics remain null, not zero.
- Synthetic tests only; no operational data or embedded credentials.

## Subsequent milestones

- Passive WAN counters and CPU/load context; separate before/during/after measurements. Aggregate WAN traffic is not attribution of traffic to individual clients.
- Lightweight multi-target latency checks and explicit failed/skipped-test records.
- Opt-in throughput adapters, explicit endpoints, timeouts, concurrency control, test budget and quiet/busy policy. Do not silently accept third-party terms.
- Configurable contract rates (maximum, normally available and minimum); no universal legal threshold.
- Persistent storage retention, storage-health reporting, power-loss tests and safe removal/export.
- Dashboard, settings and printable report after the designated visual designer's work is reviewed. No visual design is part of this milestone.

## Measurement integrity

Tests must distinguish direct-WAN, VPN and unknown paths. A low result under concurrent traffic is not proof of provider underdelivery. Record time synchronization, backend/version, server choice, link speed, router pressure and missing samples. Compare like-for-like endpoints across multiple days. No automatic firewall changes or interference with existing VPNs.

## Public/private boundary

The public project contains generic code, documentation and synthetic examples. Local history and operator configuration are private by default. Exports deliberately trade some diagnostic detail for safer sharing; they are not a guarantee of anonymity. No telemetry or cloud account requirement.

## Current experimental increment — 2026-11-11

The opt-in collector and temporary desktop preview now implement fixed intervals, UTC windows, bounded degradation follow-ups, sanitized failed-attempt events, a report, print view and SSH-backed schedule controls. Public installation still starts no tests automatically. WAN load/context collection, strict byte budgets, native router UI and firmware package lifecycle validation remain outstanding. See [collector operation](COLLECTOR.md).
