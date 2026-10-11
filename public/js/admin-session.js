// Admin console token store, shared by every /admin page script.
//
// The token lives in a cookie rather than localStorage for one reason: the server
// must be able to see it. A localStorage token is invisible to the Astro page
// render, which is why the admin pages could only ever "gate" on the client —
// anything a visitor could set locally rendered the admin UI. With the token in a
// cookie, the admin gate verifies it against the gateway before the page is
// rendered (src/lib/api/admin.ts).
//
// The cookie is intentionally readable by script: the page scripts send it as an
// Authorization: Bearer header to /api/console/*. That is the same exposure
// localStorage had, so this is not a new weakness — but it does mean XSS on this
// origin can read the console token, which is why the console session TTL is
// short and rotation invalidates every token.
(function () {
  var NAME = 'console_jwt';
  // Matches the gateway's consoleSessionTTLSec (12h). A shorter cookie than the
  // token only forces an extra login; a longer one would keep presenting a token
  // the gateway already rejects.
  var MAX_AGE = 12 * 3600;

  function get() {
    var parts = String(document.cookie || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].trim();
      if (pair.indexOf(NAME + '=') === 0) {
        return decodeURIComponent(pair.slice(NAME.length + 1));
      }
    }
    return '';
  }

  function set(token) {
    if (!token) return;
    var attrs = '; Path=/; SameSite=Lax; Max-Age=' + MAX_AGE;
    if (location.protocol === 'https:') attrs += '; Secure';
    document.cookie = NAME + '=' + encodeURIComponent(token) + attrs;
  }

  function clear() {
    document.cookie = NAME + '=; Path=/; SameSite=Lax; Max-Age=0';
  }

  window.adminSession = { get: get, set: set, clear: clear };
})();
