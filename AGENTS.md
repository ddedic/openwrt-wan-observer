# Repository engineering

Apply the Technabit common/frontend/backend rules through the accepted
[project profile](docs/architecture/technabit-profile.md). Adopted source:
`technabit/technabit-skills@300f61d8bed25f403824ddbbeced633b4bc7804c`;
last upstream check: 2026-11-12. Check before each new packet and weekly while active.

Read the profile and current worklog before editing. Name the owning capability,
public interface and affected checks. Preserve the existing OpenWrt/GL.iNet runtime,
privacy/security contracts and operator-owned state. Do not claim untouched code is
compliant from changed-file checks. See CONTRIBUTING.md for validation commands.

All visual/interaction design belongs to Claude Opus 5.5 and must be presented for
owner review before implementation. Structure-only changes preserve rendering.
Never add AI attribution to commits, pull requests, docs or release material.
