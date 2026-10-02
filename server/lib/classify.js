// Email classification helpers for the Gmail scanner

// Applicant-tracking systems send on behalf of employers, so the sender domain
// is not the company name.
const ATS_DOMAINS = [
  'myworkday.com', 'workday.com', 'greenhouse.io', 'greenhouse-mail.io', 'lever.co',
  'ashbyhq.com', 'icims.com', 'smartrecruiters.com', 'workablemail.com', 'workable.com',
  'jobvite.com', 'taleo.net', 'successfactors.com', 'successfactors.eu', 'brassring.com',
  'bamboohr.com', 'recruitee.com', 'breezy.hr', 'rippling.com', 'dayforce.com', 'dayforcehcm.com'
];

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
  'successfully submitted your application',
  'your application was sent'
];

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

function isAtsDomain(domain) {
  return ATS_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

function extractCompany(from, subject = '') {
  const { name, local, domain } = parseFrom(from);
  if (!domain) return 'Unknown';

  // "Thanks for applying to Via!" names the company directly
  const applyingTo = subject.match(/(?:applying|application|applied) (?:to|at|with) (.+?)[\s!.]*$/i);
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

  // Second-level label: mail.nordstrom.com -> Nordstrom
  const labels = domain.split('.');
  const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return titleCase(label);
}

function extractJobTitle(subject, body) {
  // "Thank You For Applying - Senior Product Manager"
  const dashed = subject.match(/(?:applying|application)[^-]*\s-\s+(.+?)\s*$/i);
  if (dashed) return dashed[1].trim();
  const fromSubject = subject.match(/\b(?:for|-)\s+(?:the\s+)?(.+?)(?:\s+(?:position|role))?\s*$/i);
  if (fromSubject && /application|update|applying/i.test(subject) && !/^(applying|to|your)\b/i.test(fromSubject[1])) {
    return fromSubject[1].trim();
  }
  const fromBody = body.match(/interest in the (.+?) (?:position|role)/i);
  if (fromBody) return fromBody[1].trim();
  const forRole = body.match(/application for (?:the )?(.+?) (?:position|role)/i);
  if (forRole) return forRole[1].trim();
  const applied = body.match(/applying (?:to|for) (?:the )?(.+?) (?:position|role)/i);
  if (applied) return applied[1].trim();
  return '';
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
  if (IGNORED_LOCAL_PARTS.includes(local) || IGNORED_DOMAINS.includes(domain)) return 'Review';
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

module.exports = { parseFrom, extractCompany, extractJobTitle, detectStatus };
