// The user's own Google OAuth credentials: saving, validation, precedence and the connection test.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

const tempDir = helpers.useTempDb();
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GOOGLE_REDIRECT_URI;
process.env.PORT = '3000';

const { google } = require('googleapis');
const db = require('../server/db');
const gmailConfigRouter = require('../server/routes/gmailConfig');
const gmailRouter = require('../server/routes/gmail');

const ID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
const SECRET = 'fake-client-secret-for-tests-12345';

// What Google's token endpoint does when the app sends a made-up authorization code
let tokenBehavior = null;
google.auth.OAuth2.prototype.getToken = async function () {
  if (tokenBehavior) throw tokenBehavior;
  return { tokens: {} };
};
const googleError = (error, status = 400) => Object.assign(new Error(error), { response: { status, data: { error } } });

let app;
const bodies = []; // every response body, to prove the secret never leaks
const call = async (method, path, body) => {
  const response = await fetch(app.base + '/api/gmail' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  bodies.push(text);
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  await helpers.waitForSchema(db);
  app = await helpers.startApp(a => {
    a.use('/api/gmail/config', gmailConfigRouter);
    a.use('/api/gmail', gmailRouter);
  });
});
after(async () => {
  await app.close();
  await helpers.cleanupTempDb(tempDir, db);
});
beforeEach(async () => {
  // Every test starts with nothing saved and no environment credentials
  await db.deleteSetting('google_client_id');
  await db.deleteSetting('google_client_secret');
  await db.clearRefreshToken();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  tokenBehavior = null;
});

describe('before any credentials exist', () => {
  it('reports nothing configured and a local redirect address', async () => {
    const { body } = await call('GET', '/config');
    assert.equal(body.configured, false);
    assert.equal(body.source, null);
    assert.equal(body.clientId, null);
    assert.equal(body.redirectUri, 'http://localhost:3000/api/gmail/auth/callback');
  });

  it('status says not configured', async () => {
    assert.equal((await call('GET', '/status')).body.configured, false);
  });

  it('sign-in and scan ask for setup instead of failing', async () => {
    const auth = await call('GET', '/auth');
    assert.equal(auth.status, 400);
    assert.equal(auth.body.code, 'not_configured');

    await db.saveRefreshToken('stale');
    const scan = await call('POST', '/scan');
    assert.equal(scan.status, 400);
    assert.equal(scan.body.code, 'not_configured');
  });

  it('the connection test asks you to save credentials first', async () => {
    const r = await call('POST', '/config/test');
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
  });
});

describe('validation', () => {
  it('rejects a Client ID that is not in Google\'s format', async () => {
    const r = await call('PUT', '/config', { clientId: 'not-a-client-id', clientSecret: SECRET });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /apps\.googleusercontent\.com/);
  });
  it('rejects a missing secret', async () => {
    assert.equal((await call('PUT', '/config', { clientId: ID, clientSecret: '' })).status, 400);
  });
  it('rejects a secret with spaces or odd length', async () => {
    assert.equal((await call('PUT', '/config', { clientId: ID, clientSecret: 'has space inside' })).status, 400);
    assert.equal((await call('PUT', '/config', { clientId: ID, clientSecret: 'short' })).status, 400);
  });
  it('rejects an empty body', async () => {
    assert.equal((await call('PUT', '/config', {})).status, 400);
  });
  it('saves nothing when validation fails', async () => {
    await call('PUT', '/config', { clientId: 'bad', clientSecret: SECRET });
    assert.equal(await db.getSetting('google_client_id'), null);
  });
});

describe('saving credentials', () => {
  it('saves, trims whitespace and never returns the secret', async () => {
    const r = await call('PUT', '/config', { clientId: `  ${ID}  `, clientSecret: `  ${SECRET} ` });
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, true);
    assert.equal(r.body.source, 'app');
    assert.equal(r.body.clientId, ID);
    assert.equal(r.body.hasSecret, true);
    assert.ok(!('clientSecret' in r.body));
    assert.equal(await db.getSetting('google_client_secret'), SECRET);
  });

  it('uses the saved Client ID and redirect address to sign in', async () => {
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    const { body } = await call('GET', '/auth');
    const url = new URL(body.authUrl);
    assert.equal(url.searchParams.get('client_id'), ID);
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/gmail/auth/callback');
  });

  it('clears the Google sign-in when the credentials change', async () => {
    await db.saveRefreshToken('old-sign-in');
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    assert.equal(await db.getRefreshToken(), null);
  });

  it('keeps the saved secret when it is left blank for the same Client ID', async () => {
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    await db.saveRefreshToken('good-sign-in');

    const r = await call('PUT', '/config', { clientId: ID, clientSecret: '' });
    assert.equal(r.status, 200);
    assert.equal(await db.getSetting('google_client_secret'), SECRET);
    assert.equal(await db.getRefreshToken(), 'good-sign-in'); // nothing changed, so the sign-in stays
  });

  it('requires the secret again for a different Client ID', async () => {
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    const r = await call('PUT', '/config', { clientId: '999-other.apps.googleusercontent.com', clientSecret: '' });
    assert.equal(r.status, 400);
  });

  it('clears the sign-in when only the secret changes', async () => {
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    await db.saveRefreshToken('good-sign-in');
    await call('PUT', '/config', { clientId: ID, clientSecret: 'a-brand-new-secret-9999' });
    assert.equal(await db.getRefreshToken(), null);
  });

  it('removes credentials and the sign-in made with them', async () => {
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    await db.saveRefreshToken('t');
    const r = await call('DELETE', '/config');
    assert.equal(r.body.configured, false);
    assert.equal(await db.getRefreshToken(), null);
  });
});

describe('connection test', () => {
  beforeEach(async () => { await call('PUT', '/config', { clientId: ID, clientSecret: SECRET }); });

  it('accepts credentials when Google only rejects the made-up code', async () => {
    tokenBehavior = googleError('invalid_grant');
    assert.equal((await call('POST', '/config/test')).body.ok, true);
  });
  it('explains wrong credentials', async () => {
    tokenBehavior = googleError('invalid_client', 401);
    const { body } = await call('POST', '/config/test');
    assert.equal(body.ok, false);
    assert.match(body.message, /rejected/);
  });
  it('explains being offline', async () => {
    tokenBehavior = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const { body } = await call('POST', '/config/test');
    assert.equal(body.ok, false);
    assert.match(body.message, /reach Google/);
  });
  it('surfaces an unexpected Google error', async () => {
    tokenBehavior = googleError('something_new');
    const { body } = await call('POST', '/config/test');
    assert.equal(body.ok, false);
    assert.match(body.message, /something_new/);
  });
  it('treats a real token as success', async () => {
    assert.equal((await call('POST', '/config/test')).body.ok, true);
  });
});

describe('where credentials come from', () => {
  it('falls back to the .env credentials when nothing is saved', async () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret-value';
    const { body } = await call('GET', '/config');
    assert.equal(body.configured, true);
    assert.equal(body.source, 'env');
    assert.equal(body.clientId, 'env-id.apps.googleusercontent.com');
  });

  it('prefers saved credentials over .env, and returns to .env when removed', async () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret-value';

    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    assert.equal((await call('GET', '/config')).body.source, 'app');

    await call('DELETE', '/config');
    assert.equal((await call('GET', '/config')).body.source, 'env');
  });
});

describe('secrets', () => {
  it('never appear in any response the API has given', async () => {
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret-value';
    process.env.GOOGLE_CLIENT_ID = 'env-id.apps.googleusercontent.com';
    await call('GET', '/config');
    await call('PUT', '/config', { clientId: ID, clientSecret: SECRET });
    await call('GET', '/config');
    await call('GET', '/status');
    await call('POST', '/config/test');
    assert.ok(bodies.length > 5);
    assert.ok(!bodies.some(text => text.includes(SECRET) || text.includes('env-secret-value')));
  });
});
