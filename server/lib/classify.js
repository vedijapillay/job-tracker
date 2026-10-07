// Email classification helpers for the Gmail scanner

const { MIN_SCORE, SIGNALS, STAGE_STATUSES, HYPOTHETICAL, WEAK_GUARD, STATUS_PRIORITY } = require('./signals');

// Applicant-tracking systems send on behalf of employers, so the sender domain
// is not the company name.
const ATS_DOMAINS = [
  'myworkday.com', 'workday.com', 'greenhouse.io', 'greenhouse-mail.io', 'lever.co',
  'ashbyhq.com', 'icims.com', 'smartrecruiters.com', 'workablemail.com', 'workable.com',
  'jobvite.com', 'taleo.net', 'successfactors.com', 'successfactors.eu', 'brassring.com',
  'bamboohr.com', 'recruitee.com', 'breezy.hr', 'rippling.com', 'dayforce.com', 'dayforcehcm.com'
];

// Job boards that send on behalf of employers: the sender is never the company
const AGGREGATOR_DOMAINS = ['ziprecruiter.com', 'linkedin.com', 'indeed.com', 'indeedemail.com'];

// Personal mail providers: the sender's domain says nothing about the employer
const FREE_MAIL_NAMES = new Set([
  'gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'msn', 'yahoo', 'ymail', 'icloud',
  'aol', 'protonmail', 'proton', 'gmx', 'zoho', 'fastmail'
]);
const FREE_MAIL_DOMAINS = new Set(['me.com', 'mac.com', 'pm.me', 'hey.com', 'mail.com']);

// Second-level parts of country domains, as in acme.co.uk or acme.com.au
const COUNTRY_SECOND_LEVELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

// Senders that are never job-application correspondence
const IGNORED_LOCAL_PARTS = ['invitations', 'calendar-notification', 'calendar'];
const IGNORED_DOMAINS = [
  'calendar.google.com', 'zoom.us', 'eventbrite.com', 'meetup.com',
  'glassdoor.com',        // community digests and job alerts
  'wellfound.com'         // job-alert marketing
];

// Job-board digests and alerts, regardless of sender
const DIGEST_SUBJECT = /(new jobs?|more jobs|jobs? (alert|for you|like)|job recommendations?|recommended jobs?|jobs? you may like|similar jobs)\b/i;

const JOB_CONTEXT = /\b(application|applied|applying|position|candidate|candidacy|recruiter|recruiting|hiring|job opening|role)\b/;

const MAX_BODY_CHARS = 1000;

const HTML_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-' };

// Convert an HTML email body to plain text (no dependencies)
function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);
}

// Drop quoted replies and forwarded/original-message trailers (line-based, so
// run before whitespace is collapsed)
function stripQuoted(text) {
  const lines = text.split(/\r?\n/).filter(line => !/^\s*>/.test(line));
  const marker = /^\s*(-{2,}\s*original message\s*-{2,}|begin forwarded message:?|_{5,}|-{5,}\s*forwarded message\s*-{5,})/i;

  for (let i = 0; i < lines.length; i++) {
    // "On Tue, Oct 1, 2026 at 9:00 AM Jane <j@x.com> wrote:" may wrap onto two lines
    const attribution = /^\s*on\s.+wrote:?\s*$/i.test(lines[i]) ||
      (/^\s*on\s/i.test(lines[i]) && i + 1 < lines.length && /wrote:?\s*$/i.test(lines[i + 1]));

    if (attribution || marker.test(lines[i])) {
      const head = lines.slice(0, i).join('\n');
      // A forwarded job email has nothing above the marker: keep it rather than lose the content
      if (head.trim()) return head;
      if (attribution) return head;
    }
  }
  return lines.join('\n');
}

// Make phrase matching robust: straight quotes, no nbsp, hard-wrapped lines joined
function normalizeText(text) {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u200B\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Email body as the classifier should see it: no quoted replies, normalized, capped
function cleanBody(raw) {
  return normalizeText(stripQuoted(raw || '')).slice(0, MAX_BODY_CHARS);
}

function parseFrom(from) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : from).trim().toLowerCase();
  const name = match ? match[1].trim() : '';
  const [local = '', domain = ''] = email.split('@');
  return { name, email, local, domain };
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function matchesDomain(domain, list) {
  return list.some(d => domain === d || domain.endsWith('.' + d));
}

function isAtsDomain(domain) {
  return matchesDomain(domain, ATS_DOMAINS);
}

// Subdomain-aware: e.glassdoor.com and hi.wellfound.com match their parent domain
function isIgnoredDomain(domain) {
  return matchesDomain(domain, IGNORED_DOMAINS);
}

// The registrable name of a domain: mail.nordstrom.com -> nordstrom, mail.acme.co.uk -> acme
function domainName(domain) {
  const labels = domain.split('.');
  if (labels.length < 2) return labels[0];
  const second = labels[labels.length - 2];
  if (labels.length >= 3 && COUNTRY_SECOND_LEVELS.has(second) && labels[labels.length - 1].length === 2) {
    return labels[labels.length - 3];
  }
  return second;
}

function isFreeMailDomain(domain) {
  const labels = domain.split('.');
  return FREE_MAIL_NAMES.has(domainName(domain)) || FREE_MAIL_DOMAINS.has(labels.slice(-2).join('.'));
}

// A personal address can still sign as the employer: "Acme Robotics Careers" -> "Acme Robotics".
// Only collective senders count. A person's name ("Jane Doe") or a person with a
// title ("Jane Doe, Recruiter", "Jane | Talent Acquisition") says nothing about the
// employer, so those stay unknown. A wrong company is worse than a blank one.
const SENDER_ROLE_WORDS = /\b(careers?|recruiting|recruitment|recruiters|talent|acquisition|hiring|jobs|hr|human resources|people|staffing|team)\b/gi;
const PERSON_WITH_TITLE = /[,|@\u2013\u2014]|\s-\s|\brecruiter\b/i;

function companyFromSenderName(name) {
  if (PERSON_WITH_TITLE.test(name)) return null;
  if (!new RegExp(SENDER_ROLE_WORDS.source, 'i').test(name)) return null;
  const cleaned = name.replace(SENDER_ROLE_WORDS, ' ').replace(/[^\w&.' -]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function extractCompany(from, subject = '') {
  const { name, local, domain } = parseFrom(from);
  if (!domain) return 'Unknown';

  // "Thanks for applying to Via!" names the company directly
  const applyingTo = subject.match(/(?:(?:applying|application|applied) (?:to|at|with)|application was sent to) (.+?)[\s!.]*$/i);
  if (applyingTo) return applyingTo[1].trim();

  if (isAtsDomain(domain)) {
    // "Workday Nordstrom" -> "Nordstrom"; fall back to the address local part
    const cleaned = name
      .replace(/\b(workday|greenhouse|lever|recruiting|recruitment|careers|talent|team|hiring|jobs|hr|no-?reply)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) return cleaned;
    if (!/^(no-?reply|jobs|careers|recruiting|notifications?)$/.test(local)) return titleCase(local);
  }

  // ZipRecruiter, LinkedIn etc. never name the employer in the sender
  if (matchesDomain(domain, AGGREGATOR_DOMAINS)) return 'Unknown';

  if (isFreeMailDomain(domain)) return companyFromSenderName(name) || 'Unknown';

  // mail.nordstrom.com -> Nordstrom
  return titleCase(domainName(domain));
}

function extractJobTitle(subject, body) {
  // Your "Sr. Project Manager" application is complete
  const quoted = subject.match(/"([^"]+)"\s+application/i);
  if (quoted) return quoted[1].trim();

  // "Application Update for Senior Product Manager - Data Strategy": the title may itself contain a dash
  const fromSubject = subject.match(/\b(?:for|-)\s+(?:the\s+)?(.+?)(?:\s+(?:position|role))?\s*$/i);
  if (fromSubject && /application|update|applying/i.test(subject) && !/^(applying|to|your)\b/i.test(fromSubject[1])) {
    return fromSubject[1].trim();
  }
  // "Thank You For Applying - Senior Product Manager"
  const dashed = subject.match(/(?:applying|application)[^-]*\s-\s+(.+?)\s*$/i);
  if (dashed) return dashed[1].trim();
  const fromBody = body.match(/interest in the (.+?) (?:position|role)/i);
  if (fromBody) return fromBody[1].trim();
  const forRole = body.match(/application for (?:the )?(.+?) (?:position|role)/i);
  if (forRole) return forRole[1].trim();
  const applied = body.match(/applying (?:to|for) (?:the )?(.+?) (?:position|role)/i);
  if (applied) return applied[1].trim();
  return '';
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Company and title from the fixed layouts job boards use, falling back to the
// general extractors. `body` should already be cleaned (single line).
function extractJobInfo(from, subject, body) {
  // ZipRecruiter: "Your application is complete for Sr. Project Manager at SuperGraphics LLC!"
  const zip = body.match(/application is complete for (.+?) at (.+?)\s*[!.](?:\s|$)/i);
  if (zip) return { jobTitle: zip[1].trim(), company: zip[2].trim() };

  // LinkedIn Easy Apply: "Your application was sent to 17a 17a Technical Product Manager 17a · United States"
  const sentTo = subject.match(/application was sent to (.+?)\s*$/i);
  if (sentTo) {
    const company = sentTo[1].trim();
    const c = escapeRegExp(company);
    const layout = body.match(new RegExp(`sent to ${c}\\s+${c}\\s+(.+?)\\s+${c}\\s*\u00B7`, 'i'));
    return { company, jobTitle: layout ? layout[1].trim() : extractJobTitle(subject, body) };
  }

  return { company: extractCompany(from, subject), jobTitle: extractJobTitle(subject, body) };
}

function isCalendarInvite(subject) {
  return /^\s*(updated |canceled |cancelled )?invitation:/i.test(subject) ||
    /^\s*(accepted|declined|tentatively accepted):/i.test(subject);
}

// Drop sentences that only describe what might happen ("if selected, we will
// schedule an interview") so they don't count as real scheduling
function removeHypothetical(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !HYPOTHETICAL.some(re => re.test(sentence)))
    .join(' ');
}

function scoreStatus(status, subject, body, text) {
  let total = 0;
  const reasons = [];
  const weakAllowed = !WEAK_GUARD.test(text);

  for (const signal of SIGNALS[status]) {
    if (signal.weak && !weakAllowed) continue;
    if (signal.subject && signal.re.test(subject)) {
      total += signal.subject;
      reasons.push(`subject:${signal.label}`);
    }
    if (signal.body && signal.re.test(body)) {
      total += signal.body;
      reasons.push(`body:${signal.label}`);
    }
  }
  return { total, reasons };
}

// Returns { status, confidence: 'high' | 'medium' | 'low' | null, reasons }.
// status is one of the tracker statuses, or 'Review' when nothing scores enough.
function classify(from, subject, body) {
  const review = { status: 'Review', confidence: null, reasons: [] };

  const { local, domain } = parseFrom(from);
  if (IGNORED_LOCAL_PARTS.includes(local) || isIgnoredDomain(domain)) return review;
  if (isCalendarInvite(subject) || DIGEST_SUBJECT.test(subject)) return review;

  const subjectText = normalizeText(subject).toLowerCase();
  const bodyText = normalizeText(body).toLowerCase();
  const text = `${subjectText}\n${bodyText}`;

  // Everything below requires job-related wording so generic mail is ignored
  if (!JOB_CONTEXT.test(text)) return review;

  const stageBody = removeHypothetical(bodyText);
  let best = null;

  for (const status of STATUS_PRIORITY) {
    const { total, reasons } = scoreStatus(status, subjectText, STAGE_STATUSES.has(status) ? stageBody : bodyText, text);
    if (total < MIN_SCORE) continue;
    // STATUS_PRIORITY order means an equal score never replaces an earlier status
    if (!best || total > best.total) best = { status, total, reasons };
  }

  if (!best) return review;
  const confidence = best.total >= 9 ? 'high' : best.total >= 6 ? 'medium' : 'low';
  return { status: best.status, confidence, reasons: best.reasons };
}

// Status only; see classify() for confidence and reasons
function detectStatus(from, subject, body) {
  return classify(from, subject, body).status;
}

// ATS and job-board domains: their mail is job correspondence even when Gmail
// files it under Promotions or Social
const TRUSTED_SENDER_DOMAINS = [...ATS_DOMAINS, ...AGGREGATOR_DOMAINS];

module.exports = { TRUSTED_SENDER_DOMAINS, parseFrom, extractCompany, extractJobTitle, extractJobInfo, detectStatus, classify, htmlToText, stripQuoted, normalizeText, cleanBody, isIgnoredDomain };
