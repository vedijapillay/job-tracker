// Weighted phrase signals used by the email classifier.
//
// Each signal: { re, subject, body, weak?, label }
//   subject / body: points added when the pattern appears there
//   weak: only counts when nothing suggests a scheduling problem (see WEAK_GUARD)
// A status needs MIN_SCORE points to be reported; the highest score wins.
// All patterns run against lowercased, normalized text.

const MIN_SCORE = 4;

const sig = (re, subject, body, extra = {}) => ({ re, subject, body, label: re.source.slice(0, 48), ...extra });

const SIGNALS = {
  'Rejected': [
    sig(/regret to inform/, 6, 5),
    sig(/\bnot (?:be )?(?:moving|proceeding|advancing|going) (?:forward|further|ahead|on)\b/, 6, 5),
    sig(/\bdecided not to (?:move|proceed|pursue|advance|continue)/, 6, 5),
    sig(/\b(?:move|moving|proceed|proceeding|pursue|pursuing|go|going) (?:forward |ahead )?with (?:other|another|different) (?:candidates?|applicants?)/, 6, 5),
    sig(/\bnot (?:been )?selected\b/, 6, 5),
    sig(/\bno longer (?:under consideration|being considered)\b/, 6, 5),
    sig(/\b(?:position|role) (?:has been|was|is now) (?:filled|closed|cancell?ed)\b/, 6, 5),
    sig(/\bwill not be (?:proceeding|continuing|moving)\b/, 6, 5),
    sig(/\bunable to (?:move|proceed|advance|offer)\b/, 5, 5),
    sig(/\bnot (?:a |the )?(?:right )?(?:match|fit)\b/, 4, 4),
    // Common in rejections but also elsewhere: need two of these, or one plus a strong phrase
    sig(/\bunfortunately\b/, 2, 2, { weak: true }),
    sig(/\bother candidates\b/, 2, 2, { weak: true }),
    sig(/\bafter careful (?:consideration|review)\b/, 2, 2, { weak: true }),
    sig(/\bwish you (?:the best|all the best|success|luck)\b/, 2, 2, { weak: true }),
    sig(/\bfuture endeavou?rs\b|\bin your (?:job )?search\b/, 2, 2, { weak: true }),
    sig(/\bkeep your (?:resume|cv|information|profile) on file\b/, 1, 1, { weak: true })
  ],

  'Declined by You': [
    sig(/\b(?:application|candidacy) (?:has been |was |is )?withdrawn\b/, 6, 6),
    sig(/\bwithdr(?:ew|awn|aw)(?:ing)? (?:your |from )?(?:application|candidacy|consideration)\b/, 6, 6),
    sig(/\byou(?:'ve| have) withdrawn\b/, 6, 6),
    sig(/\brequest to withdraw\b/, 6, 6)
  ],

  'Offer': [
    sig(/\b(?:pleased|happy|excited|delighted|thrilled) to (?:offer|extend)\b/, 6, 6),
    sig(/\bwe(?:'d| would) like to offer you\b/, 6, 6),
    sig(/\bextend(?:ing)? (?:you )?(?:an|a|the) (?:formal |official )?offer\b/, 6, 6),
    sig(/\boffer letter\b/, 6, 5),
    sig(/\boffer of employment\b/, 6, 6),
    sig(/\b(?:formal|official|job) offer\b/, 5, 4),
    sig(/\bcompensation package\b|\bsigning bonus\b|\bbase salary\b/, 2, 2),
    sig(/\bcongratulations\b/, 2, 2)
  ],

  'HM Round': [
    sig(/\b(?:interview|meet|speak|talk|chat|call)(?: with)? (?:the |our |a )?hiring manager\b/, 5, 5),
    sig(/\bhiring manager (?:interview|round|call|screen|conversation|chat)\b/, 5, 5),
    sig(/\b(?:final|last) (?:round|interview|stage)\b/, 5, 5),
    sig(/\bon-?site\b/, 5, 5),
    sig(/\bpanel (?:interview|round)\b/, 5, 5),
    sig(/\bmeet (?:the|with the|some of the) team\b/, 4, 4)
  ],

  'Technical Round': [
    sig(/\btechnical (?:interview|round|screen|assessment|exercise|challenge|test)\b/, 5, 5),
    sig(/\bcoding (?:interview|challenge|assessment|exercise|test|round)\b/, 5, 5),
    sig(/\b(?:online|take[- ]home|skills?|pre-?employment) (?:assessment|test|assignment|challenge|exercise)\b/, 5, 5),
    sig(/\b(?:hackerrank|codility|codesignal|coderpad|karat|testgorilla)\b/, 5, 5),
    sig(/\bcase study\b|\bsystem design\b|\bpair programming\b|\btake[- ]home\b/, 5, 4),
    sig(/\bassessment\b/, 3, 2)
  ],

  'Recruiter Screen': [
    sig(/\b(?:recruiter|phone|initial|introductory|intro|screening|talent acquisition) (?:screen|screening|call|chat|conversation)\b/, 5, 5),
    sig(/\b(?:call|chat|speak|talk) with (?:a|an|our|the|one of our) (?:\w+ )?recruiter\b/, 5, 5)
  ],

  'Interview Scheduled': [
    // The bare word counts for a lot in a subject but very little in a body
    sig(/\binterviews?\b/, 4, 1),
    sig(/\b(?:schedule|scheduled|set up|arrange|arranged|book|booked|confirm|confirmed)(?: an?| your| the)? (?:(?:phone|video|virtual|initial|first|second) )?interview\b/, 5, 4),
    sig(/\binterview (?:invitation|invite|request|confirmation|details|availability)\b/, 5, 4),
    sig(/\b(?:invite|invited|invitation) (?:you )?to (?:an? )?(?:\w+ )?interview\b/, 5, 5),
    sig(/\byour interview (?:is|has been|on|at|with)\b/, 5, 5),
    sig(/\bnext round\b|\bnext stage\b/, 4, 4),
    sig(/\b(?:select|choose|pick) a (?:time|date|slot)\b|\bcalendly\.com\b|\bhirevue\b/, 3, 3),
    sig(/\byour availability\b/, 2, 2)
  ],

  'Applied': [
    sig(/\bthank(?:s| you) for (?:applying|your application|submitting your application)\b/, 6, 4),
    sig(/\breceived your application\b/, 6, 4),
    sig(/\bapplication (?:is|has been|was) (?:received|submitted|complete|completed|confirmed)\b|\bapplication (?:received|submitted|confirmation)\b/, 6, 4),
    sig(/\byour application (?:was|has been) sent\b/, 6, 4),
    sig(/\bsuccessfully (?:submitted|applied)\b/, 6, 4),
    // Rejections start with this too, so it only supports other signals
    sig(/\bthank(?:s| you) for your interest in\b/, 2, 2)
  ]
};

// Statuses whose body signals ignore "if selected, we will schedule an interview" sentences
const STAGE_STATUSES = new Set(['Offer', 'HM Round', 'Technical Round', 'Recruiter Screen', 'Interview Scheduled']);

const HYPOTHETICAL = [
  /\b(?:if|should|when|once|in the event)\b[^.!?]{0,60}\b(?:selected|chosen|shortlisted|qualif\w*|match\w*|fit|move\w* forward|interested|decide\w*|appropriate)\b/,
  /\b(?:may|might|could) (?:schedule|contact|reach|invite|be in touch|follow up|ask|request)\b/,
  /\bwill (?:contact|reach out|be in touch)\b/
];

// A scheduling problem makes "unfortunately" and friends mean something else
const WEAK_GUARD = /\b(?:resched|cancel|postpon|unable to (?:attend|make)|technical (?:issue|difficult))/;

// Tie-break order when two statuses score the same
const STATUS_PRIORITY = [
  'Offer', 'Rejected', 'Declined by You', 'HM Round', 'Technical Round',
  'Recruiter Screen', 'Interview Scheduled', 'Applied'
];

module.exports = { MIN_SCORE, SIGNALS, STAGE_STATUSES, HYPOTHETICAL, WEAK_GUARD, STATUS_PRIORITY };
