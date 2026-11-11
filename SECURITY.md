# Security and privacy

WAN Observer is experimental. Security fixes target the current prerelease; older versions are not maintained separately. Include the installed package version or source commit in a report.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/ddedic/openwrt-wan-observer/security/advisories/new). Include affected versions, minimal reproduction steps using synthetic data, expected impact and any suggested mitigation. Do not include passwords, tokens, SSH keys, router backups, private addresses, raw speed-test output or real measurement history. Do not post exploit details in public issues. If the private form becomes unavailable, open a public issue asking for a private contact channel, without vulnerability details.

## Trust boundary

The optional GL.iNet router page has a CGI endpoint authorized through the router's root/admin session and protected writes. Keep the router administration interface on a trusted network; do not expose it publicly. The core CLI itself has no listener. Collector configuration is trusted operator data: it selects an executable run with the invoking account's authority. Install third-party measurement tools only from sources you trust and review their terms yourself.

The developer desktop preview listens on loopback. It is read-only by default; explicit SSH mode can change collector schedules and inherits the SSH account's privileges. It keeps a session token in memory and checks Host, Origin and token on schedule writes. Use it only on a trusted computer, close it when finished, and never expose it through a proxy, tunnel or public listener.

## Data handling

The importer discards backend IP/MAC addresses, hostnames, ISP labels and result links. Normalized measurements, timestamps and test-server IDs can still be sensitive. Review PDF/CSV exports before sharing; no report is guaranteed anonymous. Protect private configuration, local history and backups. A system backup can contain unrelated router secrets. WAN Observer does not delete original source files or prevent the external speed-test tool from contacting its own services.
