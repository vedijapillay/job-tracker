// Match scanned emails to jobs that are already in the tracker

// Higher rank = further along. Rejected and Declined end the process.
const STATUS_RANK = {
  'Ghosted': 1,
  'Applied': 1,
  'Interview Scheduled': 2,
  'Recruiter Screen': 2,
  'Technical Round': 3,
  'HM Round': 3,
  'Offer': 4,
  'Rejected': 5,
  'Declined by You': 5
};

const COMPANY_SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc)\b/g;

function rank(status) {
  return STATUS_RANK[status] || 0;
}

// An email only changes a tracked job if it moves the job forward
function shouldUpdate(currentStatus, emailStatus) {
  return rank(emailStatus) > rank(currentStatus);
}

function normalizeCompany(name = '') {
  return name
    .toLowerCase()
    .replace(/^myworkday\s+/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\bsr\b/g, 'senior')
    .replace(/\bjr\b/g, 'junior')
    .replace(/\bmgr\b/g, 'manager')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The Add button falls back to "Job at <company>" when no title is entered
function isPlaceholderTitle(title = '') {
  return !title.trim() || /^job at /i.test(title.trim());
}

// "senior product manager" matches "senior product manager data strategy"
function titlesMatch(a, b) {
  if (!a || !b) return false;
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

function mostRecent(jobs) {
  return [...jobs].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || b.id - a.id
  )[0];
}

// Returns { matchedJob, similarCount }.
// matchedJob: the tracked job this email is about, or null.
// similarCount: tracked jobs at the same company when the email has no title
// and the match is ambiguous.
function findMatch(candidate, jobs) {
  const none = { matchedJob: null, similarCount: 0 };
  const company = normalizeCompany(candidate.company);
  if (!company || company === 'unknown') return none;

  const sameCompany = jobs.filter(job => normalizeCompany(job.company) === company);
  if (sameCompany.length === 0) return none;

  const title = normalizeTitle(candidate.jobTitle);

  if (title) {
    const hits = sameCompany.filter(job => titlesMatch(title, normalizeTitle(job.jobTitle)));
    if (hits.length > 0) return { matchedJob: mostRecent(hits), similarCount: 0 };
    // A single company entry with no real title is almost certainly this job
    if (sameCompany.length === 1 && isPlaceholderTitle(sameCompany[0].jobTitle)) {
      return { matchedJob: sameCompany[0], similarCount: 0 };
    }
    // Different role at the same company: treat as a new job
    return none;
  }

  // No title in the email: only match when there is exactly one candidate
  if (sameCompany.length === 1) return { matchedJob: sameCompany[0], similarCount: 0 };
  return { matchedJob: null, similarCount: sameCompany.length };
}

// Within one scan, keep only the furthest-along email per application.
// Results arrive newest first, so ties keep the newest. Results without a title
// can't be tied to a job, so they are only de-duplicated by subject and status.
function collapseByApplication(results) {
  const best = new Map();
  for (const result of results) {
    const key = (result.jobTitle
      ? `${normalizeCompany(result.company)}|${normalizeTitle(result.jobTitle)}`
      : `${normalizeCompany(result.company)}|${result.lastEmailSubject}|${result.status}`
    ).toLowerCase();
    const current = best.get(key);
    if (!current || rank(result.status) > rank(current.status)) best.set(key, result);
  }
  return [...best.values()];
}

module.exports = {
  STATUS_RANK,
  rank,
  shouldUpdate,
  normalizeCompany,
  normalizeTitle,
  findMatch,
  collapseByApplication
};
