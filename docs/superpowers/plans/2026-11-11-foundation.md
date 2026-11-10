# WAN Observer foundation implementation plan

**Goal:** Publish a reusable OpenWrt package foundation with tested, privacy-minimizing imports and exports.

**Architecture:** POSIX shell coordinates jq normalization and bounded atomic JSONL history. A separate future LuCI package consumes the stable measurement format. No daemon, external request or throughput test runs in this milestone.

**Tech stack:** shell, jq 1.6+, OpenWrt SDK package recipe; Python unittest on development machines only.

**Spec:** [Scope](../../SCOPE.md), [research](../../RESEARCH.md).

- [x] Write synthetic tests for byte conversion, unknown values, privacy stripping, invalid/partial input, storage retention and CSV safety. Observe failure before implementation.
- [x] Implement normalizer, import/list/export CLI, bounded atomic store and fail-closed validation.
- [x] Add package recipe, license, contribution/privacy guidance and CI; run tests and shell syntax checks.
- [ ] Audit the complete staged file set and commit metadata for private content before creating/pushing the public repository.

Review focus: incomplete test results must not become successes; units must not understate throughput by 8x; unknown loss must not become 0%; backend-supplied strings and links must not leak; failed imports must not alter history. Dashboard design, live scheduling and firmware deployment are separate milestones.
