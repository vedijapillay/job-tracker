// Sample data and a simulated Gmail for demo mode (`npm run demo`).
//
// Everything here is invented. The company names are the fictional ones Microsoft uses in its
// sample databases, and the email addresses use the reserved ".example" domain.

const db = require('../db');

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are relative to today, so the demo always looks current
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const isoDay = (days) => daysAgo(days).toISOString().split('T')[0];

// ---- jobs already in the demo tracker ----
// Fabrikam and Northwind are also in the simulated mailbox, so the scan shows an existing
// job being moved forward instead of a duplicate being added.
function sampleJobs() {
  return [
    { company: 'Fabrikam Systems', jobTitle: 'Group Product Manager', status: 'Applied', source: 'LinkedIn', applied: 12 },
    { company: 'Northwind Labs', jobTitle: 'Director of Product', status: 'HM Round', source: 'Referral', applied: 30 },
    { company: 'Wingtip Toys', jobTitle: 'Product Operations Lead', status: 'Technical Round', source: 'Company site', applied: 21 },
    { company: 'Adventure Works', jobTitle: 'Senior Program Manager', status: 'Recruiter Screen', source: 'Builtin', applied: 9 },
    { company: 'Tailspin Aerospace', jobTitle: 'Technical Program Manager', status: 'Applied', source: 'LinkedIn', applied: 5 },
    { company: 'Margie\'s Travel', jobTitle: 'Senior Product Manager', status: 'Interview Scheduled', source: 'LinkedIn', applied: 16 },
    { company: 'Litware Inc', jobTitle: 'Product Manager, Growth', status: 'Rejected', source: 'Company site', applied: 41 },
    { company: 'Proseware', jobTitle: 'Product Analyst', status: 'Ghosted', source: 'Builtin', applied: 55 },
    { company: 'Lucerne Publishing', jobTitle: 'Product Manager', status: 'Declined by You', source: 'Referral', applied: 38 },
    { company: 'Humongous Insurance', jobTitle: 'Data Product Manager', status: 'Applied', source: 'Gmail', applied: 2 }
  ];
}

// ---- the simulated mailbox ----
function mailboxSpec() {
  const noReply = (name, domain) => `${name} <no-reply@${domain}>`;
  return [
    // Matches a tracked job: Fabrikam moves from Applied to Rejected
    {
      id: 'demo-1', ageDays: 1, from: 'Fabrikam Systems Talent <talent@fabrikam.example>',
      subject: 'Update on your application to Fabrikam Systems',
      body: 'Hi Sam,\n\nThank you for your interest in the Group Product Manager position. After careful consideration, we have decided to move forward with other candidates at this time. We wish you the best in your job search.\n\nFabrikam Systems Talent'
    },
    // Matches a tracked job: Northwind moves from HM Round to Offer
    {
      id: 'demo-2', ageDays: 1, from: 'Northwind Labs People Team <people@northwind.example>',
      subject: 'Offer of employment: your application to Northwind Labs',
      body: 'Hi Sam,\n\nCongratulations! Thank you for your application for the Director of Product position. We are pleased to offer you the role. Your offer letter is attached.\n\nNorthwind Labs People Team'
    },
    // New jobs the scan finds
    {
      id: 'demo-3', ageDays: 2, from: 'Contoso Health Recruiting <recruiting@contoso.example>',
      subject: 'Interview invitation: your application to Contoso Health',
      body: 'Hi Sam,\n\nThank you for your application for the Product Manager role at Contoso Health. We would like to invite you to a video interview. Please select a time that works for you.\n\nContoso Health Recruiting'
    },
    {
      id: 'demo-4', ageDays: 3, from: 'Acme Robotics Careers <careers@acme-robotics.example>',
      subject: 'Thanks for applying: your application to Acme Robotics',
      body: 'Hi Sam,\n\nThank you for applying. We received your application for the Senior Product Manager position. Our team will review it and be in touch.\n\nAcme Robotics Talent Team'
    },
    {
      id: 'demo-5', ageDays: 4, from: 'Phil @ JobBoard <phil@jobboard.example>',
      subject: 'Your "Sr. Project Manager" application is complete',
      body: 'Hi Sam,\n\nYour application is complete for Sr. Project Manager at Initech!\n'
    },
    {
      id: 'demo-6', ageDays: 4, from: 'Careers Network <jobs-noreply@careers-network.example>',
      subject: 'Sam, your application was sent to Globex Corporation',
      body: 'Your application was sent to Globex Corporation\nGlobex Corporation\nProduct Operations Manager\nGlobex Corporation · Remote\n\nApplied on ' + daysAgo(4).toDateString()
    },
    // Already reflected in the tracker (Tailspin is already Applied), so nothing new to add
    {
      id: 'demo-7', ageDays: 5, from: 'Tailspin Aerospace Hiring <hiring@tailspin.example>',
      subject: 'Thanks for applying to Tailspin Aerospace',
      body: 'We received your application for the Technical Program Manager position. A recruiter will review it.\n'
    },
    // Not job related: the scan ignores these
    {
      id: 'demo-8', ageDays: 1, from: 'Alex Friend <alex@mail.example>',
      subject: 'Lunch on Friday?', body: 'Hey Sam, are you free for lunch on Friday? Let me know!'
    },
    {
      id: 'demo-9', ageDays: 2, from: noReply('Job Alerts', 'jobalerts.example'),
      subject: 'New jobs: Product Manager at Hooli and 10 more jobs', body: 'Apply to these positions today.'
    },
    {
      id: 'demo-10', ageDays: 3, from: 'Calendar <calendar@calendar.example>',
      subject: 'Invitation: Team lunch @ Fri', body: 'Join with a video call. Schedule a call if you need to change the time.'
    }
  ];
}

// A message in the shape the Gmail API returns, so the real scan code can read it
function toGmailMessage({ id, ageDays, from, subject, body }) {
  const sent = daysAgo(ageDays);
  return {
    id,
    internalDate: String(sent.getTime()),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Date', value: sent.toUTCString() }
      ],
      body: { data: Buffer.from(body).toString('base64url') }
    }
  };
}

// Stands in for google.gmail(): the scan runs its normal pipeline on these messages
function createDemoGmail() {
  const messages = new Map(mailboxSpec().map(spec => [spec.id, toGmailMessage(spec)]));
  return {
    users: {
      messages: {
        list: async () => ({ data: { messages: [...messages.keys()].map(id => ({ id })) } }),
        get: async ({ id }) => {
          if (!messages.has(id)) throw new Error(`No such demo message: ${id}`);
          return { data: messages.get(id) };
        }
      }
    }
  };
}

// ---- seeding ----
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});
const get = (sql) => new Promise((resolve, reject) => {
  db.db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
});

// Reset the demo database to a known state. A database holding jobs that is not marked
// as a demo database is never touched: this function must not be able to erase real data.
async function seedDemoData() {
  await run('CREATE TABLE IF NOT EXISTS demo_marker (id INTEGER PRIMARY KEY CHECK (id = 1), createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const marker = await get('SELECT id FROM demo_marker WHERE id = 1');
  const { count } = await get('SELECT count(*) AS count FROM jobs');

  if (!marker && count > 0) {
    throw new Error(`Refusing to reset ${db.DB_PATH}: it contains ${count} job(s) and is not a demo database.`);
  }

  for (const table of ['jobs', 'processed_emails', 'scanned_emails', 'gmail_auth', 'settings']) {
    await run(`DELETE FROM ${table}`);
  }
  await run("DELETE FROM sqlite_sequence WHERE name = 'jobs'");
  await run('INSERT OR REPLACE INTO demo_marker (id) VALUES (1)');

  for (const job of sampleJobs()) {
    await db.insertJob({
      company: job.company,
      jobTitle: job.jobTitle,
      appliedDate: isoDay(job.applied),
      status: job.status,
      source: job.source
    });
  }
  return sampleJobs().length;
}

module.exports = { createDemoGmail, seedDemoData, sampleJobs, mailboxSpec };
