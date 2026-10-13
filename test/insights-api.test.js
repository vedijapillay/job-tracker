// GET /api/insights, and what the demo's sample data looks like through it.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

const tempDir = helpers.useTempDb();
const db = require('../server/db');
const jobsRouter = require('../server/routes/jobs');
const insightsRouter = require('../server/routes/insights');

let app;
const get = async (urlPath) => {
  const response = await fetch(app.base + urlPath);
  return { status: response.status, body: await response.json() };
};
const addJob = (overrides = {}) => fetch(app.base + '/api/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ company: 'Acme', jobTitle: 'PM', appliedDate: new Date().toISOString().split('T')[0], source: 'LinkedIn', ...overrides })
});

before(async () => {
  await helpers.waitForSchema(db);
  app = await helpers.startApp(a => { a.use('/api/jobs', jobsRouter); a.use('/api/insights', insightsRouter); });
});
after(async () => {
  if (app) await app.close();
  await helpers.cleanupTempDb(tempDir, db);
});

describe('GET /api/insights', () => {
  it('works with no jobs at all', async () => {
    const { status, body } = await get('/api/insights');
    assert.equal(status, 200);
    assert.equal(body.total, 0);
    assert.equal(body.kpis.replyRate, null);
    assert.equal(body.weekly.length, 12);
    assert.equal(body.outcomes.length, 5);
  });

  it('reflects jobs as they are added and moved forward', async () => {
    await addJob({ status: 'Applied' });
    await addJob({ status: 'Offer', company: 'Bigco' });
    const rejected = await (await addJob({ company: 'Gone Co' })).json();
    await fetch(`${app.base}/api/jobs/${rejected.job.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Technical Round' })
    });
    await fetch(`${app.base}/api/jobs/${rejected.job.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Rejected' })
    });

    const { body } = await get('/api/insights');
    assert.equal(body.total, 3);
    // The rejected job still counts as having reached the interview stages
    assert.deepEqual(body.funnel.map(step => step.count), [3, 2, 2, 1]);
    assert.equal(body.outcomes.find(o => o.key === 'rejected').count, 1);
    assert.equal(body.outcomes.find(o => o.key === 'offer').count, 1);
  });

  it('applies the date range', async () => {
    await addJob({ appliedDate: '2020-01-01', company: 'Ancient Co' });
    const all = (await get('/api/insights?range=all')).body.total;
    const recent = (await get('/api/insights?range=30')).body.total;
    assert.equal(all - recent, 1);
  });

  it('rejects an unknown range with a helpful message', async () => {
    const { status, body } = await get('/api/insights?range=7');
    assert.equal(status, 400);
    assert.match(body.error, /range must be one of: all, 30, 90/);
  });

  it('returns everything the charts need', async () => {
    const { body } = await get('/api/insights?range=90');
    for (const key of ['range', 'today', 'total', 'smallSample', 'kpis', 'funnel', 'outcomes', 'weekly', 'sources', 'highlights']) {
      assert.ok(key in body, `missing ${key}`);
    }
    assert.equal(body.funnel.length, 4);
    assert.equal(body.weekly.length, 13);
  });
});
