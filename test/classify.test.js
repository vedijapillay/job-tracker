// Email classification: status detection, body cleaning, company and title extraction.
// All emails here are invented; no real mail belongs in this repository.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../server/lib/classify');

const classify = (from, subject, body = '') => c.classify(from, subject, c.cleanBody(body));
const status = (from, subject, body) => classify(from, subject, body).status;
const info = (from, subject, body = '') => c.extractJobInfo(from, subject, c.cleanBody(body));

const RECRUITER = 'Recruiter <jobs@acme.com>';

describe('status detection: real-world samples', () => {
  const cases = [
    ['Workday rejection sent from a non-"no-reply" address', 'Workday Nordstrom <nordstrom@myworkday.com>',
      'Nordstrom Application Update for Senior Product Manager - Data Strategy',
      'Thank you for your interest in the position. We have made the decision to move forward with other candidates at this time.', 'Rejected'],
    ['LinkedIn connection invitation is not a job email', 'Steven <invitations@linkedin.com>', 'You have an invitation', 'Experienced Senior Technical Product Manager. Accept View profile', 'Review'],
    ['Google Calendar invitation', 'Google Calendar <calendar-notification@google.com>', 'Invitation: Sync @ Tue', 'Join with Google Meet. schedule call', 'Review'],
    ['interview request', RECRUITER, 'Interview with Acme', 'We would like to schedule an interview for the PM position', 'Interview Scheduled'],
    ['Greenhouse confirmation', 'Greenhouse <no-reply@us.greenhouse-mail.io>', 'Thank you for applying to Stripe', 'We received your application for the Product Manager role', 'Applied'],
    ['a friend asking about a call', 'Bob <bob@gmail.com>', 'Lunch call tomorrow?', 'Want to schedule a call?', 'Review'],
    ['Glassdoor community digest', 'Glassdoor <noreply@glassdoor.com>', 'Wwyd? 37 and 38 with a 3 year old', 'Community post about my job and career position', 'Review'],
    ['Wellfound job-alert digest', 'Wellfound <team@hi.wellfound.com>', 'New jobs: Lead product manager at Writer and 10 more jobs', 'Apply to these positions. interview tips', 'Review'],
    ['"Thanks for applying" whose body mentions interviews', 'Via <no-reply@ridewithvia.com>', 'Thanks for applying to Via!',
      'Our recruiting team will review your application. If selected we will schedule an interview. Next steps follow.', 'Applied'],
    ['Dayforce confirmation', 'Dayforce <notify@dayforce.com>', 'Thank You For Applying -  Senior Product Manager',
      'We received your application. A recruiter may schedule an interview.', 'Applied']
  ];

  for (const [name, from, subject, body, expected] of cases) {
    it(name, () => assert.equal(status(from, subject, body), expected));
  }
});

describe('status detection: stages and outcomes', () => {
  const cases = [
    ['offer letter', 'HR <hr@acme.com>', 'Your offer from Acme',
      'We are pleased to offer you the Senior Product Manager position. Please find your offer letter attached. Congratulations!', 'Offer'],
    ['offer with extend wording', 'HR <hr@acme.com>', 'Offer of employment',
      'We are excited to extend you an offer for the Program Manager role. Compensation package details attached.', 'Offer'],
    ['online assessment', 'Acme <talent@acme.com>', 'Next step: technical assessment for the PM role',
      'Please complete the online assessment on HackerRank within 5 days to continue your application.', 'Technical Round'],
    ['coding challenge', 'Acme <talent@acme.com>', 'Your application: coding challenge',
      'Thanks for applying. Your next step is a take-home coding challenge for the engineer position.', 'Technical Round'],
    ['hiring manager conversation', RECRUITER, 'Meet with the hiring manager',
      'We would like to schedule a call with the hiring manager for the Product role. Please share your availability.', 'HM Round'],
    ['final round', RECRUITER, 'Final round interview for Director position', 'Congrats on advancing! Your final round interview is Tuesday.', 'HM Round'],
    ['recruiter screen', RECRUITER, 'Intro call for the PM position', 'A recruiter would like to set up a phone screen with you about the role.', 'Recruiter Screen'],
    ['generic interview invitation', RECRUITER, 'Interview invitation - Product Manager',
      'We would like to invite you to an interview for the Product Manager position. Please select a time.', 'Interview Scheduled'],
    ['withdrawal', 'Acme <jobs@acme.com>', 'Application withdrawn',
      'We confirm your application for the Product Manager position has been withdrawn at your request.', 'Declined by You'],
    ['rejection: not moving forward', RECRUITER, 'Your application to Acme',
      'After careful consideration, we will not be moving forward with your candidacy for the position.', 'Rejected'],
    ['rejection: no longer under consideration', RECRUITER, 'Application status',
      'You are no longer under consideration for the role. We wish you the best in your job search.', 'Rejected'],
    ['rejection from two weak signals', RECRUITER, 'Update on your application', 'Unfortunately we selected other candidates for this position.', 'Rejected'],
    ['rejection: position filled', RECRUITER, 'Application update', 'The position has been filled. Thank you for your application and interest in the role.', 'Rejected'],
    ['rejection that mentions the interview', 'Acme <jobs@acme.com>', 'Update on your interview',
      'Thank you for interviewing for the position. Unfortunately we will not be moving forward with your application.', 'Rejected']
  ];

  for (const [name, from, subject, body, expected] of cases) {
    it(name, () => assert.equal(status(from, subject, body), expected));
  }
});

describe('status detection: things that must NOT trigger', () => {
  it('a rescheduled interview is not a rejection', () => {
    assert.equal(status(RECRUITER, 'Interview for Product Manager position',
      'Unfortunately, the hiring team needs to reschedule your interview. We will send new times soon.'), 'Interview Scheduled');
  });
  it('"other candidates" in praise is not a rejection', () => {
    assert.equal(status(RECRUITER, 'Your application',
      'Your background stands out from other candidates for this position. We received your application.'), 'Applied');
  });
  it('a hypothetical interview does not make a confirmation an interview', () => {
    assert.equal(status('Via <no-reply@via.com>', 'Thanks for applying to Via!',
      'Our recruiting team will review your application. If selected, we will schedule an interview. Should your qualifications match, a recruiter will reach out for a phone screen.'), 'Applied');
  });
  it('a hypothetical offer does not make a confirmation an offer', () => {
    assert.equal(status('Acme <jobs@acme.com>', 'Thank you for applying',
      'We received your application. If we decide to extend an offer, we will be in touch about the compensation package.'), 'Applied');
  });
  it('a newsletter about interview tips is ignored', () => {
    assert.equal(status('News <hello@somesite.com>', 'Career newsletter', 'Top role advice: how to prepare for an interview and impress the hiring manager.'), 'Review');
  });
  it('cold recruiter outreach mentioning an interview process is ignored', () => {
    assert.equal(status('Rex <rex@staffing.com>', 'Opportunity', 'Our interview process is quick. We have a role open at a great company.'), 'Review');
  });
  it('mail with no job context is ignored', () => {
    assert.equal(status('Bob <bob@gmail.com>', 'Dinner', 'Unfortunately I cannot make it. We will not be moving forward with the plan for Friday.'), 'Review');
  });
});

describe('classify() result shape', () => {
  it('returns status, confidence and reasons', () => {
    const r = classify('Workday Nordstrom <nordstrom@myworkday.com>', 'Application Update',
      'We regret to inform you. We will not be moving forward with other candidates.');
    assert.equal(r.status, 'Rejected');
    assert.equal(r.confidence, 'high');
    assert.ok(r.reasons.length > 0);
  });
  it('has no confidence when nothing matches', () => {
    const r = classify('Bob <bob@gmail.com>', 'Hello', 'See you soon');
    assert.deepEqual(r, { status: 'Review', confidence: null, reasons: [] });
  });
  it('detectStatus still returns just the status string', () => {
    assert.equal(c.detectStatus('Acme <jobs@acme.com>', 'Application withdrawn',
      c.cleanBody('Your application for the position has been withdrawn.')), 'Declined by You');
  });
});

describe('sender blocklist', () => {
  it('matches subdomains of an ignored domain', () => {
    assert.equal(c.isIgnoredDomain('hi.wellfound.com'), true);
    assert.equal(c.isIgnoredDomain('e.glassdoor.com'), true);
    assert.equal(c.isIgnoredDomain('glassdoor.com'), true);
  });
  it('does not match look-alike domains', () => {
    assert.equal(c.isIgnoredDomain('notglassdoor.com'), false);
    assert.equal(c.isIgnoredDomain('glassdoor.com.evil.example'), false);
  });
  it('ignores a blocked subdomain even when the subject looks like a real application', () => {
    assert.equal(status('Wellfound <team@hi.wellfound.com>', 'Your application update', 'We regret to inform you the position was not selected'), 'Review');
    assert.equal(status('Glassdoor <x@e.glassdoor.com>', 'Application tips', 'candidate position application interview'), 'Review');
  });
  it('still classifies a look-alike domain normally', () => {
    assert.equal(status('R <x@notglassdoor.com>', 'Application update', 'We regret to inform you. Application for the position.'), 'Rejected');
  });
});

describe('body cleaning', () => {
  it('joins hard-wrapped lines so phrases still match', () => {
    const wrapped = 'Hi Vedija,\r\n\r\nThank you for your interest in the Senior Product Manager position.\r\nWe have made the decision to move forward with\r\nother candidates at this time.\r\n';
    assert.equal(status('Workday Nordstrom <nordstrom@myworkday.com>', 'Application Update', wrapped), 'Rejected');
  });
  it('normalizes curly quotes and non-breaking spaces', () => {
    assert.equal(c.normalizeText('we’ve decided'), "we've decided");
  });
  it('converts HTML to text and drops scripts and styles', () => {
    const html = '<html><head><style>.a{}</style><title>x</title></head><body><p>Thank&nbsp;you for applying</p><p>We&#39;ve <b>received</b> your application for the <b>Product Manager</b> role.</p><script>x()</script></body></html>';
    const text = c.htmlToText(html);
    assert.ok(!/[<>]/.test(text));
    assert.ok(/received/.test(text));
    assert.ok(!/x\(\)/.test(text));
    assert.equal(c.detectStatus('Co <jobs@acme.com>', 'Your application', c.cleanBody(text)), 'Applied');
  });
  it('drops quoted reply text', () => {
    const quoted = "Thanks for the update, I'm available Tuesday for the interview.\n\nOn Tue, Oct 1, 2026 at 9:00 AM Jane <j@acme.com> wrote:\n> Unfortunately we are moving forward with other candidates\n> for this position.";
    assert.ok(!c.cleanBody(quoted).toLowerCase().includes('unfortunately'));
    assert.equal(status('Jane <j@acme.com>', 'Re: Interview for PM position', quoted), 'Interview Scheduled');
  });
  it('cuts a quoted reply whose attribution line wraps', () => {
    const wrapped = 'See below.\nOn Tue, Oct 1, 2026 at 9:00 AM Jane Longname\n<j@acme.com> wrote:\nUnfortunately other candidates';
    assert.ok(!/unfortunately/i.test(c.cleanBody(wrapped)));
  });
  it('keeps a forwarded email whose content is all below the marker', () => {
    const forwarded = '---------- Forwarded message ---------\nFrom: Acme <jobs@acme.com>\nWe regret to inform you that your application for the position was not selected.';
    assert.match(c.cleanBody(forwarded), /regret/);
  });
  it('cuts at an Outlook separator', () => {
    assert.ok(!/secret/.test(c.cleanBody('Hello\n________________________________\nFrom: x\nsecret old text')));
  });
  it('caps the body at 1000 characters', () => {
    assert.ok(c.cleanBody('word '.repeat(5000)).length <= 1000);
  });
  it('handles empty input', () => {
    assert.equal(c.cleanBody(undefined), '');
    assert.equal(c.cleanBody(''), '');
  });
});

describe('job title extraction', () => {
  const title = (subject, body = '') => c.extractJobTitle(subject, body);

  it('keeps a dash that is part of the title', () => {
    assert.equal(title('Nordstrom Application Update for Senior Product Manager - Data Strategy'), 'Senior Product Manager - Data Strategy');
  });
  it('takes the title after a dash in "Thank You For Applying - Title"', () => {
    assert.equal(title('Thank You For Applying -  Senior Product Manager'), 'Senior Product Manager');
  });
  it('reads a quoted title from the subject', () => {
    assert.equal(title('Your "Sr. Project Manager" application is complete'), 'Sr. Project Manager');
  });
  it('gives no title for "Thanks for applying to Via!"', () => {
    assert.equal(title('Thanks for applying to Via!'), '');
  });
  it('falls back to wording in the body', () => {
    assert.equal(title('Hello', 'We received your application for the Product Manager position.'), 'Product Manager');
  });
});

describe('company and title for job boards', () => {
  it('ZipRecruiter: company and title come from the body', () => {
    const r = info('Phil @ ZipRecruiter <phil@ziprecruiter.com>', 'Your "Sr. Project Manager" application is complete',
      'Hi Vedija,\n\nYour application is complete for Sr. Project Manager at SuperGraphics LLC!\n');
    assert.equal(classify('Phil <phil@ziprecruiter.com>', 'Your "Sr. Project Manager" application is complete',
      'Your application is complete for Sr. Project Manager at SuperGraphics LLC!').status, 'Applied');
    assert.equal(r.company, 'SuperGraphics LLC');
    assert.equal(r.jobTitle, 'Sr. Project Manager');
  });
  it('ZipRecruiter: two jobs with the same title keep their own companies', () => {
    const a = info('Phil <phil@ziprecruiter.com>', 'Your "PM" application is complete', 'Your application is complete for PM at Acme Corp!');
    const b = info('Phil <phil@ziprecruiter.com>', 'Your "PM" application is complete', 'Your application is complete for PM at Globex!');
    assert.equal(a.company, 'Acme Corp');
    assert.equal(b.company, 'Globex');
  });
  it('LinkedIn Easy Apply: company from the subject, title from the layout', () => {
    const body = 'LinkedIn\t\nVedija Pillay\nYour application was sent to 17a\n17a\t\nTechnical Product Manager\n17a · United States (Remote)\n\nApplied on October 5, 2026';
    const r = info('LinkedIn <jobs-noreply@linkedin.com>', 'Vedija, your application was sent to 17a', body);
    assert.equal(status('LinkedIn <jobs-noreply@linkedin.com>', 'Vedija, your application was sent to 17a', body), 'Applied');
    assert.equal(r.company, '17a');
    assert.equal(r.jobTitle, 'Technical Product Manager');
  });
  it('LinkedIn: a company name with regex characters is handled', () => {
    const r = info('LinkedIn <jobs-noreply@linkedin.com>', 'Vedija, your application was sent to Acme (EU)',
      'Your application was sent to Acme (EU)\nAcme (EU)\nSenior Data PM\nAcme (EU) · Berlin');
    assert.equal(r.company, 'Acme (EU)');
    assert.equal(r.jobTitle, 'Senior Data PM');
  });
  it('LinkedIn: an unexpected layout still gives the company, with no title', () => {
    const r = info('LinkedIn <jobs-noreply@linkedin.com>', 'Vedija, your application was sent to 17a', 'Applied on October 5');
    assert.equal(r.company, '17a');
    assert.equal(r.jobTitle, '');
  });
});

describe('company extraction', () => {
  const company = (from, subject = 'Hello') => c.extractCompany(from, subject);

  it('uses the company named in the subject first', () => {
    assert.equal(company('x <x@acme.com>', 'Thanks for applying to Via!'), 'Via');
    assert.equal(company('Jane <jane@gmail.com>', 'Update on your application to Fabrikam Systems'), 'Fabrikam Systems');
  });
  it('uses the sender name for applicant-tracking systems', () => {
    assert.equal(company('Workday Nordstrom <nordstrom@myworkday.com>'), 'Nordstrom');
  });
  it('says Unknown for job boards', () => {
    assert.equal(company('Phil <phil@ziprecruiter.com>'), 'Unknown');
  });
  it('uses the registrable name of a company domain', () => {
    assert.equal(company('Careers <careers@mail.nordstrom.com>'), 'Nordstrom');
    assert.equal(company('HR <hr@acme.com>'), 'Acme');
    assert.equal(company('R <r@stripe.io>'), 'Stripe');
    assert.equal(company('R <r@live.acme.com>'), 'Acme');
  });
  it('handles country domains', () => {
    assert.equal(company('HR <hr@acme.co.uk>'), 'Acme');
    assert.equal(company('HR <hr@mail.acme.com.au>'), 'Acme');
    assert.equal(company('HR <hr@careers.acme.org.uk>'), 'Acme');
    assert.equal(company('HR <hr@acme.co.jp>'), 'Acme');
    assert.equal(company('R <r@co.com>'), 'Co');
  });

  describe('personal mail addresses', () => {
    const personal = [
      'Jane Doe <jane.doe@gmail.com>', 'jane.doe@gmail.com', 'Pat <pat@googlemail.com>', 'Bob <bob@outlook.com>',
      'Sam <sam@hotmail.co.uk>', 'Pat <pat@yahoo.co.uk>', 'Pat <pat@mail.yahoo.com>', 'Lee <lee@icloud.com>',
      'Lee <lee@me.com>', 'Lee <lee@protonmail.com>'
    ];
    for (const from of personal) {
      it(`never uses the provider name: ${from}`, () => assert.equal(company(from), 'Unknown'));
    }

    it('uses a sender name that is clearly an employer team', () => {
      assert.equal(company('Acme Robotics Careers <acmecareers@gmail.com>'), 'Acme Robotics');
      assert.equal(company('Contoso Health Recruiting <x@gmail.com>'), 'Contoso Health');
      assert.equal(company('Northwind Labs People Team <x@outlook.com>'), 'Northwind Labs');
      assert.equal(company('Acme Recruiters <x@gmail.com>'), 'Acme');
      assert.equal(company('Acme Corp HR <x@gmail.com>'), 'Acme Corp');
    });
    it('stays Unknown for role words alone', () => {
      assert.equal(company('Talent Acquisition Team <x@gmail.com>'), 'Unknown');
      assert.equal(company('Careers <x@gmail.com>'), 'Unknown');
    });
    it('stays Unknown for a person with a title', () => {
      assert.equal(company('Jane Doe, Recruiter <x@gmail.com>'), 'Unknown');
      assert.equal(company('Jane Doe - Talent Acquisition <x@gmail.com>'), 'Unknown');
      assert.equal(company('Jane Doe | Recruiting <x@gmail.com>'), 'Unknown');
      assert.equal(company('Jane @ Acme Recruiting <x@gmail.com>'), 'Unknown');
      assert.equal(company('Jane Doe Recruiter <x@gmail.com>'), 'Unknown');
      assert.equal(company('Jane Doe <x@gmail.com>'), 'Unknown');
    });
  });
});

describe('demo emails from docs/google-verification-demo.md', () => {
  const from = (name) => `${name} <demo.sender@gmail.com>`;
  const demo = [
    ['Acme Robotics Careers', 'Thanks for applying: your application to Acme Robotics',
      'Hi Sam,\n\nThank you for applying. We received your application for the Senior Product Manager position. Our team will review it and be in touch.',
      'Applied', 'Acme Robotics', 'Senior Product Manager'],
    ['Contoso Health Recruiting', 'Interview invitation: your application to Contoso Health',
      'Hi Sam,\n\nThank you for your application for the Product Manager role at Contoso Health. We would like to invite you to a video interview. Please select a time that works for you.',
      'Interview Scheduled', 'Contoso Health', 'Product Manager'],
    ['Northwind Labs People Team', 'Offer of employment: your application to Northwind Labs',
      'Hi Sam,\n\nCongratulations! Thank you for your application for the Director of Product position. We are pleased to offer you the role. Your offer letter is attached.',
      'Offer', 'Northwind Labs', 'Director of Product'],
    ['Fabrikam Systems Talent', 'Update on your application to Fabrikam Systems',
      'Hi Sam,\n\nThank you for your interest in the Group Product Manager position. After careful consideration, we have decided to move forward with other candidates at this time. We wish you the best in your job search.',
      'Rejected', 'Fabrikam Systems', 'Group Product Manager']
  ];

  for (const [sender, subject, body, wantStatus, wantCompany, wantTitle] of demo) {
    it(`${wantStatus}: ${wantCompany}`, () => {
      assert.equal(status(from(sender), subject, body), wantStatus);
      const r = info(from(sender), subject, body);
      assert.equal(r.company, wantCompany);
      assert.equal(r.jobTitle, wantTitle);
    });
  }

  it('the lunch email is ignored', () => {
    assert.equal(status('Alex <alex.friend.demo@gmail.com>', 'Lunch on Friday?', 'Hey Sam, are you free for lunch on Friday? Let me know!'), 'Review');
  });
});
