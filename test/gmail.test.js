// Gmail sign-in, token storage and the scan, with Google stubbed out.
// No network calls are made and no real mail is involved.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

const tempDir = helpers.useTempDb();
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-value';
delete process.env.GOOGLE_REDIRECT_URI;
delete process.env.FRONTEND_URL;
process.env.PORT = '3000';

const { google } = require('googleapis');
const db = require('../server/db');
const gmailRouter = require('../server/routes/gmail');
const { classifierVersion } = require('../server/lib/version');

// ---- a fake Gmail mailbox ----
const mailbox = {
  messages: {},        // id -> Gmail API message
  listIds: [],         // ids returned by every search
  queries: [],         // searches the app ran
  gets: [],            // message ids fetched
  flaky: new Set(),    // ids that fail once with a 429
  listError: null,
  credentials: null,   // what the app authenticated with
  delay: 15,
  inflight: 0,
  maxInflight: 0
};

google.gmail = ({ auth }) => {
  mailbox.credentials = auth && auth.credentials;
  return {
    users: {
      messages: {
        list: async ({ q, maxResults }) => {
          mailbox.queries.push({ q, maxResults });
          if (mailbox.listError) throw mailbox.listError;
          const ids = typeof mailbox.listIds === 'function' ? mailbox.listIds(q) : mailbox.listIds;
          return { data: { messages: ids.map(id => ({ id })) } };
        },
        get: async ({ id }) => {
          mailbox.inflight++;
          mailbox.maxInflight = Math.max(mailbox.maxInflight, mailbox.inflight);
          await helpers.sleep(mailbox.delay);
          mailbox.inflight--;
          if (mailbox.flaky.has(id)) {
            mailbox.flaky.delete(id);
            throw Object.assign(new Error('rate limited'), { code: 429 });
          }
          mailbox.gets.push(id);
          if (!mailbox.messages[id]) throw new Error('no such message');
          return { data: mailbox.messages[id] };
        }
      }
    }
  };
};

// The token exchange is the only Google call the sign-in makes
google.auth.OAuth2.prototype.getToken = async function (code) {
  return { tokens: { access_token: 'at', refresh_token: code === 'no-refresh' ? undefined : 'rt-1' } };
};

const message = (id, from, subject, body, ts) => helpers.makeMessage({ id, from, subject, body, ts });

function setMailbox(list) {
  mailbox.messages = {};
  for (const m of list) mailbox.messages[m.id] = m;
  mailbox.listIds = list.map(m => m.id);
}

const NORDSTROM_REJECTION = (id, ts) => message(id, 'Workday Nordstrom <nordstrom@myworkday.com>', 'Application Update for Senior PM',
  'We will not be moving forward with other candidates for this position.', ts);

let app;
const call = (method, path, body) => fetch(app.base + '/api/gmail' + path, {
  method,
  redirect: 'manual',
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
});
const scan = async () => { const r = await call('POST', '/scan'); return { status: r.status, body: await r.json() }; };
const run = (sql) => new Promise((resolve, reject) => db.db.run(sql, err => (err ? reject(err) : resolve())));

before(async () => {
  await helpers.waitForSchema(db);
  app = await helpers.startApp(a => a.use('/api/gmail', gmailRouter));
});
after(async () => {
  if (app) await app.close();
  await helpers.cleanupTempDb(tempDir, db);
});
beforeEach(async () => {
  for (const table of ['jobs', 'processed_emails', 'scanned_emails', 'gmail_auth']) await run(`DELETE FROM ${table}`);
  Object.assign(mailbox, { queries: [], gets: [], listError: null, credentials: null, inflight: 0, maxInflight: 0, delay: 15 });
  mailbox.flaky.clear();
  setMailbox([]);
});

describe('connecting', () => {
  it('starts out not connected, and scanning asks you to sign in', async () => {
    assert.equal((await (await call('GET', '/status')).json()).connected, false);
    const r = await scan();
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'not_connected');
  });

  it('builds a sign-in URL that asks for offline access, consent and a state value', async () => {
    const { authUrl } = await (await call('GET', '/auth')).json();
    const url = new URL(authUrl);
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
    assert.ok(url.searchParams.get('state').length >= 16);
  });

  const stateFromAuth = async () => new URL((await (await call('GET', '/auth')).json()).authUrl).searchParams.get('state');

  it('rejects a callback with a forged or missing state, and stores nothing', async () => {
    assert.equal((await call('GET', '/auth/callback?code=abc&state=forged')).status, 400);
    assert.equal((await call('GET', '/auth/callback?code=abc')).status, 400);
    assert.equal(await db.getRefreshToken(), null);
  });

  it('completes sign-in: stores the refresh token and redirects with no credentials in the URL', async () => {
    const state = await stateFromAuth();
    const r = await call('GET', `/auth/callback?code=abc&state=${state}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'http://localhost:3000/#gmail=connected');
    assert.equal(await db.getRefreshToken(), 'rt-1');
    assert.equal((await (await call('GET', '/status')).json()).connected, true);
  });

  it('accepts each state only once', async () => {
    const state = await stateFromAuth();
    assert.equal((await call('GET', `/auth/callback?code=abc&state=${state}`)).status, 302);
    assert.equal((await call('GET', `/auth/callback?code=abc&state=${state}`)).status, 400);
  });

  it('explains clearly when Google returns no refresh token and none is stored', async () => {
    const state = await stateFromAuth();
    const r = await call('GET', `/auth/callback?code=no-refresh&state=${state}`);
    assert.equal(r.status, 500);
    assert.match((await r.json()).details, /refresh token/i);
  });

  it('keeps an existing sign-in when Google returns no new refresh token', async () => {
    await db.saveRefreshToken('existing');
    const state = await stateFromAuth();
    const r = await call('GET', `/auth/callback?code=no-refresh&state=${state}`);
    assert.equal(r.status, 302);
    assert.equal(await db.getRefreshToken(), 'existing');
  });

  it('disconnects by forgetting the stored sign-in', async () => {
    await db.saveRefreshToken('rt');
    assert.equal((await call('POST', '/disconnect')).status, 200);
    assert.equal(await db.getRefreshToken(), null);
  });
});

describe('scanning', () => {
  // 60 unrelated emails and 3 job emails
  const noise = Array.from({ length: 60 }, (_, i) => message(`n${i}`, 'Bob <bob@gmail.com>', `Lunch ${i}`, 'want to grab lunch?', 1e12 + i));
  const jobEmails = [
    NORDSTROM_REJECTION('j1', 1.7e12),
    message('j2', 'Phil <phil@ziprecruiter.com>', 'Your "PM" application is complete', 'Your application is complete for PM at Acme Corp!', 1.71e12),
    message('j3', 'Via <no-reply@ridewithvia.com>', 'Thanks for applying to Via!', 'We received your application.', 1.72e12)
  ];

  beforeEach(async () => {
    await db.saveRefreshToken('rt-1');
    setMailbox([...noise, ...jobEmails]);
  });

  it('signs in with the stored refresh token', async () => {
    await scan();
    assert.equal(mailbox.credentials.refresh_token, 'rt-1');
  });

  it('finds the job emails and fetches every message once, in parallel', async () => {
    const { status, body } = await scan();
    assert.equal(status, 200);
    assert.deepEqual(body.detectedJobs.map(j => j.company).sort(), ['Acme Corp', 'Nordstrom', 'Via']);
    assert.equal(body.stats.listed, 63);
    assert.equal(body.stats.fetched, 63);
    assert.equal(body.stats.skipped, 0);
    assert.equal(new Set(mailbox.gets).size, 63);
    assert.ok(mailbox.maxInflight > 1, 'fetches should overlap');
    assert.ok(mailbox.maxInflight <= 8, 'at most 8 at a time');
  });

  it('does not leak internal fields and reports confidence', async () => {
    const { body } = await scan();
    for (const job of body.detectedJobs) {
      assert.ok(!('receivedAt' in job));
      assert.ok(job.confidence);
      assert.equal(job.source, 'Gmail');
    }
  });

  it('skips emails already judged not job-related on the next scan', async () => {
    await scan();
    mailbox.gets = [];
    const { body } = await scan();
    assert.equal(body.stats.fetched, 3);
    assert.equal(body.stats.skipped, 60);
    assert.equal(body.count, 3);
  });

  it('ignores cache entries left by an older classifier version, and cleans them up', async () => {
    // Pretend an earlier version of the classifier judged these emails not job-related
    // (one of them is for an email that has since left the results, so only the cleanup removes it)
    await db.markEmailsIgnored([...noise.map(m => m.id), 'no-longer-in-inbox'], 'older-classifier-version');

    const { body } = await scan();
    assert.equal(body.stats.fetched, 63, 'old judgments must not be trusted');
    assert.equal(body.stats.skipped, 0);
    assert.equal((await db.getIgnoredEmailIds('older-classifier-version')).size, 0, 'old entries are removed, including stale ones');
    assert.ok((await db.getIgnoredEmailIds(classifierVersion)).size >= 60, 'fresh judgments are cached');
  });

  it('retries a message that fails with a rate limit', async () => {
    mailbox.flaky.add('j2');
    const { body } = await scan();
    assert.equal(body.count, 3);
    assert.ok(mailbox.gets.includes('j2'));
  });

  it('does not cache a message that errors, so it is tried again', async () => {
    mailbox.listIds = [...mailbox.listIds, 'missing'];
    await scan();
    const ignored = await db.getIgnoredEmailIds(classifierVersion);
    assert.ok(!ignored.has('missing'));
    assert.ok(ignored.has('n0'));
  });

  it('skips dismissed emails', async () => {
    await db.markEmailProcessed({ messageId: 'j3', reason: 'dismissed', sender: 's', subject: 's' });
    const { body } = await scan();
    assert.ok(!body.detectedJobs.some(j => j.company === 'Via'));
  });

  it('skips an email that already has a job, until that job is deleted', async () => {
    await db.insertJob({ company: 'Via', jobTitle: 'PM', appliedDate: '2026-10-01', emailId: 'j3' });
    assert.ok(!(await scan()).body.detectedJobs.some(j => j.company === 'Via'));

    await run("DELETE FROM jobs WHERE emailId = 'j3'");
    assert.ok((await scan()).body.detectedJobs.some(j => j.company === 'Via'));
  });

  it('asks you to sign in again when Google revokes access, and forgets the old token', async () => {
    mailbox.listError = new Error('invalid_grant');
    const { status, body } = await scan();
    assert.equal(status, 401);
    assert.equal(body.code, 'reauth_required');
    assert.equal(await db.getRefreshToken(), null);
  });

  it('reports other failures as a server error', async () => {
    mailbox.listError = new Error('boom');
    const { status, body } = await scan();
    assert.equal(status, 500);
    assert.equal(body.error, 'Failed to scan Gmail');
  });
});

describe('searches', () => {
  beforeEach(async () => { await db.saveRefreshToken('rt-1'); });

  it('excludes Promotions and Social, and separately searches known job senders everywhere', async () => {
    setMailbox([]);
    await scan();
    assert.equal(mailbox.queries.length, 2);
    assert.match(mailbox.queries[0].q, /-category:promotions -category:social/);
    assert.match(mailbox.queries[1].q, /from:\(/);
    assert.ok(!/-category/.test(mailbox.queries[1].q));
    assert.match(mailbox.queries[0].q, /offer/);
  });

  it('merges results from both searches and fetches each message once', async () => {
    mailbox.messages = {
      m1: NORDSTROM_REJECTION('m1', 1.7e12),
      m2: message('m2', 'Via <no-reply@ridewithvia.com>', 'Thanks for applying to Via!', 'We received your application.', 1.71e12)
    };
    mailbox.listIds = (q) => (q.includes('from:(') ? ['m1', 'm2'] : ['m2', 'm1']);
    const { body } = await scan();
    assert.deepEqual([...mailbox.gets].sort(), ['m1', 'm2']);
    assert.equal(body.count, 2);
  });
});

describe('matching scanned emails to the tracker', () => {
  beforeEach(async () => { await db.saveRefreshToken('rt-1'); });

  const applied = (id, ts) => message(id, 'Workday Nordstrom <nordstrom@myworkday.com>', 'Thanks for applying to Nordstrom',
    'We received your application for the Senior PM position.', ts);

  it('collapses an Applied and a Rejected email for one job into the rejection', async () => {
    setMailbox([NORDSTROM_REJECTION('r1', 1.72e12), applied('a1', 1.70e12)]);
    const { body } = await scan();
    assert.equal(body.count, 1);
    assert.equal(body.detectedJobs[0].status, 'Rejected');
  });

  it('offers to update a tracked job when an email moves it forward', async () => {
    const tracked = await db.insertJob({ company: 'Nordstrom', jobTitle: 'Senior PM', appliedDate: '2026-09-01', status: 'Applied' });
    setMailbox([NORDSTROM_REJECTION('r1', 1.72e12)]);
    const { body } = await scan();
    assert.equal(body.count, 1);
    assert.equal(body.detectedJobs[0].matchedJob.id, tracked.id);
    assert.equal(body.detectedJobs[0].matchedJob.status, 'Applied');
    assert.equal(body.detectedJobs[0].status, 'Rejected');
  });

  it('drops an email that would move a tracked job backwards', async () => {
    await db.insertJob({ company: 'Nordstrom', jobTitle: 'Senior PM', appliedDate: '2026-09-01', status: 'Rejected' });
    setMailbox([applied('a1', 1.70e12)]);
    const { body } = await scan();
    assert.equal(body.count, 0);
    assert.equal(body.alreadyTracked, 1);
  });

  it('treats an email for a different role at the same company as a new job', async () => {
    await db.insertJob({ company: 'Nordstrom', jobTitle: 'Principal Engineer', appliedDate: '2026-09-01', status: 'Applied' });
    setMailbox([NORDSTROM_REJECTION('r1', 1.72e12)]);
    const { body } = await scan();
    assert.equal(body.count, 1);
    assert.equal(body.detectedJobs[0].matchedJob, null);
  });

  it('keeps two same-title jobs at different companies', async () => {
    setMailbox([
      message('z1', 'Phil <phil@ziprecruiter.com>', 'Your "Sr. Project Manager" application is complete', 'Your application is complete for Sr. Project Manager at Acme Corp!', 1.71e12),
      message('z2', 'Phil <phil@ziprecruiter.com>', 'Your "Sr. Project Manager" application is complete', 'Your application is complete for Sr. Project Manager at Globex!', 1.72e12)
    ]);
    const { body } = await scan();
    assert.deepEqual(body.detectedJobs.map(j => j.company).sort(), ['Acme Corp', 'Globex']);
  });

  it('reports an empty inbox cleanly', async () => {
    setMailbox([]);
    const { status, body } = await scan();
    assert.equal(status, 200);
    assert.deepEqual(body.detectedJobs, []);
  });
});
