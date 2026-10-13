// The numbers behind the Insights tab. Every definition is pinned down here, because a chart is
// only as honest as the arithmetic under it.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeInsights, weekStart } = require('../server/lib/insights');
const stages = require('../server/lib/stages');

const TODAY = '2026-10-14'; // a Wednesday
const job = (status, appliedDate, extra = {}) => ({ status, appliedDate, source: 'LinkedIn', ...extra });
const insights = (jobs, options = {}) => computeInsights(jobs, { today: TODAY, ...options });

describe('stages: how far a job has got', () => {
  it('ranks the stages in order, with closed statuses outside the ladder', () => {
    assert.equal(stages.progressRank('Applied'), 1);
    assert.equal(stages.progressRank('Recruiter Screen'), stages.progressRank('Interview Scheduled'));
    assert.equal(stages.progressRank('Technical Round'), stages.progressRank('HM Round'));
    assert.ok(stages.progressRank('Offer') > stages.progressRank('HM Round'));
    for (const closed of stages.CLOSED_STATUSES) assert.equal(stages.progressRank(closed), 0);
  });

  it('only ever moves forward', () => {
    assert.equal(stages.reachedAfter('Applied', 'Technical Round'), 'Technical Round');
    assert.equal(stages.reachedAfter('Technical Round', 'Applied'), 'Technical Round');
    assert.equal(stages.reachedAfter('Offer', 'HM Round'), 'Offer');
  });

  it('keeps the stage a job reached when it is closed', () => {
    assert.equal(stages.reachedAfter('Technical Round', 'Rejected'), 'Technical Round');
    assert.equal(stages.reachedAfter('HM Round', 'Declined by You'), 'HM Round');
    assert.equal(stages.reachedAfter('Applied', 'Ghosted'), 'Applied');
  });

  it('counts a job as at least Applied, and starts from the current status when there is no history', () => {
    assert.equal(stages.reachedAfter(null, 'Rejected'), 'Applied');
    assert.equal(stages.initialReached('Offer'), 'Offer');
    assert.equal(stages.initialReached('Rejected'), 'Applied');
    assert.equal(stages.initialReached('Interview Scheduled'), 'Interview Scheduled');
  });

  it('does not move sideways between stages of the same rank', () => {
    assert.equal(stages.reachedAfter('Recruiter Screen', 'Interview Scheduled'), 'Recruiter Screen');
  });
});

describe('funnel', () => {
  const jobs = [
    job('Applied', '2026-10-10'),
    job('Applied', '2026-10-09'),
    job('Recruiter Screen', '2026-10-01'),
    job('Technical Round', '2026-09-28'),
    job('Rejected', '2026-09-20', { reachedStage: 'HM Round' }), // got far, then was rejected
    job('Rejected', '2026-09-18'),                                // rejected straight away
    job('Offer', '2026-09-05')
  ];
  const { funnel } = insights(jobs);

  it('counts every application at the top', () => {
    assert.equal(funnel[0].count, 7);
    assert.equal(funnel[0].pctOfTotal, 100);
    assert.equal(funnel[0].pctOfPrevious, null);
  });

  it('counts a job at the furthest stage it reached, even if it was later rejected', () => {
    assert.deepEqual(funnel.map(step => step.count), [7, 4, 3, 1]);
  });

  it('never grows from one step to the next', () => {
    for (let i = 1; i < funnel.length; i++) assert.ok(funnel[i].count <= funnel[i - 1].count);
  });

  it('gives the share of the total and the share of the step before', () => {
    assert.equal(funnel[1].pctOfTotal, 57);   // 4 of 7
    assert.equal(funnel[1].pctOfPrevious, 57);
    assert.equal(funnel[2].pctOfPrevious, 75); // 3 of 4
    assert.equal(funnel[3].pctOfPrevious, 33); // 1 of 3
  });

  it('works for jobs saved before furthest stage was recorded', () => {
    const old = insights([{ status: 'HM Round', appliedDate: '2026-10-01', source: 'x' }]).funnel;
    assert.deepEqual(old.map(step => step.count), [1, 1, 1, 0]);
  });
});

describe('outcomes', () => {
  const jobs = [
    job('Applied', '2026-10-10'), job('Recruiter Screen', '2026-10-09'), job('HM Round', '2026-10-08'),
    job('Rejected', '2026-10-01'), job('Rejected', '2026-10-02'),
    job('Offer', '2026-10-03'), job('Ghosted', '2026-09-01'), job('Declined by You', '2026-09-02')
  ];
  const { outcomes } = insights(jobs);
  const count = (key) => outcomes.find(o => o.key === key).count;

  it('groups the open stages together', () => assert.equal(count('inProgress'), 3));
  it('counts each closed outcome on its own', () => {
    assert.equal(count('rejected'), 2);
    assert.equal(count('offer'), 1);
    assert.equal(count('ghosted'), 1);
    assert.equal(count('declined'), 1);
  });
  it('accounts for every job exactly once', () => {
    assert.equal(outcomes.reduce((sum, o) => sum + o.count, 0), jobs.length);
  });
  it('always lists all five outcomes, in a fixed order, even when empty', () => {
    assert.deepEqual(insights([]).outcomes.map(o => o.key), ['inProgress', 'rejected', 'offer', 'ghosted', 'declined']);
  });
});

describe('headline numbers', () => {
  const jobs = [
    job('Applied', '2026-10-12'), job('Applied', '2026-10-11'),
    job('Recruiter Screen', '2026-10-01'), job('Rejected', '2026-09-20', { reachedStage: 'Technical Round' }),
    job('Rejected', '2026-09-19'), job('Offer', '2026-09-10'), job('Ghosted', '2026-08-30'), job('Declined by You', '2026-09-01', { reachedStage: 'HM Round' })
  ];
  const { kpis } = insights(jobs);

  it('total is the number of applications', () => assert.equal(kpis.total, 8));
  it('active excludes jobs that have ended', () => assert.equal(kpis.active, 8 - 4)); // rejected x2, ghosted, declined
  it('a reply is anything other than Applied or no reply', () => {
    // Recruiter Screen, Rejected x2, Offer and Declined by You; not the two Applied or the Ghosted one
    assert.equal(kpis.replied, 5);
  });
  it('reply rate', () => assert.equal(kpis.replyRate, 63)); // 5 of 8
  it('interview rate counts jobs that ever reached a screen, including rejected ones', () => {
    // Recruiter Screen, Rejected(reached Technical), Offer, Declined(reached HM) = 4 of 8
    assert.equal(kpis.interviewRate, 50);
  });
  it('offer rate', () => assert.equal(kpis.offerRate, 13)); // 1 of 8
  it('applications this week and in the last four weeks', () => {
    // Today is Wednesday Oct 14, so this week began Monday Oct 12. Sunday Oct 11 is last week.
    assert.equal(kpis.thisWeek, 1);
    // Weeks starting Sep 21, Sep 28, Oct 5 and Oct 12 hold the jobs from Oct 1, Oct 11 and Oct 12
    assert.equal(kpis.lastFourWeeks, 3);
  });
});

describe('rates with no data', () => {
  it('never divides by zero', () => {
    const r = insights([]);
    assert.equal(r.total, 0);
    for (const rate of [r.kpis.replyRate, r.kpis.interviewRate, r.kpis.offerRate]) assert.equal(rate, null);
    assert.ok(r.funnel.every(step => step.count === 0 && step.pctOfTotal === null && step.pctOfPrevious === null));
    assert.ok(r.outcomes.every(o => o.pct === null));
    assert.deepEqual(r.sources, []);
    assert.deepEqual(r.highlights, []);
  });

  it('flags a small sample', () => {
    assert.equal(insights([job('Applied', '2026-10-10')]).smallSample, true);
    assert.equal(insights(Array.from({ length: 10 }, () => job('Applied', '2026-10-10'))).smallSample, false);
  });
});

describe('weeks', () => {
  it('weeks start on Monday', () => {
    assert.equal(weekStart('2026-10-14'), '2026-10-12'); // Wednesday
    assert.equal(weekStart('2026-10-12'), '2026-10-12'); // Monday
    assert.equal(weekStart('2026-10-18'), '2026-10-12'); // Sunday belongs to the week before the next Monday
    assert.equal(weekStart('2026-10-19'), '2026-10-19');
  });

  it('covers 12 weeks ending this week, including empty ones', () => {
    const { weekly } = insights([job('Applied', '2026-10-13')]);
    assert.equal(weekly.length, 12);
    assert.equal(weekly[11].weekStart, '2026-10-12');
    assert.equal(weekly[0].weekStart, '2026-07-27');
    assert.equal(weekly[11].count, 1);
    assert.equal(weekly.slice(0, 11).reduce((s, w) => s + w.count, 0), 0);
  });

  it('puts each application in the week it was made, with Sunday at the end of its week', () => {
    const { weekly } = insights([job('Applied', '2026-10-11'), job('Applied', '2026-10-12'), job('Applied', '2026-10-06')]);
    const byStart = Object.fromEntries(weekly.map(w => [w.weekStart, w.count]));
    assert.equal(byStart['2026-10-05'], 2); // Oct 6 and Sunday Oct 11
    assert.equal(byStart['2026-10-12'], 1);
  });

  it('ignores applications older than the chart shows, and bad dates', () => {
    const { weekly } = insights([job('Applied', '2025-01-01'), job('Applied', 'not a date'), job('Applied', '')]);
    assert.equal(weekly.reduce((s, w) => s + w.count, 0), 0);
  });

  it('labels weeks by their Monday', () => {
    assert.equal(insights([]).weekly[11].label, 'Oct 12');
  });

  it('is not shifted by the time zone', () => {
    const jobs = [job('Applied', '2026-10-12')];
    for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const code = `const {computeInsights}=require(${JSON.stringify(require.resolve('../server/lib/insights'))});` +
        `const r=computeInsights(${JSON.stringify(jobs)},{today:'${TODAY}'});console.log(r.weekly[11].weekStart+':'+r.weekly[11].count)`;
      const out = require('node:child_process').execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz } }).toString().trim();
      assert.equal(out, '2026-10-12:1', `wrong in ${tz}`);
    }
  });
});

describe('date range', () => {
  const jobs = [job('Applied', '2026-10-10'), job('Applied', '2026-09-20'), job('Applied', '2026-08-01'), job('Applied', '2026-03-01')];

  it('all time includes everything', () => assert.equal(insights(jobs, { range: 'all' }).total, 4));
  it('the last 30 days', () => assert.equal(insights(jobs, { range: '30' }).total, 2));
  it('the last 90 days', () => assert.equal(insights(jobs, { range: '90' }).total, 3));
  it('includes the first day of the range', () => {
    assert.equal(insights([job('Applied', '2026-09-14')], { range: '30' }).total, 1);
    assert.equal(insights([job('Applied', '2026-09-13')], { range: '30' }).total, 0);
  });
  it('scopes every number to the same slice', () => {
    const r = insights(jobs, { range: '30' });
    assert.equal(r.funnel[0].count, 2);
    assert.equal(r.outcomes.reduce((s, o) => s + o.count, 0), 2);
    assert.equal(r.sources.reduce((s, row) => s + row.count, 0), 2);
  });
  it('shows a fitting number of weeks', () => {
    assert.equal(insights(jobs, { range: '30' }).weekly.length, 5);
    assert.equal(insights(jobs, { range: '90' }).weekly.length, 13);
    assert.equal(insights(jobs, { range: 'all' }).weekly.length, 12);
  });
  it('rejects an unknown range', () => assert.throws(() => insights(jobs, { range: '7' }), RangeError));
});

describe('sources', () => {
  it('groups case-insensitively and shows the first spelling', () => {
    const { sources } = insights([job('Applied', '2026-10-10', { source: 'LinkedIn' }), job('Applied', '2026-10-10', { source: 'linkedin' }), job('Applied', '2026-10-10', { source: ' LinkedIn ' })]);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].count, 3);
  });

  it('puts jobs with no source under "Not set"', () => {
    const { sources } = insights([{ status: 'Applied', appliedDate: '2026-10-10', source: null }, { status: 'Applied', appliedDate: '2026-10-10' }, job('Applied', '2026-10-10', { source: '   ' })]);
    assert.deepEqual(sources.map(s => [s.source, s.count]), [['Not set', 3]]);
  });

  it('sorts by number of applications', () => {
    const { sources } = insights([job('Applied', '2026-10-10', { source: 'B' }), job('Applied', '2026-10-10', { source: 'A' }), job('Applied', '2026-10-10', { source: 'A' })]);
    assert.deepEqual(sources.map(s => s.source), ['A', 'B']);
  });

  it('counts interviews and offers by furthest stage reached', () => {
    const { sources } = insights([
      job('Rejected', '2026-10-10', { source: 'X', reachedStage: 'Technical Round' }),
      job('Offer', '2026-10-09', { source: 'X' }),
      job('Applied', '2026-10-08', { source: 'X' })
    ]);
    assert.deepEqual([sources[0].count, sources[0].interviews, sources[0].offers, sources[0].interviewRate], [3, 2, 1, 67]);
  });

  it('folds the tail into one "Other sources" row past eight rows, without losing any jobs', () => {
    const many = Array.from({ length: 12 }, (_, i) => job('Applied', '2026-10-10', { source: `Source ${String(i).padStart(2, '0')}` }));
    const { sources } = insights(many);
    assert.equal(sources.length, 8);
    assert.equal(sources[7].source, 'Other sources');
    assert.equal(sources.reduce((s, row) => s + row.count, 0), 12);
  });
});

describe('highlights', () => {
  it('points out applications with no reply for over three weeks', () => {
    const { highlights } = insights([job('Applied', '2026-09-01'), job('Applied', '2026-09-02'), job('Applied', '2026-10-12')]);
    assert.match(highlights[0], /^2 applications have had no reply for over 3 weeks/);
  });

  it('does not call an application stale at exactly three weeks', () => {
    assert.deepEqual(insights([job('Applied', '2026-09-23')]).highlights, []);
  });

  it('only counts jobs still marked Applied as stale', () => {
    assert.ok(!insights([job('Rejected', '2026-08-01'), job('Ghosted', '2026-08-01')]).highlights.some(h => /no reply/.test(h)));
  });

  it('names the biggest drop-off once there is enough data', () => {
    const jobs = [job('Applied', '2026-10-10'), job('Applied', '2026-10-10'), job('Applied', '2026-10-10'), job('Recruiter Screen', '2026-10-10')];
    const { highlights } = insights(jobs);
    assert.ok(highlights.some(h => /Biggest drop-off: of 4 applications, 1 reached a screen or interview \(25%\)/.test(h)), highlights.join(' | '));
  });

  it('says nothing about drop-off with fewer than three applications at a step', () => {
    assert.ok(!insights([job('Applied', '2026-10-10'), job('Recruiter Screen', '2026-10-10')]).highlights.some(h => /drop-off/.test(h)));
  });

  it('compares sources only when at least two have enough applications', () => {
    const one = insights(Array.from({ length: 4 }, () => job('Recruiter Screen', '2026-10-10', { source: 'Solo' })));
    assert.ok(!one.highlights.some(h => /worked best/.test(h)));

    const two = insights([
      ...Array.from({ length: 3 }, () => job('Recruiter Screen', '2026-10-10', { source: 'Referral' })),
      ...Array.from({ length: 3 }, () => job('Applied', '2026-10-10', { source: 'LinkedIn' }))
    ]);
    assert.ok(two.highlights.some(h => /Referral has worked best so far: 3 of 3/.test(h)), two.highlights.join(' | '));
  });

  it('never claims a best source when none has reached an interview', () => {
    const none = insights([
      ...Array.from({ length: 3 }, () => job('Applied', '2026-10-10', { source: 'A' })),
      ...Array.from({ length: 3 }, () => job('Applied', '2026-10-10', { source: 'B' }))
    ]);
    assert.ok(!none.highlights.some(h => /worked best/.test(h)));
  });

  it('shows at most three', () => {
    const jobs = [
      ...Array.from({ length: 3 }, () => job('Applied', '2026-08-01', { source: 'A' })),
      ...Array.from({ length: 3 }, () => job('Recruiter Screen', '2026-10-10', { source: 'B' }))
    ];
    assert.ok(insights(jobs).highlights.length <= 3);
  });
});

describe('robustness', () => {
  it('copes with odd rows without throwing', () => {
    const odd = [{ status: 'Mystery', appliedDate: '2026-10-10' }, { status: undefined, appliedDate: undefined }, { status: 'Applied' }];
    assert.doesNotThrow(() => insights(odd));
    assert.equal(insights(odd).total, 3);
  });

  it('does not change the jobs it is given', () => {
    const jobs = [job('Applied', '2026-10-10')];
    const copy = JSON.parse(JSON.stringify(jobs));
    insights(jobs);
    assert.deepEqual(jobs, copy);
  });
});
