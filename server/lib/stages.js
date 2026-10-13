// How far an application has got. Used by the Insights tab.
//
// A job's status says where it is NOW; its "reached stage" is the furthest it has ever
// been, and only moves forward. That lets a job that was rejected after two interviews
// still count as having reached the interview stage.

const PROGRESS_RANK = {
  'Applied': 1,
  'Recruiter Screen': 2,
  'Interview Scheduled': 2,
  'Technical Round': 3,
  'HM Round': 3,
  'Offer': 4
};

// Statuses that end an application
const CLOSED_STATUSES = ['Rejected', 'Declined by You', 'Ghosted'];

// Funnel steps: the lowest rank that counts as having reached each one
const FUNNEL_STEPS = [
  { key: 'applied', label: 'Applied', minRank: 1 },
  { key: 'interview', label: 'Reached a screen or interview', minRank: 2 },
  { key: 'advanced', label: 'Reached a technical or hiring-manager round', minRank: 3 },
  { key: 'offer', label: 'Received an offer', minRank: 4 }
];

function progressRank(stage) {
  return PROGRESS_RANK[stage] || 0;
}

// The furthest stage after a job moves to `newStatus`. Closing a job (rejected, ghosted,
// declined) never moves it backwards, and a job always counts as at least "Applied".
function reachedAfter(currentReached, newStatus) {
  if (progressRank(newStatus) > progressRank(currentReached)) return newStatus;
  return currentReached || 'Applied';
}

// For a job that has no history yet, the best that can be known is its current status
function initialReached(status) {
  return reachedAfter(null, status);
}

module.exports = { PROGRESS_RANK, CLOSED_STATUSES, FUNNEL_STEPS, progressRank, reachedAfter, initialReached };
