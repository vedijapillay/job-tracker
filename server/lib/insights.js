// The numbers behind the Insights tab, computed from the jobs in the tracker.
// A pure function: jobs in, plain data out, so it can be tested without a database or a browser.
// Everything is computed on the user's own computer; nothing is sent anywhere.

const { CLOSED_STATUSES, FUNNEL_STEPS, progressRank, initialReached } = require('./stages');

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = { all: null, '30': 30, '90': 90 };
const WEEKS_SHOWN = { all: 12, '30': 5, '90': 13 };
const STALE_AFTER_DAYS = 21;
const MAX_SOURCES = 8;
const SMALL_SAMPLE = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Outcomes by current status. The order is the order the stacked bar draws them in.
const OUTCOMES = [
  { key: 'inProgress', label: 'In progress', statuses: ['Applied', 'Recruiter Screen', 'Interview Scheduled', 'Technical Round', 'HM Round'] },
  { key: 'rejected', label: 'Rejected', statuses: ['Rejected'] },
  { key: 'offer', label: 'Offer', statuses: ['Offer'] },
  { key: 'ghosted', label: 'No reply', statuses: ['Ghosted'] },
  { key: 'declined', label: 'Declined by you', statuses: ['Declined by You'] }
];

// ---- dates (all YYYY-MM-DD strings, computed in UTC so time zones cannot shift a day) ----
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toISO = (date) => date.toISOString().split('T')[0];
const addDays = (iso, days) => toISO(new Date(toDate(iso).getTime() + days * DAY_MS));
const daysBetween = (fromIso, toIso) => Math.round((toDate(toIso) - toDate(fromIso)) / DAY_MS);
const isValidDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(toDate(value));

// The Monday of the week containing this date
function weekStart(iso) {
  const sinceMonday = (toDate(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -sinceMonday);
}

function weekLabel(iso) {
  const date = toDate(iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The furthest stage a job has reached, even for jobs saved before this was recorded
const reachedRank = (job) => progressRank(job.reachedStage || initialReached(job.status));

function sourceName(job) {
  const name = (job.source || '').trim();
  return name || 'Not set';
}

function computeFunnel(jobs) {
  const counts = FUNNEL_STEPS.map(step => jobs.filter(job => reachedRank(job) >= step.minRank).length);
  return FUNNEL_STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    count: counts[i],
    pctOfTotal: percent(counts[i], counts[0]),
    // How many of the previous step carried on to this one
    pctOfPrevious: i === 0 ? null : percent(counts[i], counts[i - 1])
  }));
}

function computeOutcomes(jobs) {
  return OUTCOMES.map(outcome => {
    const count = jobs.filter(job => outcome.statuses.includes(job.status)).length;
    return { key: outcome.key, label: outcome.label, count, pct: percent(count, jobs.length) };
  });
}

function computeWeekly(jobs, today, weeks) {
  const currentWeek = weekStart(today);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(currentWeek, -7 * i);
    buckets.push({ weekStart: start, label: weekLabel(start), count: 0 });
  }
  const first = buckets[0].weekStart;
  for (const job of jobs) {
    if (!isValidDay(job.appliedDate)) continue;
    const start = weekStart(job.appliedDate);
    if (start < first) continue;
    const bucket = buckets.find(b => b.weekStart === start);
    if (bucket) bucket.count++;
  }
  return buckets;
}

function computeSources(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const name = sourceName(job);
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { source: name, count: 0, interviews: 0, offers: 0 });
    const group = groups.get(key);
    group.count++;
    if (reachedRank(job) >= 2) group.interviews++;
    if (reachedRank(job) >= 4) group.offers++;
  }

  const rows = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .map(group => ({ ...group, interviewRate: percent(group.interviews, group.count) }));

  if (rows.length <= MAX_SOURCES) return rows;

  // Past about eight rows nobody reads the tail: fold it into one line
  const shown = rows.slice(0, MAX_SOURCES - 1);
  const rest = rows.slice(MAX_SOURCES - 1);
  const other = rest.reduce((sum, row) => ({
    source: 'Other sources',
    count: sum.count + row.count,
    interviews: sum.interviews + row.interviews,
    offers: sum.offers + row.offers
  }), { source: 'Other sources', count: 0, interviews: 0, offers: 0 });
  return [...shown, { ...other, interviewRate: percent(other.interviews, other.count) }];
}

// A few plain-language observations, each one tied to a number a person can check
function computeHighlights({ jobs, funnel, sources, today }) {
  const highlights = [];

  const stale = jobs.filter(job => job.status === 'Applied' && isValidDay(job.appliedDate) && daysBetween(job.appliedDate, today) > STALE_AFTER_DAYS).length;
  if (stale > 0) {
    highlights.push(`${plural(stale, 'application has', 'applications have')} had no reply for over 3 weeks. Consider following up, or mark ${stale === 1 ? 'it' : 'them'} as no reply.`);
  }

  // The step where the most people drop out, if there is enough data to say
  let worst = null;
  for (let i = 1; i < funnel.length; i++) {
    const previous = funnel[i - 1];
    if (previous.count >= 3 && (worst === null || funnel[i].pctOfPrevious < funnel[worst].pctOfPrevious)) worst = i;
  }
  if (worst !== null && funnel[worst].pctOfPrevious < 100) {
    const before = worst === 1 ? 'applications' : `that ${funnel[worst - 1].label.toLowerCase()}`;
    highlights.push(`Biggest drop-off: of ${funnel[worst - 1].count} ${before}, ${funnel[worst].count} ${funnel[worst].label.toLowerCase()} (${funnel[worst].pctOfPrevious}%).`);
  }

  // Only compare sources with enough applications to mean something
  const comparable = sources.filter(row => row.count >= 3 && row.source !== 'Other sources' && row.source !== 'Not set');
  if (comparable.length >= 2) {
    const best = [...comparable].sort((a, b) => b.interviewRate - a.interviewRate || b.count - a.count)[0];
    if (best.interviewRate > 0) {
      highlights.push(`${best.source} has worked best so far: ${best.interviews} of ${best.count} applications reached a screen or interview.`);
    }
  }

  return highlights.slice(0, 3);
}

// range: 'all' | '30' | '90'. today: 'YYYY-MM-DD' (injectable so tests do not depend on the clock).
function computeInsights(allJobs, { range = 'all', today = localToday() } = {}) {
  if (!(range in RANGES)) throw new RangeError(`Unknown range: ${range}`);

  const days = RANGES[range];
  const cutoff = days === null ? null : addDays(today, -days);
  const jobs = cutoff === null ? allJobs : allJobs.filter(job => isValidDay(job.appliedDate) && job.appliedDate >= cutoff);

  const total = jobs.length;
  const funnel = computeFunnel(jobs);
  const outcomes = computeOutcomes(jobs);
  const sources = computeSources(jobs);
  const weekly = computeWeekly(jobs, today, WEEKS_SHOWN[range]);

  const closed = jobs.filter(job => CLOSED_STATUSES.includes(job.status)).length;
  const replied = jobs.filter(job => job.status !== 'Applied' && job.status !== 'Ghosted').length;
  const lastFour = weekly.slice(-4).reduce((sum, week) => sum + week.count, 0);

  return {
    range,
    today,
    total,
    smallSample: total < SMALL_SAMPLE,
    kpis: {
      total,
      active: total - closed,
      replied,
      replyRate: percent(replied, total),
      interviewRate: percent(funnel[1].count, total),
      offerRate: percent(funnel[3].count, total),
      thisWeek: weekly[weekly.length - 1].count,
      lastFourWeeks: lastFour
    },
    funnel,
    outcomes,
    weekly,
    sources,
    highlights: computeHighlights({ jobs, funnel, sources, today })
  };
}

module.exports = { computeInsights, RANGES, OUTCOMES, weekStart, localToday };
