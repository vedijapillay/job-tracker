// The real server entry point (server/server.js), started the way `npm start` does.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const path = require('path');
const helpers = require('./helpers');

const tempDir = helpers.useTempDb();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

let port;
let server;
let db;
const get = (requestPath, headers = {}) => helpers.rawRequest({
  port,
  path: requestPath,
  headers: { Host: `localhost:${port}`, ...headers }
});

before(async () => {
  port = await freePort();
  process.env.PORT = String(port); // read when server.js loads
  delete process.env.HOST;
  db = require('../server/db');
  const app = require('../server/server');
  server = app.start();
  await new Promise(resolve => server.once('listening', resolve));
  await helpers.waitForSchema(db);
});
after(async () => {
  if (server && server.listening) await new Promise(resolve => server.close(() => resolve()));
  await helpers.cleanupTempDb(tempDir, db);
});

describe('server', () => {
  it('answers the health check', async () => {
    const r = await get('/health');
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).status, 'OK');
  });

  it('listens on the loopback interface only', () => {
    assert.equal(server.address().address, '127.0.0.1');
  });

  it('serves the jobs API', async () => {
    const r = await get('/api/jobs');
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body).jobs, []);
  });

  it('rejects an unexpected Host header', async () => {
    assert.equal((await get('/api/jobs', { Host: 'evil.com' })).status, 403);
  });

  it('rejects requests from another website', async () => {
    assert.equal((await get('/api/jobs', { Origin: 'http://evil.com' })).status, 403);
  });

  it('allows the Vite dev origin', async () => {
    assert.equal((await get('/api/jobs', { Origin: 'http://localhost:5173' })).status, 200);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const r = await get('/api/nope');
    assert.equal(r.status, 404);
    assert.deepEqual(JSON.parse(r.body), { error: 'Endpoint not found' });
  });

  it('does not reveal that it runs Express', async () => {
    assert.equal((await get('/health')).headers['x-powered-by'], undefined);
  });

  it('does not expose server files over HTTP', async () => {
    const r = await get('/server/db.js', { Accept: 'text/html' });
    assert.ok(!r.body.includes('sqlite3'));
  });

  // Only when the web app has been built (npm run build)
  const built = fs.existsSync(path.join(__dirname, '../client/dist/index.html'));
  it('serves the built web app and falls back to it for page routes', { skip: !built && 'client/dist is not built' }, async () => {
    const home = await get('/', { Accept: 'text/html' });
    assert.equal(home.status, 200);
    assert.match(home.body, /<div id="root">/);
    const deep = await get('/some/page', { Accept: 'text/html' });
    assert.equal(deep.status, 200);
    assert.match(deep.body, /<div id="root">/);
  });
});
