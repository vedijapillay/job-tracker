// Jobs API and the database behaviour behind it.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

const tempDir = helpers.useTempDb(); // must run before the server modules are loaded
const db = require('../server/db');
const jobsRouter = require('../server/routes/jobs');
const gmailRouter = require('../server/routes/gmail');

let app;
const call = (method, path, body) => fetch(app.base + path, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
});
const json = async (response) => response.json();

const newJob = (overrides = {}) => ({ company: 'Acme', jobTitle: 'Product Manager', appliedDate: '2026-10-01', ...overrides });
const create = async (overrides) => (await json(await call('POST', '/api/jobs', newJob(overrides)))).job;

before(async () => {
  await helpers.waitForSchema(db);
  app = await helpers.startApp(a => { a.use('/api/jobs', jobsRouter); a.use('/api/gmail', gmailRouter); });
});
after(async () => {
  await app.close();
  await helpers.cleanupTempDb(tempDir, db);
});

describe('creating jobs', () => {
  it('creates a job and defaults the status to Applied', async () => {
    const r = await call('POST', '/api/jobs', newJob());
    assert.equal(r.status, 201);
    const { job } = await json(r);
    assert.equal(job.status, 'Applied');
    assert.ok(job.id);
  });

  for (const missing of ['company', 'jobTitle', 'appliedDate']) {
    it(`rejects a job with no ${missing}`, async () => {
      const body = newJob();
      delete body[missing];
      const r = await call('POST', '/api/jobs', body);
      assert.equal(r.status, 400);
      assert.match((await json(r)).error, /Missing required fields/);
    });
  }
});

describe('reading jobs', () => {
  it('lists jobs and filters by status and source', async () => {
    await create({ company: 'FilterCo', status: 'Rejected', source: 'Gmail' });
    await create({ company: 'FilterCo2', status: 'Offer', source: 'Builtin' });

    const rejected = await json(await call('GET', '/api/jobs?status=Rejected'));
    assert.ok(rejected.jobs.length >= 1);
    assert.ok(rejected.jobs.every(j => j.status === 'Rejected'));

    const builtin = await json(await call('GET', '/api/jobs?source=Builtin'));
    assert.ok(builtin.jobs.every(j => j.source === 'Builtin'));
    assert.ok(builtin.jobs.some(j => j.company === 'FilterCo2'));
  });

  it('gets one job, and 404s for an unknown id', async () => {
    const job = await create({ company: 'FindMe' });
    const found = await json(await call('GET', `/api/jobs/${job.id}`));
    assert.equal((found.job || found).company, 'FindMe');
    assert.equal((await call('GET', '/api/jobs/999999')).status, 404);
  });
});

describe('updating jobs', () => {
  it('updates the status', async () => {
    const job = await create();
    const r = await call('PUT', `/api/jobs/${job.id}`, { status: 'Rejected' });
    assert.equal(r.status, 200);
    const after = await json(await call('GET', `/api/jobs/${job.id}`));
    assert.equal((after.job || after).status, 'Rejected');
  });

  it('accepts the email fields the scanner sends', async () => {
    const job = await create();
    const r = await call('PUT', `/api/jobs/${job.id}`, { status: 'Interview Scheduled', lastEmailDate: '2026-10-05', lastEmailSubject: 'Interview', emailId: 'msg-1' });
    assert.equal(r.status, 200);
  });

  it('rejects fields that cannot be updated', async () => {
    const job = await create();
    const r = await call('PUT', `/api/jobs/${job.id}`, { id: 5, appliedDate: '2020-01-01' });
    assert.equal(r.status, 400);
    assert.match((await json(r)).error, /Invalid fields/);
  });

  it('404s for an unknown job and 400s for a bad id', async () => {
    assert.equal((await call('PUT', '/api/jobs/999999', { status: 'Offer' })).status, 404);
    assert.equal((await call('PUT', '/api/jobs/abc', { status: 'Offer' })).status, 400);
  });
});

describe('deleting jobs', () => {
  it('deletes one job', async () => {
    const job = await create();
    assert.equal((await call('DELETE', `/api/jobs/${job.id}`)).status, 200);
    assert.equal((await call('GET', `/api/jobs/${job.id}`)).status, 404);
  });

  it('404s when deleting a job that does not exist', async () => {
    assert.equal((await call('DELETE', '/api/jobs/999999')).status, 404);
  });

  it('deletes several jobs at once and reports how many', async () => {
    const [a, b, keep] = [await create(), await create(), await create({ company: 'KeepMe' })];
    const r = await call('DELETE', '/api/jobs', { ids: [a.id, b.id] });
    assert.equal(r.status, 200);
    assert.equal((await json(r)).deletedCount, 2);
    assert.equal((await call('GET', `/api/jobs/${keep.id}`)).status, 200);
  });

  it('reports 0 for ids that do not exist', async () => {
    const r = await call('DELETE', '/api/jobs', { ids: [987654, 987655] });
    assert.equal((await json(r)).deletedCount, 0);
  });

  for (const [name, body] of [
    ['an empty list', { ids: [] }],
    ['non-integer ids', { ids: ['a'] }],
    ['a missing ids field', {}],
    ['ids that are not an array', { ids: 5 }]
  ]) {
    it(`rejects bulk delete with ${name}`, async () => {
      assert.equal((await call('DELETE', '/api/jobs', body)).status, 400);
    });
  }
});

describe('emails linked to jobs', () => {
  it('skips an email while its job exists and releases it when the job is deleted', async () => {
    const job = await create({ emailId: 'linked-msg-1' });
    assert.ok((await db.getProcessedEmailIds()).has('linked-msg-1'));

    await call('DELETE', `/api/jobs/${job.id}`);
    assert.ok(!(await db.getProcessedEmailIds()).has('linked-msg-1'));
  });

  it('links the newest email when a job is updated', async () => {
    const job = await create({ emailId: 'old-msg' });
    await call('PUT', `/api/jobs/${job.id}`, { emailId: 'new-msg' });
    const skip = await db.getProcessedEmailIds();
    assert.ok(skip.has('new-msg'));
    assert.ok(!skip.has('old-msg'));
  });
});

describe('dismissed emails', () => {
  it('remembers a dismissed email permanently', async () => {
    const r = await call('POST', '/api/gmail/processed', { id: 'dismissed-1', reason: 'dismissed', senderEmail: 'a@b.com', subject: 's' });
    assert.equal(r.status, 200);
    assert.ok((await db.getProcessedEmailIds()).has('dismissed-1'));
  });

  it('rejects a missing id and any reason other than dismissed', async () => {
    assert.equal((await call('POST', '/api/gmail/processed', { reason: 'dismissed' })).status, 400);
    assert.equal((await call('POST', '/api/gmail/processed', { id: 'x', reason: 'added' })).status, 400);
    assert.equal((await call('POST', '/api/gmail/processed', { id: 'x', reason: 'bogus' })).status, 400);
  });
});

describe('cache of emails judged not job-related', () => {
  it('stores ids per classifier version and prunes other versions', async () => {
    await db.markEmailsIgnored(['i1', 'i2'], 'v1');
    assert.deepEqual([...(await db.getIgnoredEmailIds('v1'))].sort(), ['i1', 'i2']);
    assert.equal((await db.getIgnoredEmailIds('v2')).size, 0);

    await db.pruneIgnoredEmails('v2');
    assert.equal((await db.getIgnoredEmailIds('v1')).size, 0);
  });

  it('does nothing for an empty list', async () => {
    assert.deepEqual(await db.markEmailsIgnored([], 'v1'), { changes: 0 });
  });
});
