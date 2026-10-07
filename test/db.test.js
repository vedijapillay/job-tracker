// Database setup: a brand-new database, and upgrading one created by an older version.
// Each scenario runs in its own process because server/db.js opens its database when loaded.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

const DB_MODULE = path.join(__dirname, '../server/db.js');
let tempDir;

before(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-tracker-db-test-')); });
after(() => { fs.rmSync(tempDir, { recursive: true, force: true }); });

// Load server/db.js against `dbPath`, wait for it to be ready, and report what it found
function inspectDatabase(dbPath) {
  const script = `
    const db = require(${JSON.stringify(DB_MODULE)});
    db.ready.then(async () => {
      const all = (sql) => new Promise((res, rej) => db.db.all(sql, (e, r) => e ? rej(e) : res(r)));
      const tables = (await all("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
      const columns = (await all('PRAGMA table_info(jobs)')).map(c => c.name);
      const jobs = await all('SELECT company, status FROM jobs ORDER BY id');
      const processed = await all('SELECT messageId, reason FROM processed_emails ORDER BY messageId');
      console.log('RESULT ' + JSON.stringify({ tables, columns, jobs, processed }));
      process.exit(0);
    }, (e) => { console.log('FAILED ' + e.message); process.exit(2); });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, JOBS_DB_PATH: dbPath } });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', (code) => {
      const line = out.split('\n').find(l => l.startsWith('RESULT '));
      if (code !== 0 || !line) return reject(new Error(`exit ${code}\n${out}\n${err}`));
      resolve({ ...JSON.parse(line.slice('RESULT '.length)), stderr: err });
    });
  });
}

function createOldDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.serialize(() => {
      // The schema from before jobs had an emailId column
      db.run(`CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, jobTitle TEXT NOT NULL,
        appliedDate DATE NOT NULL, status TEXT DEFAULT 'Applied', source TEXT, lastEmailDate DATE,
        lastEmailSubject TEXT, notes TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      db.run("INSERT INTO jobs (company, jobTitle, appliedDate, status) VALUES ('Nordstrom', 'PM', '2026-09-01', 'Rejected')");
      db.run("INSERT INTO jobs (company, jobTitle, appliedDate, status) VALUES ('Boeing', 'TPM', '2026-09-02', 'Applied')");
      // The version that recorded added emails here
      db.run(`CREATE TABLE processed_emails (messageId TEXT PRIMARY KEY, reason TEXT NOT NULL, sender TEXT, subject TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      db.run("INSERT INTO processed_emails (messageId, reason) VALUES ('old-added', 'added')");
      db.run("INSERT INTO processed_emails (messageId, reason) VALUES ('old-dismissed', 'dismissed')");
      db.close(err => (err ? reject(err) : resolve()));
    });
  });
}

const EXPECTED_TABLES = ['jobs', 'processed_emails', 'gmail_auth', 'settings', 'scanned_emails'];

describe('database setup', () => {
  it('creates every table on a brand-new database, before `ready` resolves', async () => {
    const result = await inspectDatabase(path.join(tempDir, 'fresh.db'));
    for (const table of EXPECTED_TABLES) assert.ok(result.tables.includes(table), `missing table ${table}`);
    assert.ok(result.columns.includes('emailId'));
    assert.ok(!/no such table/i.test(result.stderr), result.stderr);
  });

  it('starts cleanly many times at once on fresh databases', async () => {
    const runs = await Promise.all(Array.from({ length: 16 }, (_, i) => inspectDatabase(path.join(tempDir, `parallel-${i}.db`))));
    for (const result of runs) {
      for (const table of EXPECTED_TABLES) assert.ok(result.tables.includes(table));
      assert.ok(!/no such table/i.test(result.stderr), result.stderr);
    }
  });

  it('can be started again on an existing database without changing it', async () => {
    const dbPath = path.join(tempDir, 'reopen.db');
    await inspectDatabase(dbPath);
    const second = await inspectDatabase(dbPath);
    assert.deepEqual(second.jobs, []);
    assert.ok(second.columns.includes('emailId'));
  });

  it('upgrades a database from an older version and keeps its jobs', async () => {
    const dbPath = path.join(tempDir, 'old.db');
    await createOldDatabase(dbPath);

    const result = await inspectDatabase(dbPath);
    assert.deepEqual(result.jobs, [{ company: 'Nordstrom', status: 'Rejected' }, { company: 'Boeing', status: 'Applied' }]);
    assert.ok(result.columns.includes('emailId'), 'emailId column should be added');
    for (const table of EXPECTED_TABLES) assert.ok(result.tables.includes(table));
  });

  it('drops the old "added" email records and keeps dismissed ones', async () => {
    const dbPath = path.join(tempDir, 'old-processed.db');
    await createOldDatabase(dbPath);

    const result = await inspectDatabase(dbPath);
    assert.deepEqual(result.processed, [{ messageId: 'old-dismissed', reason: 'dismissed' }]);
  });
});
