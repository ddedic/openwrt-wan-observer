# Security and privacy

This is pre-release software. Do not expose a future administration interface publicly. The router CLI has no listener or remote API. The optional desktop preview has a loopback listener (read-only by default; explicit SSH mode can change collector schedules); never expose it through a proxy, tunnel or public interface.

Report vulnerabilities using GitHub private vulnerability reporting when available. If it is unavailable, open an issue requesting a private contact channel without disclosing exploit details, credentials or real measurement data.

Protect local history and any exported reports. The normalizer deliberately drops backend identities and result links, but numeric measurements and timestamps are still potentially sensitive. No tool can promise that a report is anonymous in every context.

The SSH preview holds a session token in memory and enforces Host, Origin and token checks on schedule writes. It permits only schedule fields, not executable or interface changes. SSH mode inherits the configured account’s authority: use it only on a trusted computer, close it when finished, and never proxy it to another network. Collector configuration is trusted operator data.
