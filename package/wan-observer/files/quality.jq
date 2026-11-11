# SPDX-License-Identifier: MIT
# Native values only: no probe targets, labels, raw arrays or source age claims.
def bounded($max):
  if type == "number" and isfinite and . >= 0 and . <= $max then .
  else error("invalid numeric metric") end;
def responsiveness:
  if type != "object" then error("missing responsiveness") else
    {wan_gateway_latency:(.wan_gateway_latency|bounded(3600000)),
     internet_latency:(.internet_latency|bounded(3600000)),
     dns_lookup_latency:(.dns_lookup_latency|bounded(3600000)),
     typical_latency:(.typical_latency|bounded(3600000)),
     worst_latency:(.worst_latency|bounded(3600000)),
     jitter_latency:(.jitter_latency|bounded(3600000)),score:(.score|bounded(100))}
  end;
def reliability:
  if type != "object" then error("missing reliability") else
    {score:(.score|bounded(100)),packet_loss_percent:(.packet_loss_percent|bounded(100))}
  end;
def rate:
  if type != "object" then error("missing rate") else
    {total_current:(.total_current|bounded(1e12)),
     upload_current:(.upload_current|bounded(1e12)),download_current:(.download_current|bounded(1e12))}
  end;
def observation($now; $state; $category):
  {schema:1,source:"gl-inet-network-quality",sampled_at:$now,source_freshness:"unknown",
   state:$state,error_category:$category,responsiveness:null,reliability:null,rate_native:null};
def snapshot($now):
  . as $s | observation($now; "available"; null) +
    {responsiveness:($s.responsiveness|responsiveness),
     reliability:($s.reliability|reliability),rate_native:($s.rate|rate)};
def validate:
  . as $o |
  if type != "object" then error("invalid observation") else
    (.sampled_at | bounded(4102444799)) as $time |
    if ($time|floor) != $time then error("invalid time") else . end |
    (if .state == "available" and .error_category == null then
      observation($time; "available"; null) +
        {responsiveness:(.responsiveness|responsiveness),
         reliability:(.reliability|reliability),rate_native:(.rate_native|rate)}
     elif (.state == "unsupported" and .error_category == "source_unavailable") or
          (.state == "disabled" and .error_category == "native_disabled") or
          (.state == "error" and (["enable_state_unknown","snapshot_failed","invalid_snapshot"] | index($o.error_category)) != null) then
       observation($time; .state; .error_category)
     else error("invalid state") end) as $clean |
    if $o == $clean then $clean else error("unexpected observation fields") end
  end;
def day_records($day):
  if length > 1440 then error("too many observations") else . end |
  map(validate) |
  if all(.[]; (.sampled_at|strftime("%Y%m%d")) == $day) and
    ((map((.sampled_at / 60)|floor)|unique|length) == length)
  then . else error("invalid day or duplicate minute") end;

# Series derives values only from native available observations, never imputes gaps.
def median:
  sort | length as $n |
  if $n == 0 then null
  elif ($n % 2) == 1 then .[($n/2)|floor]
  else (.[($n/2)-1] + .[$n/2]) / 2 end;
def point($epoch):
  . as $samples | map(select(.state == "available")) as $valid |
  {epoch:$epoch,sample_count:($samples|length),valid_count:($valid|length),
   latency_median_ms:($valid|map(.responsiveness.internet_latency)|median),
   jitter_median_ms:($valid|map(.responsiveness.jitter_latency)|median),
   loss_max_percent:($valid|map(.reliability.packet_loss_percent)|max),
   dns_median_ms:($valid|map(.responsiveness.dns_lookup_latency)|median)};
def series($now; $days):
  . as $retained |
  ($now + 1) as $finish | ($finish - $days * 86400) as $start |
  ([60, (($days * 1440 / 180)|ceil) * 60]|max) as $step |
  map(select(.sampled_at >= $start and .sampled_at < $finish)) as $window |
  ($window | group_by(((.sampled_at - $start)/$step)|floor) |
    reduce .[] as $group ({};
      (((($group[0].sampled_at - $start)/$step)|floor)|tostring) as $key |
      .[$key] = ($group|point($start + ($key|tonumber)*$step)))) as $groups |
  ($window|map(select(.state == "available"))|length) as $valid |
  {source:"gl-inet-network-quality",source_freshness:"unknown",
   start_epoch:$start,end_epoch:$finish,
   observed_since_epoch:($retained|map(.sampled_at)|min),
   observations:($window|length),available_count:$valid,error_count:(($window|length)-$valid),
   points:[range(0; (($finish-$start)/$step)|ceil) as $i |
     $groups[$i|tostring] // ([]|point($start + $i * $step))]};
