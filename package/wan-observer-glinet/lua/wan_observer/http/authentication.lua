-- SPDX-License-Identifier: MIT
local function authenticate(sid, jsonOk)
  if #sid ~= 32 or not sid:match('^[A-Za-z0-9]+$') then
    return nil, 'signInRequired'
  end

  local ok, ubus = pcall(require, 'ubus')
  local connected, conn = false, nil
  if ok then
    connected, conn = pcall(ubus.connect, nil, 2)
  end
  if not connected or not conn or not jsonOk then
    if connected and conn then
      pcall(conn.close, conn)
    end
    return nil, 'sessionUnavailable'
  end
  local called, session = pcall(conn.call, conn, 'gl-session', 'session', { sid = sid })
  pcall(conn.close, conn)
  if not called or type(session) ~= 'table' or type(session.username) ~= 'string' then
    return nil, 'signInRequired'
  end
  if session.aclgroup ~= 'root' then
    return nil, 'administratorRequired'
  end

  return session
end

return { authenticate = authenticate }
