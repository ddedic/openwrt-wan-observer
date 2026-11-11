# SPDX-License-Identifier: MIT
# Operator configuration is data, never sourced as shell code.
def integer($lo;$hi): type == "number" and floor == . and . >= $lo and . <= $hi;
def valid_config:
  if (.enabled|type)=="boolean" and (.adaptive|type)=="boolean"
    and (.interval_minutes as $n|[15,30,60,120]|index($n)) != null
    and (.start_hour|integer(0;23)) and (.end_hour|integer(1;24)) and .start_hour < .end_hour
    and (.download_mbps|integer(1;100000)) and (.upload_mbps|integer(1;100000))
    and (.threshold_percent|integer(1;100))
    and (.binary|type)=="string" and (.binary|startswith("/")) and (.binary|length)<512
    and (.server_id|integer(1;2147483647))
    and (.interface|type)=="string" and (.interface|length)<64
    and ((if has("monthly_budget_bytes") then .monthly_budget_bytes else 0 end)|integer(0;9007199254740991))
  then {enabled,adaptive,interval_minutes,start_hour,end_hour,download_mbps,upload_mbps,threshold_percent,binary,server_id,interface,monthly_budget_bytes:(.monthly_budget_bytes // 0)}
  else error("invalid collector configuration") end;
def initial:
  {next_epoch:0,next_normal:0,burst:0,extras:0,day:0,events:[],
   coverage:{complete_since_epoch:null,retained_from_epoch:null,coverage_from_epoch:null,
             legacy_incomplete:false,retention_limit:1000}};
# Legacy events cannot establish complete coverage of older measurements.
def coverage($limit):
  .coverage //= {complete_since_epoch:null,legacy_incomplete:true} |
  .coverage.retention_limit=$limit |
  .coverage.retained_from_epoch=(.events[0].epoch // null) |
  .coverage.coverage_from_epoch=(
    if .coverage.complete_since_epoch == null then null
    else [.coverage.complete_since_epoch,.coverage.retained_from_epoch] | map(select(. != null)) | max end);
def finish($outcome;$failure):
  .events[-1].outcome=$outcome | .events[-1].failure_code=$failure | .events[-1].pending=false;
def attempt($now;$reason;$outcome;$failure;$limit):
  .events=((.events + [{epoch:$now,reason:$reason,outcome:$outcome,failure_code:$failure}]) | .[-$limit:]) |
  .coverage.complete_since_epoch //= $now |
  coverage($limit);

# Independent aggregate; never reconstructed from retained measurements.
def usage_initial($now):
  {schema_version:1, month:($now|strftime("%Y-%m")), known_bytes:0, unknown_attempts:0,
   accounting_since_epoch:null, pending:false, accounting_error:false};
# Regex support is absent in the router's jq build. Fixed ASCII layout also
# rejects impossible calendar months; initialized clocks begin in 2024.
def usage_month_valid:
  if type != "string" or length != 7 then false
  else explode as $c |
    if $c[4] != 45 or
       ([$c[0:4][], $c[5:7][]] | all(. >= 48 and . <= 57) | not)
    then false
    else (.[0:4] | tonumber | . >= 2024 and . <= 9999) and
         (.[5:7] | tonumber | . >= 1 and . <= 12)
    end
  end;
def usage_valid:
  type=="object" and .schema_version==1 and
  (.month|usage_month_valid) and
  (.known_bytes|integer(0;9007199254740991)) and
  (.unknown_attempts|integer(0;9007199254740991)) and
  (.accounting_since_epoch|integer(1704067200;9007199254740991)) and
  (.pending|type=="boolean") and (.accounting_error|type=="boolean") and
  (if .pending then .unknown_attempts>0 else true end);
def usage_month($now):
  ($now|strftime("%Y-%m")) as $month |
  if .month==$month then .
  elif .month>$month then .accounting_error=true
  else .month=$month | .known_bytes=0 |
    .unknown_attempts=(if .pending then 1 else 0 end)
  end;
def usage_status($budget):
  {month,known_bytes,unknown_attempts,accounting_since_epoch,
   budget_bytes:$budget,limit_semantics:"start_guard",partial:true,
   scope:"test bytes since accounting began",
   budget_state:(if $budget==0 then "unset"
     elif .accounting_error or .unknown_attempts>0 then "unknown"
     elif .known_bytes >= $budget then "reached" else "available" end)};
def usage_reserve($now):
  .accounting_since_epoch //= $now |
  .unknown_attempts+=1 | .pending=true;
def usage_finish($record;$now):
  if .month!=($now|strftime("%Y-%m")) then
    # Aggregate byte counts cannot allocate a test spanning UTC midnight/month.
    # Preserve uncertainty instead of assigning all bytes to either month.
    usage_month($now) | .pending=false
  else
  [$record.download_bytes,$record.upload_bytes] as $bytes |
  ($bytes|map(select(.!=null))|add // 0) as $known |
  if (.known_bytes+$known)>9007199254740991 then .accounting_error=true
  else .known_bytes+=$known |
    if ($bytes|all(.!=null)) then .unknown_attempts-=1 else . end
  end | .pending=false end;
