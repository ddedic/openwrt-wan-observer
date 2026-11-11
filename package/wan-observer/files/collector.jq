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
  then {enabled,adaptive,interval_minutes,start_hour,end_hour,download_mbps,upload_mbps,threshold_percent,binary,server_id,interface}
  else error("invalid collector configuration") end;
def initial:
  {next_epoch:0,next_normal:0,burst:0,extras:0,day:0,events:[]};
