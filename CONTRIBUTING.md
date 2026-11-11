# Contributing

Start with a focused [bug report or feature request](https://github.com/ddedic/openwrt-wan-observer/issues). Explain the problem, installed package version/source commit, router model and exact firmware. For a vulnerability, use [private security reporting](SECURITY.md), not a public issue.

Never attach passwords, tokens, SSH keys, router backups, private addresses, raw test results, real measurement history or private configuration. Use minimal synthetic fixtures and sanitized error codes. Readiness status/check names are useful; inspect and redact all output before posting. Screenshots are optional and must contain only authorized, sanitized information.

## Development and validation

See the [technical guide](docs/TECHNICAL.md#development) for prerequisites and exact offline test commands. Run the Python/Lua contracts, shell syntax checks and UI tests; build the UI and IPKs when package content changes. These checks do not require a live speed test. State which tests you ran and mark untested assumptions explicitly.

- Add regression coverage for parsing, units, privacy and persistence changes.
- Keep changes focused and preserve existing operator configuration and history.
- Keep runtime dependencies suitable for routers; no external tests on install.
- Do not redistribute speed-test binaries or accept third-party terms for users.
- Keep server, interface, plan and schedule operator-configurable.
- For UI changes, explain keyboard and small-screen verification; distinguish local synthetic previews from actual router captures.
- Name the SDK and real firmware actually tested. A package recipe or fixture does not establish universal compatibility.

Before adding a dependency or adapter, check maintained upstream solutions, compatibility, license and router footprint. Explain why reuse or a small adaptation does or does not cover the change. Keep private deployment notes and operational data out of the public tree.

Code contributions use the repository's MIT license. Preserve upstream copyright/license notices and explain new third-party licensing in the pull request.
