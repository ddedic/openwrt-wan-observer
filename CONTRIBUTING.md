# Contributing

Start with a focused [bug report or feature request](https://github.com/ddedic/openwrt-wan-observer/issues). Explain the problem, installed package version/source commit, router model and exact firmware. For a vulnerability, use [private security reporting](SECURITY.md), not a public issue.

Never attach passwords, tokens, SSH keys, router backups, private addresses, raw test results, real measurement history or private configuration. Use minimal synthetic fixtures and sanitized error codes. Readiness status/check names are useful; inspect and redact all output before posting. Screenshots are optional and must contain only authorized, sanitized information.

## Development and validation

Use the [engineering profile](docs/architecture/technabit-profile.md) for ownership,
naming, dependency direction and the current Technabit adoption scope. With Node 24,
install root development tools using `npm ci` as well as the dashboard dependencies.
Run `npm test` for quality-tool contracts and `npm run lint` for all live JavaScript
(including preview and verification code). After each logical JavaScript edit run
`npm run quality -- --base <starting-commit>`: this includes untracked/renamed files,
checks formatting of supported changed files and checks resolved module boundaries.
An empty JavaScript selection is an error; docs-only work can run full lint instead.
Do not add rule overrides or suppression comments. Format only the files you edit
with the root pinned Prettier; do not mass-format unrelated legacy source.

Focused UI tests live beside their owning modules under `ui/src/`; the UI test
command also retains all existing integration/report tests. See the
[source inventory](docs/architecture/source-inventory.json) for retained files and
the [foundation worklog](docs/worklogs/2026-11-12-technabit-foundation.md) for proof
and pending language/structural checks. JavaScript adoption does not establish
Python/Lua/shell/jq lint compliance. CI keeps their existing behavior/syntax checks.

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
