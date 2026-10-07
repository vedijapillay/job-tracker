// Matching scanned emails to jobs already in the tracker.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../server/lib/match');

const job = (id, company, jobTitle, status, updatedAt = '2026-10-01') => ({ id, company, jobTitle, status, updatedAt });

const jobs = [
  job(1, 'Nordstrom', 'Senior Product Manager - Data Strategy', 'Applied'),
  job(2, 'Nordstrom', 'Principal Engineer', 'Applied'),
  job(3, 'Boeing', 'Job at Boeing', 'Applied'),
  job(4, 'Amazon Contract', 'Technical PM', 'Recruiter Screen'),
  job(5, 'Microsoft', 'Program Manager', 'Applied', '2026-09-01'),
  job(6, 'Microsoft', 'Program Manager', 'Applied', '2026-10-02')
];
const find = (company, jobTitle) => m.findMatch({ company, jobTitle }, jobs);

describe('findMatch', () => {
  it('matches the same company and title', () => {
    assert.equal(find('Nordstrom', 'Senior Product Manager - Data Strategy').matchedJob.id, 1);
  });
  it('matches when one title contains the other', () => {
    assert.equal(find('Nordstrom', 'Senior Product Manager').matchedJob.id, 1);
  });
  it('treats "Sr." and "Senior" as the same', () => {
    assert.equal(find('Nordstrom', 'Sr. Product Manager - Data Strategy').matchedJob.id, 1);
  });
  it('treats a different role at the same company as a new job', () => {
    assert.equal(find('Nordstrom', 'Data Analyst').matchedJob, null);
  });
  it('ignores case, punctuation and company suffixes', () => {
    assert.equal(find('BOEING INC.', '').matchedJob.id, 3);
    assert.equal(m.normalizeCompany('MyWorkday T-Mobile'), 't mobile');
  });
  it('matches a real title to a single job with a placeholder title', () => {
    assert.equal(find('Boeing', 'Senior TPM').matchedJob.id, 3);
  });
  it('is ambiguous with no title and several jobs at the company', () => {
    const r = find('Nordstrom', '');
    assert.equal(r.matchedJob, null);
    assert.equal(r.similarCount, 2);
  });
  it('matches with no title when there is exactly one job at the company', () => {
    assert.equal(find('Amazon Contract', '').matchedJob.id, 4);
  });
  it('picks the most recently updated of duplicate jobs', () => {
    assert.equal(find('Microsoft', 'Program Manager').matchedJob.id, 6);
  });
  it('never matches an Unknown company', () => {
    assert.equal(find('Unknown', 'Program Manager').matchedJob, null);
  });
  it('returns nothing for a company that is not tracked', () => {
    assert.equal(find('Stripe', 'Product Manager').matchedJob, null);
  });
});

describe('shouldUpdate: only forward moves count', () => {
  const cases = [
    ['Applied', 'Rejected', true],
    ['Applied', 'Interview Scheduled', true],
    ['Rejected', 'Applied', false],
    ['Technical Round', 'Interview Scheduled', false],
    ['Applied', 'Applied', false],
    ['Offer', 'Rejected', true],
    ['Recruiter Screen', 'Applied', false],
    ['Ghosted', 'Rejected', true],
    ['Whatever the user typed', 'Applied', true],
    ['Applied', 'Offer', true],
    ['Applied', 'Declined by You', true]
  ];
  for (const [current, email, expected] of cases) {
    it(`${current} then an email saying ${email}: ${expected ? 'update' : 'ignore'}`, () => {
      assert.equal(m.shouldUpdate(current, email), expected);
    });
  }
});

describe('collapseByApplication', () => {
  const result = (id, company, jobTitle, status, subject = 'x') => ({ id, company, jobTitle, status, lastEmailSubject: subject });

  // Results arrive newest first
  const scan = [
    result('a', 'Nordstrom', 'Senior Product Manager', 'Rejected', 'Update'),
    result('b', 'Nordstrom', 'Sr. Product Manager', 'Applied', 'Thanks'),
    result('c', 'SuperGraphics LLC', 'Sr. Project Manager', 'Applied'),
    result('d', 'Acme', 'Sr. Project Manager', 'Applied'),
    result('e', 'Via', '', 'Applied', 'Thanks for applying to Via!'),
    result('f', 'Via', '', 'Applied', 'Thanks for applying to Via!')
  ];
  const out = m.collapseByApplication(scan);

  it('keeps the furthest-along email for one application', () => {
    const nordstrom = out.filter(r => r.company === 'Nordstrom');
    assert.equal(nordstrom.length, 1);
    assert.equal(nordstrom[0].status, 'Rejected');
  });
  it('keeps same-title jobs at different companies apart', () => {
    assert.equal(out.filter(r => /Project/.test(r.jobTitle)).length, 2);
  });
  it('keeps the newest of identical title-less emails', () => {
    const via = out.filter(r => r.company === 'Via');
    assert.equal(via.length, 1);
    assert.equal(via[0].id, 'e');
  });
  it('returns one result per application', () => {
    assert.equal(out.length, 4);
  });
});
