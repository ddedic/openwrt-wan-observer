# SPDX-License-Identifier: MIT
def nonnegative:
  if type == "number" and isfinite and . >= 0 then . else error("invalid metric") end;
def optional_metric:
  if . == null then null else nonnegative end;
def timestamp:
  if type == "string" and length == 20
  then . as $original | strptime("%Y-%m-%dT%H:%M:%SZ") | strftime("%Y-%m-%dT%H:%M:%SZ")
    | if . == $original then . else error("invalid time") end
  else error("invalid time") end;
def loss:
  optional_metric | if . == null or . <= 100 then . else error("invalid loss") end;
def server_id:
  if . == null then null
  elif type == "number" and isfinite and . >= 0 and . <= 2147483647 and floor == . then .
  else error("invalid server id") end;
def byte_count:
  if type == "number" and isfinite and . >= 0 and . <= 9007199254740991 and floor == .
  then . else null end;
# Opaque local collector identity; never sourced from provider result JSON.
def attempt_id:
  if . == null then null
  elif type == "string" and length == 32 and
       (explode | all((. >= 48 and . <= 57) or (. >= 97 and . <= 102)))
  then . else error("invalid attempt id") end;
def fields:
  ["schema_version", "timestamp", "backend", "server_id", "download_mbps", "upload_mbps",
   "idle_latency_ms", "idle_jitter_ms", "download_loaded_latency_ms", "upload_loaded_latency_ms",
   "packet_loss_percent", "download_bytes", "upload_bytes", "attempt_id"];
def validate:
  if .schema_version != 1 or .backend != "ookla" then error("unsupported record") else . end |
  {schema_version: 1, timestamp: (.timestamp | timestamp), backend: "ookla",
   server_id: (.server_id | server_id),
   download_mbps: (.download_mbps | nonnegative), upload_mbps: (.upload_mbps | nonnegative),
   idle_latency_ms: (.idle_latency_ms | optional_metric), idle_jitter_ms: (.idle_jitter_ms | optional_metric),
   download_loaded_latency_ms: (.download_loaded_latency_ms | optional_metric),
   upload_loaded_latency_ms: (.upload_loaded_latency_ms | optional_metric),
   packet_loss_percent: (.packet_loss_percent | loss),
   download_bytes: (.download_bytes | byte_count), upload_bytes: (.upload_bytes | byte_count),
   attempt_id: (.attempt_id | attempt_id)};
def ookla:
  if .type != "result" then error("not a completed result") else . end |
  {schema_version: 1, timestamp: .timestamp, backend: "ookla", server_id: .server.id,
   download_mbps: ((.download.bandwidth | nonnegative) * 8 / 1000000),
   upload_mbps: ((.upload.bandwidth | nonnegative) * 8 / 1000000),
   idle_latency_ms: .ping.latency, idle_jitter_ms: .ping.jitter,
   download_loaded_latency_ms: .download.latency.iqm,
   upload_loaded_latency_ms: .upload.latency.iqm, packet_loss_percent: .packetLoss,
   download_bytes: .download.bytes, upload_bytes: .upload.bytes} | validate;
