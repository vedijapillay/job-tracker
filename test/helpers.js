// Shared helpers for the test suite.
//
// Every test file runs in its own process (node --test), so each one can point
// the app at its own throwaway database. Call useTempDb() BEFORE requiring
// anything from ../server so the real jobs.db is never touched.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

function useTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-tracker-test-'));
  process.env.JOBS_DB_PATH = path.join(dir, 'test.db');
  return dir;
}

// The schema is created asynchronously after the database opens. db.ready resolves
// exactly when that finishes, so wait on it rather than guessing a delay. The limit is
// generous because shared CI machines can be slow when many test files run at once.
async function waitForSchema(db, timeoutMs = 60000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Database schema was not ready within ${timeoutMs / 1000}s`)), timeoutMs);
  });
  try {
    await Promise.race([db.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }

  // Confirm what the tests rely on really exists
  const query = (sql) => new Promise((resolve, reject) => db.db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));
  const tables = (await query("SELECT name FROM sqlite_master WHERE type = 'table'")).map(row => row.name);
  const columns = (await query('PRAGMA table_info(jobs)')).map(col => col.name);
  for (const name of ['jobs', 'processed_emails', 'gmail_auth', 'settings', 'scanned_emails']) {
    if (!tables.includes(name)) throw new Error(`Table ${name} is missing after the database was ready`);
  }
  if (!columns.includes('emailId')) throw new Error('jobs.emailId is missing after the database was ready');
}

// Close the database and delete the temp folder; never fail the run over cleanup
async function cleanupTempDb(dir, db) {
  try {
    await new Promise(resolve => db.db.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // leaving a temp folder behind is harmless
  }
}

// Start an express app (or app factory) on a free port
async function startApp(setup) {
  const app = express();
  app.use(express.json());
  setup(app);
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

// fetch cannot set the Host header, so use http.request when a test needs full control
function rawRequest({ port, path: requestPath = '/', method = 'GET', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method, headers }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// A Gmail API message with the given headers and plain-text body
function makeMessage({ id, from, subject, body, ts }) {
  return {
    id,
    internalDate: String(ts),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Date', value: new Date(ts).toUTCString() }
      ],
      body: { data: Buffer.from(body).toString('base64url') }
    }
  };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { useTempDb, waitForSchema, cleanupTempDb, startApp, rawRequest, makeMessage, sleep };
