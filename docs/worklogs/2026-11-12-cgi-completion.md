# CGI ownership completion — 12 November 2026

Source base: `725a94dabd067948983b35cc0c969b48c38399ec`.
Owner: GL.iNet admin integration. Public interface remains the installed
`/www/cgi-bin/wan-observer` HTTP endpoint; session, GET period, settings and manual
speedtest contracts remain unchanged. The collector retains write/lock ownership.
Affected checks: actual CGI contracts, module boundary tests and installed-IPK
module loading, then the coordinator's language checks and full integration run.

## Focused research and reuse decision

Checked 12 November 2026 before implementation:

- Lua 5.1 module/package API: <https://www.lua.org/manual/5.1/manual.html#5.3>.
  `require` loads named modules through `package.path` and caches returned tables.
- Actual Lua 5.1.5 loader implementation:
  <https://www.lua.org/source/5.1/loadlib.c.html>. Reuse its ordinary file loader;
  no custom loader, executable subprocess framework or new interpreter is needed.
- Maintained OpenWrt LuCI runtime:
  <https://github.com/openwrt/luci/blob/master/modules/luci-lua-runtime/luasrc/dispatcher.lua>.
  Inspected upstream source: it uses `require` and `/usr/lib/lua` namespaces but its
  auth context is LuCI-specific. Adopting that dispatcher would introduce unrelated
  runtime/dependency/auth semantics. Keep existing GL session ubus integration.
- Technabit source HEAD checked with `git ls-remote` and still equals adopted
  `300f61d8bed25f403824ddbbeced633b4bc7804c`.

Decision: adapt the existing application operations into explicit Lua 5.1 modules
and reuse installed cjson/ubus. No copied LuCI implementation, new dependency or
license obligation. Lua remains the existing MIT runtime. Small application modules
cover the demonstrated gap: independent ownership of auth, HTTP, service policy,
command execution and request/quality validation. Hardware/kernel requirements do
not change. Actual firmware module search path/loading remains untested on device;
local tests simulate the installed `/usr/lib/lua` tree explicitly.

Dependency direction: CGI → application composition → HTTP/auth/command adapter;
HTTP → pure schedule validation and service port; service → supplied command port
and quality projection; command adapter → pure schedule serialization. Pure JSON,
schedule and quality validation modules have no HTTP, shell or environment effects.
No request-supplied module path or additional environment trust bypass is added.

## Implementation and bounded proof

The CGI entry is now three lines. Eight occupied modules own application
composition, authentication, HTTP response/request mapping, service orchestration,
command execution, schedule serialization, JSON object decoding and quality
validation. Authentication returns a verified session or finite failure category;
service operations return finite outcomes and dashboard projection data. HTTP
alone maps those outcomes to HTTP statuses and public errors. Process execution
exists only in the command adapter, whose public methods cannot accept an
arbitrary shell command. Schedule serialization validates again at that boundary.
GET operations use readiness/status/list/quality-read ports only.

The namespace `wan_observer` uses ordinary Lua 5.1 `require`; nonidentifier leaf
names (`json-object`, `quality-projection`) are string module names and map directly
to their correspondingly named `.lua` files. No Lua identifier or newer syntax is
required. The builder installs every module under `/usr/lib/lua/wan_observer` with
mode 0644 and retains executable CGI mode 0755. Router dependencies are unchanged.
Test harnesses explicitly supply either source or extracted-install `LUA_PATH`;
production does not introduce test/environment configuration.

Retained every original CGI assertion and updated its dashboard report import to
`ui/src/measurements/report-data.js`. Added four direct module-boundary contracts:
exact session ubus arguments and cleanup after call failure; command rejection and
pipe cleanup after read failure; service operation through injected ports without
HTTP environment/process access; HTTP rejection before reading/calling services.
All 13 existing CGI HTTP tests additionally run against an actual freshly built
and extracted admin IPK. Two packaging tests verify complete module bytes/modes
and a missing-module negative control, which cannot fall back to source modules.

First extraction run found a validator name shadowed by the serialized quality
response. The retained quality tests failed (17 subtest failures); renaming the
validator fixed the issue. Subsequent source and installed-package suite:
`python3 -m unittest discover -s tests -p 'test_cgi*.py'`: **32 tests passed**.
The package replay invokes `tools/build-ipk.py`, including its actual UI rebuild
and both IPK builds. Local Lua is the pre-existing 5.1.5/cjson runtime selected
through per-command PATH/LUA_CPATH; no system runtime was modified. One small
resource correction closes an established ubus connection if cjson is missing;
authentication still returns the same service-unavailable response.

No live router, auth credential, speedtest, deployment, visual or interaction
change was performed. Router-installed module search behavior remains a stated
firmware assumption beyond the explicit local installed-tree replay. Full project
checks and pinned language formatter/linter application belong to the coordinator
once this ownership handoff is ready; this evidence claims only CGI/package scope.
