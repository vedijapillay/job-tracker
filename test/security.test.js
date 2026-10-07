// Host and origin protection for the local server.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSecurity, splitList } = require('../server/lib/security');
const { rawRequest } = require('./helpers');

function listen(buildSecurity) {
  const app = express();
  let security;
  app.use((req, res, next) => security(req, res, next));
  app.get('/api/jobs', (req, res) => res.json({ ok: true }));
  app.get('/api/gmail/auth/callback', (req, res) => res.json({ callback: true }));
  app.get('/', (req, res) => res.send('home'));
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      security = buildSecurity(port);
      resolve({ port, close: () => new Promise(r => server.close(() => r())) });
    });
  });
}

describe('host and origin checks', () => {
  let app;
  before(async () => { app = await listen(port => createSecurity({ port })); });
  after(() => app.close());

  const get = (headers = {}, path = '/api/jobs', method = 'GET') =>
    rawRequest({ port: app.port, path, method, headers: { Host: `localhost:${app.port}`, ...headers } });

  it('allows normal loopback requests', async () => {
    assert.equal((await get()).status, 200);
    assert.equal((await get({ Host: `127.0.0.1:${app.port}` })).status, 200);
    assert.equal((await get({ Host: `[::1]:${app.port}` })).status, 200);
  });

  it('rejects an unexpected Host header (DNS rebinding)', async () => {
    assert.equal((await get({ Host: `evil.com:${app.port}` })).status, 403);
    assert.equal((await get({ Host: 'evil.com' }, '/')).status, 403);
  });

  it('rejects a Host header with the wrong port', async () => {
    assert.equal((await get({ Host: 'localhost:1' })).status, 403);
  });

  it('rejects requests from another website', async () => {
    assert.equal((await get({ Origin: 'http://evil.com' })).status, 403);
  });

  it('rejects a cross-site preflight', async () => {
    const r = await get({ Origin: 'http://evil.com', 'Access-Control-Request-Method': 'POST' }, '/api/jobs', 'OPTIONS');
    assert.equal(r.status, 403);
  });

  it('allows the app\'s own origin and the dev server origin', async () => {
    assert.equal((await get({ Origin: `http://localhost:${app.port}` })).status, 200);
    assert.equal((await get({ Origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await get({ Origin: 'http://127.0.0.1:5173' })).status, 200);
  });

  it('allows requests with no Origin header', async () => {
    assert.equal((await get()).status, 200);
  });

  it('does not apply the origin check to the OAuth callback', async () => {
    const r = await get({ Origin: 'https://accounts.google.com' }, '/api/gmail/auth/callback');
    assert.equal(r.status, 200);
  });

  it('still checks the Host header on the OAuth callback', async () => {
    const r = await get({ Host: 'evil.com' }, '/api/gmail/auth/callback');
    assert.equal(r.status, 403);
  });

  it('sends no CORS headers', async () => {
    const r = await get({ Origin: 'http://localhost:5173' });
    assert.ok(!Object.keys(r.headers).some(name => name.startsWith('access-control-')));
  });

  it('sets protective headers', async () => {
    const r = await get();
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
  });
});

describe('configured extra hosts and origins', () => {
  let app;
  before(async () => {
    app = await listen(port => createSecurity({ port, extraHosts: ['tracker.local:9999'], extraOrigins: ['https://tracker.local'] }));
  });
  after(() => app.close());

  it('allows a configured host and origin', async () => {
    const r = await rawRequest({ port: app.port, path: '/api/jobs', headers: { Host: 'tracker.local:9999', Origin: 'https://tracker.local' } });
    assert.equal(r.status, 200);
  });
  it('still rejects others', async () => {
    const r = await rawRequest({ port: app.port, path: '/api/jobs', headers: { Host: `localhost:${app.port}`, Origin: 'https://other.example' } });
    assert.equal(r.status, 403);
  });
});

describe('splitList', () => {
  it('splits, trims and drops empty entries', () => {
    assert.deepEqual(splitList(' a.com , b.com,, '), ['a.com', 'b.com']);
    assert.deepEqual(splitList(undefined), []);
    assert.deepEqual(splitList(''), []);
  });
});
