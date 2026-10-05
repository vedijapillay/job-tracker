// Email classification helpers for the Gmail scanner

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

const REJECTION_PHRASES = [
  'regret to inform',
  'not selected',
  'not moving forward',
  'not be moving forward',
  'decided not to move forward',
  'decided not to proceed',
  'move forward with other candidates',
  'moving forward with other candidates',
  'pursue other candidates',
  'other candidates',
  'position has been filled',
  'will not be proceeding',
  'unable to offer you',
  'unfortunately'
];

const INTERVIEW_PHRASES = [
  'interview',
  'phone screen',
  'recruiter screen',
  'next round',
  'technical round',
  'hiring manager'
];

const APPLIED_PHRASES = [
  'thank you for applying',
  'thank you for your application',
  'thanks for your application',
  'thanks for applying',
  'received your application',
  'application received',
  'application has been received',
  'application is complete',
  'successfully submitted your application',
  'your application was sent'
];

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

  // Second-level label: mail.nordstrom.com -> Nordstrom
  const labels = domain.split('.');
  const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return titleCase(label);
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

function includesAny(text, phrases) {
  return phrases.some(p => text.includes(p));
}

// Returns 'Rejected' | 'Interview Scheduled' | 'Applied' | 'Review'
function detectStatus(from, subject, body) {
  const { local, domain } = parseFrom(from);
  if (IGNORED_LOCAL_PARTS.includes(local) || isIgnoredDomain(domain)) return 'Review';
  if (isCalendarInvite(subject) || DIGEST_SUBJECT.test(subject)) return 'Review';

  const subjectLower = subject.toLowerCase();
  const text = `${subjectLower}\n${body.toLowerCase()}`;

  // Everything below requires job-related wording so generic mail is ignored
  if (!JOB_CONTEXT.test(text)) return 'Review';

  // Rejections often mention interviews/applications, so check them first
  if (includesAny(text, REJECTION_PHRASES)) return 'Rejected';
  // "Thanks for applying" in the subject is a confirmation even if the body
  // talks about possible interviews
  if (includesAny(subjectLower, APPLIED_PHRASES) && !includesAny(subjectLower, INTERVIEW_PHRASES)) return 'Applied';
  if (includesAny(subjectLower, INTERVIEW_PHRASES)) return 'Interview Scheduled';
  if (includesAny(text, APPLIED_PHRASES)) return 'Applied';
  if (includesAny(text, INTERVIEW_PHRASES)) return 'Interview Scheduled';

  return 'Review';
}

module.exports = { parseFrom, extractCompany, extractJobTitle, extractJobInfo, detectStatus, htmlToText, stripQuoted, normalizeText, cleanBody, isIgnoredDomain };
