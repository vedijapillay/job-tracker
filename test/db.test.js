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
      const reached = await all('SELECT company, reachedStage FROM jobs ORDER BY id');
      console.log('RESULT ' + JSON.stringify({ tables, columns, jobs, processed, reached }));
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

// An older database with one job for every status, to check what the upgrade makes of each
function createOldDatabaseWithEveryStatus(dbPath, statuses) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.serialize(() => {
      db.run(`CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, jobTitle TEXT NOT NULL,
        appliedDate DATE NOT NULL, status TEXT DEFAULT 'Applied', source TEXT, lastEmailDate DATE,
        lastEmailSubject TEXT, notes TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      for (const status of statuses) {
        db.run('INSERT INTO jobs (company, jobTitle, appliedDate, status) VALUES (?, ?, ?, ?)', [status, 'PM', '2026-09-01', status]);
      }
      db.close(err => (err ? reject(err) : resolve()));
    });
  });
}

const EXPECTED_TABLES = ['jobs', 'processed_emails', 'gmail_auth', 'settings', 'scanned_emails'];

describe('furthest stage reached (for the Insights funnel)', () => {
  const { initialReached } = require('../server/lib/stages');
  const STATUSES = ['Applied', 'Recruiter Screen', 'Interview Scheduled', 'Technical Round', 'HM Round', 'Offer', 'Rejected', 'Declined by You', 'Ghosted'];

  it('adds the column and starts every old job from what its status implies', async () => {
    const dbPath = path.join(tempDir, 'old-stages.db');
    await createOldDatabaseWithEveryStatus(dbPath, STATUSES);

    const result = await inspectDatabase(dbPath);
    assert.ok(result.columns.includes('reachedStage'));
    for (const { company, reachedStage } of result.reached) {
      assert.equal(reachedStage, initialReached(company), `${company} should start at ${initialReached(company)}`);
    }
    // The SQL in db.js and the JavaScript rules must agree for every status
    assert.equal(result.reached.length, STATUSES.length);
  });

  it('gives a closed job the stage "Applied", the most that can be known without history', async () => {
    const dbPath = path.join(tempDir, 'old-stages-closed.db');
    await createOldDatabaseWithEveryStatus(dbPath, ['Rejected', 'Ghosted', 'Declined by You']);
    const result = await inspectDatabase(dbPath);
    assert.deepEqual(result.reached.map(r => r.reachedStage), ['Applied', 'Applied', 'Applied']);
  });

  it('does not overwrite stages that were recorded, when the database is opened again', async () => {
    const dbPath = path.join(tempDir, 'reopen-stages.db');
    await createOldDatabaseWithEveryStatus(dbPath, ['Rejected']);
    await inspectDatabase(dbPath);

    // Pretend the job went further before being rejected, then start the app again
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      db.run("UPDATE jobs SET reachedStage = 'HM Round'", err => (err ? reject(err) : db.close(resolve)));
    });
    const result = await inspectDatabase(dbPath);
    assert.equal(result.reached[0].reachedStage, 'HM Round');
  });

  it('a brand-new database has the column', async () => {
    const result = await inspectDatabase(path.join(tempDir, 'fresh-stages.db'));
    assert.ok(result.columns.includes('reachedStage'));
  });
});

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
