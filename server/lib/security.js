// Protections for a server that holds personal data on the user's own machine.
//
// The app only ever talks to a browser on the same computer, so:
//  - Host check: stops DNS-rebinding, where a hostile site points its own domain
//    at 127.0.0.1 to reach the API as if it were "same origin"
//  - Origin check: stops other websites from calling the API from the user's
//    browser (cross-site requests)
// There are deliberately no CORS headers; browsers then refuse to hand
// cross-origin responses to other sites.

const OAUTH_CALLBACK_PATH = '/api/gmail/auth/callback';
const DEV_CLIENT_PORT = 5173; // Vite dev server, which proxies /api to this server

function splitList(value) {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function createSecurity({ port, extraHosts = [], extraOrigins = [] }) {
  const loopbackNames = ['localhost', '127.0.0.1', '[::1]'];

  const allowedHosts = new Set([
    ...loopbackNames.map(name => `${name}:${port}`),
    ...extraHosts
  ]);

  const allowedOrigins = new Set([
    ...loopbackNames.map(name => `http://${name}:${port}`),
    ...loopbackNames.map(name => `http://${name}:${DEV_CLIENT_PORT}`),
    ...extraOrigins
  ]);

  return function security(req, res, next) {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });

    if (!allowedHosts.has(req.headers.host)) {
      return res.status(403).json({ error: 'Forbidden: unexpected Host header' });
    }

    // Browsers attach Origin to cross-site requests. Requests without one (curl,
    // same-origin navigation) are fine. Google's redirect back to the OAuth
    // callback is a navigation we cannot control, and it validates `state` itself.
    const origin = req.headers.origin;
    if (origin && req.path !== OAUTH_CALLBACK_PATH && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Forbidden: cross-origin request blocked' });
    }

    next();
  };
}

module.exports = { createSecurity, splitList };
