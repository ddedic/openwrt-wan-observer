const ENDPOINT = '/cgi-bin/wan-observer';

/**
 * Bind browser dependencies without owning page state or request lifetimes.
 * @param {{ fetch: typeof fetch, getCookie: (name: string) => unknown }} dependencies
 * @returns {(signal?: AbortSignal, body?: object, query?: string) => Promise<object>}
 */
function createRouterApi({ fetch, getCookie }) {
  return async function request(signal, body, query = '') {
    const sid = getCookie('Admin-Token');

    if (typeof sid !== 'string' || !/^[A-Za-z0-9]{32}$/.test(sid)) {
      throw Error('Sign in to the router to load WAN Observer.');
    }

    const options = {
      headers: { 'X-GL-Admin-Token': sid },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    };

    if (body) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(ENDPOINT + query, options);
    let data;

    try {
      data = await response.json();
    } catch {
      throw Error(
        response.ok
          ? 'The router sent an unreadable reply. Try again.'
          : `Router request failed (${response.status}).`,
      );
    }

    if (!response.ok) {
      throw Error(data.error || 'Router request failed.');
    }

    return data;
  };
}

module.exports = { createRouterApi };
