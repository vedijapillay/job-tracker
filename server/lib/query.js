// Gmail search queries for the scan

const { TRUSTED_SENDER_DOMAINS } = require('./classify');

// Words that appear in job-search emails, including offer and assessment stages
const KEYWORDS = ['application', 'applying', 'applied', 'position', 'candidate', 'interview', 'recruiter', 'offer', 'assessment', 'hiring'];

// Returns the searches to run; results are merged and de-duplicated by the caller.
//  1. Inbox mail from anyone, minus Gmail's Promotions and Social tabs
//  2. Mail from known ATS / job-board senders, wherever Gmail filed it
function buildSearchQueries(days = 180) {
  const base = `in:inbox newer_than:${days}d (${KEYWORDS.join(' OR ')})`;
  const senders = TRUSTED_SENDER_DOMAINS.join(' OR ');

  return [
    { q: `${base} -category:promotions -category:social`, maxResults: 100 },
    { q: `${base} from:(${senders})`, maxResults: 50 }
  ];
}

module.exports = { KEYWORDS, buildSearchQueries };
