# Native pre-merge validation — 12 November 2026

Candidate runtime source: `aa4cdc62088e7422370470561479e27f94306cfb`.
The owner explicitly authorized actual-device testing after the offline merge
assessment. Used existing project SSH access and the existing administrator
credential through its assigned vault; no credential changes or new accounts.
Target confirmed as GL.iNet GL-MT6000 (Flint 2), firmware 4.11.0, Lua 5.1.5.
No merge, release, firmware update, reboot or WAN speed test was performed.

## Research and delivery

Reused the firmware's installed opkg and existing project deployment recipe.
The OpenWrt documentation endpoint denied automated access; inspected official
[opkg command source](https://raw.githubusercontent.com/openwrt/opkg-lede/master/src/opkg-cl.c)
and confirmed installed help supports `--force-reinstall` and `--noaction`.
Previewed reinstall, then installed only the two local hash-verified 0.5.3-1 IPKs
through ordinary dependency checks. No dependency bypass or global upgrade.
A verified private mode-0600 rollback archive preserves previous application files,
package metadata and application data; recovery copies remain available privately.
No secrets, live history or raw device screenshots are committed.

Both installed packages retain the same version as the earlier main build, so
version labels alone are insufficient proof. Checked every installed file against
the candidate IPK contents: all 9 collector and 15 admin files match exactly.
The default firmware Lua module path loads `wan_observer.application` successfully.
Candidate package SHA256 values:

- Collector: `ab0b17c26729f2ae83a0f4711be9c2d11c22d1d71a08f12a38c21e8c113db6b7`.
- Admin: `ab746a9135457fb80cb42519c7e39f8c87956b88b8cfb0930a1a94eff75b625c`.

## Actual firmware and browser checks

Used ordinary GL.iNet password login in a task-owned Chromium session. Opened WAN
Observer through Flow Control in the real firmware admin panel; no synthetic UI
host, mocked application API or replacement native components were used.

- Installed page loads real history, charts and readiness without application errors.
- Authenticated HTTP GET returns 200 with valid dashboard/readiness payloads for
  periods 1, 7 and 30; history-period controls also operate in the native page.
- Missing session header returns 401. Invalid action and period return 400.
- Settings edit, dirty cancel, Keep editing, Discard, focus restoration and a real
  unchanged Save succeed. The save reaches the installed CGI and shows confirmation.
- Export downloads produce a valid nonempty CSV with the expected schema and a
  nonempty PDF with a PDF signature. Raw files remain private.
- Export dialog Tab wraps and retains focus; Escape closes the dialog.
- At a 390×844 viewport the native settings dialog and controls fit, focus is
  inside the dialog, and the page has no horizontal overflow. This is a resized
  Chromium viewport, not a physical-phone or assistive-technology claim.
- Desktop history/footer remain reachable through the actual firmware scroll
  container. Native desktop and mobile screenshots were inspected privately.

## Actual detached worker without WAN traffic

The installed CGI, installed Lua modules, installed CLI and real firmware session
service were exercised through a temporary authenticated CGI wrapper. Its only
change was exporting isolated temporary configuration/runtime/history paths and a
fake result backend. No production command adapter or application module was edited.

The real HTTP manual-start request returned 202; an overlapping start returned 409.
After the request ended, the real BusyBox detached worker completed exactly once,
imported one synthetic measurement, released its lock, and left the isolated next
scheduled timestamps unchanged. This tests the refactored worker on actual firmware
without running the licensed measurement engine or generating WAN test traffic.
The wrapper and its temporary store/runtime were removed by the owning test trap.

## Preservation and completion

After installation and again after settings/API/browser/worker checks:
configuration, root cron and scheduler state are byte-identical to pre-install
copies. All eight persistent application files also match the rollback snapshot.
The live collector is idle. Its existing operator-owned schedule remains active.
The task-created admin session was logged out and verified invalid; task browser
closed. Candidate upload directory and temporary CGI endpoint are removed.
The tested candidate remains installed; rollback copies are preserved.

Private evidence: `.local/live-validation/`, including the rollback archive,
installed manifest, install preview/result, native downloads/screenshots and
isolated worker assertions. Nothing from these private captures is public material.

Retained harness corrections: initial backup failed before installation because
relative metadata globs expanded outside `/`; corrected the working directory and
validated the complete archive before proceeding. Early API probes used `days=`
instead of the actual `period=` contract and expected 403 rather than the specified
401 for a missing token. Corrected assertions passed. Browser probes also corrected
hidden firmware-dialog selection, raw-selector syntax, a repeated eval binding and
screenshot argument handling. These were verification-harness errors; no product
source or runtime behavior was changed to make checks pass.

Conclusion: no regression found in the actual-device paths above. Existing offline
proof remains 125 Python, 79 UI, 24 tooling and two synthetic browser tests; independent
full-main review found no actionable regression, with 14 rendered scenarios and 288
report/CSV equivalence cases matching main. Full SDK compilation, firmware restore,
other device/firmware compatibility and a real WAN speed test remain outside this proof.
