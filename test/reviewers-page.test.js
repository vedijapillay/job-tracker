// The reviewer guide (site/reviewers.html) promises a result for each sample email.
// This reads the page itself and checks the classifier really produces those results,
// so the instructions Google follows can never drift away from how the app behaves.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const c = require('../server/lib/classify');

const html = fs.readFileSync(path.join(__dirname, '../site/reviewers.html'), 'utf8');

// Rows of the sample-email table: <tr data-status=...><td>subject</td><td>body</td>...
const rows = [...html.matchAll(/<tr data-status="([^"]*)"(?: data-company="([^"]*)")?(?: data-title="([^"]*)")?>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)]
  .map(([, status, company, title, subject, body]) => ({ status, company, title, subject, body }));

describe('reviewer guide', () => {
  it('lists the sample emails', () => {
    assert.ok(rows.length >= 4, `found only ${rows.length} sample rows`);
  });

  for (const row of rows) {
    it(`"${row.subject}" gives the result the page promises`, () => {
      const from = 'Sender <sender@mail.example>';
      const body = c.cleanBody(row.body);
      const result = c.classify(from, row.subject, body);

      if (row.status === 'none') {
        assert.equal(result.status, 'Review', 'a non-job email must be ignored');
        return;
      }
      const info = c.extractJobInfo(from, row.subject, body);
      assert.equal(result.status, row.status);
      assert.equal(info.company, row.company);
      assert.equal(info.jobTitle, row.title);
    });
  }

  it('names the only permission the app requests, and no other', () => {
    const requested = fs.readFileSync(path.join(__dirname, '../server/routes/gmail.js'), 'utf8')
      .match(/https:\/\/www\.googleapis\.com\/auth\/[\w.]+/g);
    assert.deepEqual([...new Set(requested)], ['https://www.googleapis.com/auth/gmail.readonly']);
    assert.ok(html.includes('https://www.googleapis.com/auth/gmail.readonly'));
  });

  it('tells reviewers to run the same commands the README does', () => {
    for (const command of ['git clone https://github.com/vedijapillay/job-tracker.git', 'npm run setup', 'npm start']) {
      assert.ok(html.includes(command), `missing: ${command}`);
    }
    const scripts = require('../package.json').scripts;
    assert.ok(scripts.setup && scripts.start && scripts.demo);
  });

  it('uses the redirect address the app really sends to Google', () => {
    assert.ok(html.includes('http://localhost:3000/api/gmail/auth/callback'));
    const config = fs.readFileSync(path.join(__dirname, '../server/lib/googleConfig.js'), 'utf8');
    assert.ok(config.includes('/api/gmail/auth/callback'));
  });
});
