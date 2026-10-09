// Demo mode (`npm run demo`): sample data in its own database, with a simulated Gmail.
// Everything here must stay safe for a user's real data.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helpers = require('./helpers');

// Set before anything from ../server loads
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-tracker-demo-test-'));
const DEMO_DB = path.join(tempDir, 'demo.db');
const DECOY_DB = path.join(tempDir, 'should-be-ignored.db');
const REAL_DB = path.join(__dirname, '../jobs.db');
// Absolute paths, so the child processes below work from any folder
const DB_MODULE = JSON.stringify(path.join(__dirname, '../server/db'));
const DEMO_MODULE = JSON.stringify(path.join(__dirname, '../server/lib/demo'));
process.env.DEMO_MODE = '1';
process.env.DEMO_DB_PATH = DEMO_DB;
process.env.JOBS_DB_PATH = DECOY_DB; // demo mode must ignore this

const db = require('../server/db');
const demo = require('../server/lib/demo');
const jobsRouter = require('../server/routes/jobs');
const gmailRouter = require('../server/routes/gmail');
const gmailConfigRouter = require('../server/routes/gmailConfig');

let app;
const call = async (method, urlPath, body) => {
  const response = await fetch(app.base + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  await db.ready;
  await demo.seedDemoData();
  app = await helpers.startApp(a => {
    a.use('/api/jobs', jobsRouter);
    a.use('/api/gmail/config', gmailConfigRouter);
    a.use('/api/gmail', gmailRouter);
  });
});
after(async () => {
  if (app) await app.close();
  await helpers.cleanupTempDb(tempDir, db);
});

// Run a script in its own process, which gets its own database connection
function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code, out }));
  });
}

describe('where the demo keeps its data', () => {
  it('uses its own database file', () => {
    assert.equal(db.DB_PATH, DEMO_DB);
    assert.ok(fs.existsSync(DEMO_DB));
  });

  it('ignores JOBS_DB_PATH', () => {
    assert.notEqual(db.DB_PATH, DECOY_DB);
    assert.ok(!fs.existsSync(DECOY_DB));
  });

  it('refuses to run against the real jobs.db', async () => {
    const before = fs.existsSync(REAL_DB) ? fs.statSync(REAL_DB).mtimeMs : null;
    const r = await runScript(`require(${DB_MODULE})`, { DEMO_MODE: '1', DEMO_DB_PATH: REAL_DB, JOBS_DB_PATH: '' });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Demo mode will not use the real jobs\.db/, 'it must refuse for the right reason');
    const after = fs.existsSync(REAL_DB) ? fs.statSync(REAL_DB).mtimeMs : null;
    assert.equal(after, before, 'the real database must not be touched');
  });
});

describe('sample data', () => {
  it('loads a realistic spread of jobs', async () => {
    const { body } = await call('GET', '/api/jobs');
    assert.equal(body.count, demo.sampleJobs().length);
    const statuses = new Set(body.jobs.map(j => j.status));
    assert.ok(statuses.size >= 6, `expected a variety of statuses, got ${[...statuses].join(', ')}`);
    assert.ok(new Set(body.jobs.map(j => j.source)).size >= 3);
  });

  it('dates are in the past, so the demo always looks current', async () => {
    const { body } = await call('GET', '/api/jobs');
    const today = new Date().toISOString().split('T')[0];
    for (const job of body.jobs) assert.ok(job.appliedDate <= today, job.appliedDate);
  });

  it('is reset every time the demo starts', async () => {
    await call('POST', '/api/jobs', { company: 'Added By Visitor', jobTitle: 'x', appliedDate: '2026-01-01' });
    await db.markEmailProcessed({ messageId: 'x', reason: 'dismissed', sender: 's', subject: 's' });

    await demo.seedDemoData();

    const { body } = await call('GET', '/api/jobs');
    assert.equal(body.count, demo.sampleJobs().length);
    assert.ok(!body.jobs.some(j => j.company === 'Added By Visitor'));
    assert.equal((await db.getProcessedEmailIds()).size, 0);
    assert.equal(body.jobs.reduce((max, j) => Math.max(max, j.id), 0), demo.sampleJobs().length, 'ids restart from 1');
  });

  it('never resets a database that holds jobs but is not a demo database', async () => {
    const realish = path.join(tempDir, 'someones-real.db');
    // A normal tracker database with one job, created without the demo marker
    const script = `
      const sqlite3 = require('sqlite3');
      const handle = new sqlite3.Database(${JSON.stringify(realish)}, () => {
        handle.serialize(() => {
          handle.run("CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, jobTitle TEXT NOT NULL, appliedDate DATE NOT NULL, status TEXT DEFAULT 'Applied', source TEXT, lastEmailDate DATE, lastEmailSubject TEXT, notes TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)");
          handle.run("INSERT INTO jobs (company, jobTitle, appliedDate) VALUES ('My Real Job', 'PM', '2026-01-01')");
          handle.close(async () => {
            const db = require(${DB_MODULE});
            const demo = require(${DEMO_MODULE});
            await db.ready;
            try { await demo.seedDemoData(); console.log('RESULT wiped'); }
            catch (e) { console.log('RESULT refused: ' + e.message); }
            db.db.get('SELECT count(*) AS n FROM jobs', (err, row) => { console.log('JOBS ' + row.n); process.exit(0); });
          });
        });
      });`;
    const r = await runScript(script, { DEMO_MODE: '1', DEMO_DB_PATH: realish, JOBS_DB_PATH: '' });
    assert.match(r.out, /RESULT refused: Refusing to reset .* is not a demo database/);
    assert.match(r.out, /JOBS 1/, 'the existing job must still be there');
  });
});

describe('everything that needs Google is off', () => {
  it('reports itself as the demo, connected and configured', async () => {
    const { body } = await call('GET', '/api/gmail/status');
    assert.equal(body.demo, true);
    assert.equal(body.connected, true);
    assert.equal(body.configured, true);
  });

  const blocked = [
    ['GET', '/api/gmail/auth'],
    ['GET', '/api/gmail/auth/callback?code=x&state=y'],
    ['POST', '/api/gmail/disconnect'],
    ['PUT', '/api/gmail/config'],
    ['DELETE', '/api/gmail/config'],
    ['POST', '/api/gmail/config/test']
  ];
  for (const [method, urlPath] of blocked) {
    it(`blocks ${method} ${urlPath.split('?')[0]}`, async () => {
      const r = await call(method, urlPath, method === 'PUT' ? { clientId: 'a.apps.googleusercontent.com', clientSecret: 'secretsecret' } : undefined);
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'demo_mode');
    });
  }

  it('saves no Google credentials or sign-in', async () => {
    await call('PUT', '/api/gmail/config', { clientId: 'a.apps.googleusercontent.com', clientSecret: 'secretsecret' });
    assert.equal(await db.getSetting('google_client_id'), null);
    assert.equal(await db.getRefreshToken(), null);
  });
});

describe('the simulated scan', () => {
  before(async () => { await demo.seedDemoData(); });

  const scan = async () => (await call('POST', '/api/gmail/scan')).body;

  it('finds what the demo promises, using the real classifier and matching', async () => {
    const body = await scan();
    const byCompany = Object.fromEntries(body.detectedJobs.map(j => [j.company, j]));

    assert.deepEqual(Object.keys(byCompany).sort(), ['Acme Robotics', 'Contoso Health', 'Fabrikam Systems', 'Globex Corporation', 'Initech', 'Northwind Labs']);

    // Two emails move jobs that are already tracked
    assert.equal(byCompany['Fabrikam Systems'].status, 'Rejected');
    assert.equal(byCompany['Fabrikam Systems'].matchedJob.status, 'Applied');
    assert.equal(byCompany['Northwind Labs'].status, 'Offer');
    assert.equal(byCompany['Northwind Labs'].matchedJob.status, 'HM Round');

    // Four are new jobs
    assert.equal(byCompany['Contoso Health'].status, 'Interview Scheduled');
    assert.equal(byCompany['Acme Robotics'].status, 'Applied');
    assert.equal(byCompany['Initech'].status, 'Applied');
    assert.equal(byCompany['Globex Corporation'].status, 'Applied');
    for (const name of ['Contoso Health', 'Acme Robotics', 'Initech', 'Globex Corporation']) {
      assert.equal(byCompany[name].matchedJob, null, `${name} should be a new job`);
    }

    // Titles come through for all of them
    assert.equal(byCompany['Contoso Health'].jobTitle, 'Product Manager');
    assert.equal(byCompany['Globex Corporation'].jobTitle, 'Product Operations Manager');
  });

  it('drops an email that the tracker already reflects, and ignores non-job mail', async () => {
    const body = await scan();
    assert.equal(body.alreadyTracked, 1); // Tailspin is already Applied
    assert.ok(!body.detectedJobs.some(j => j.company === 'Tailspin Aerospace'));
    assert.equal(body.stats.listed, demo.mailboxSpec().length);
    const subjects = body.detectedJobs.map(j => j.lastEmailSubject).join('|');
    for (const noise of ['Lunch on Friday?', 'New jobs:', 'Team lunch']) assert.ok(!subjects.includes(noise));
  });

  it('applying a suggestion updates the job, and the email is not suggested again', async () => {
    const before = await scan();
    const fabrikam = before.detectedJobs.find(j => j.company === 'Fabrikam Systems');

    const put = await call('PUT', `/api/jobs/${fabrikam.matchedJob.id}`, {
      status: fabrikam.status, lastEmailDate: fabrikam.lastEmailDate, lastEmailSubject: fabrikam.lastEmailSubject, emailId: fabrikam.id
    });
    assert.equal(put.status, 200);

    const jobs = (await call('GET', '/api/jobs')).body;
    assert.equal(jobs.count, demo.sampleJobs().length, 'a job was updated, not added');
    assert.equal(jobs.jobs.find(j => j.company === 'Fabrikam Systems').status, 'Rejected');

    const after = await scan();
    assert.ok(!after.detectedJobs.some(j => j.company === 'Fabrikam Systems'));
  });
});

describe('the sample emails are clearly invented', () => {
  it('only use reserved ".example" domains, never real mail providers', () => {
    for (const spec of demo.mailboxSpec()) {
      const domain = spec.from.match(/<[^@]+@([^>]+)>/)[1];
      assert.match(domain, /\.example$/, `${spec.id} uses ${domain}`);
    }
  });
});
