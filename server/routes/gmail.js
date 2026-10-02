const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const gmail = google.gmail('v1');

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Helper functions
function extractEmail(from) {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

function extractCompany(email) {
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';
  return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
}

function isNoReply(email) {
  return email.toLowerCase().includes('no-reply') || email.toLowerCase().includes('noreply');
}

function detectStatus(email, subject, body) {
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const senderEmail = extractEmail(email).toLowerCase();
  const isNoReplyEmail = isNoReply(senderEmail);

  if (isNoReplyEmail) {
    if (
      subjectLower.includes('regret') ||
      subjectLower.includes('not selected') ||
      subjectLower.includes('not moving forward') ||
      bodyLower.includes('regret to inform') ||
      bodyLower.includes('not selected')
    ) {
      return 'Rejected';
    }
  }

  if (!isNoReplyEmail) {
    if (
      subjectLower.includes('interview') ||
      subjectLower.includes('invitation') ||
      subjectLower.includes('next round') ||
      subjectLower.includes('phone screen') ||
      subjectLower.includes('technical round') ||
      subjectLower.includes('hiring manager') ||
      bodyLower.includes('schedule') && (bodyLower.includes('interview') || bodyLower.includes('call'))
    ) {
      return 'Interview Scheduled';
    }
  }

  return 'Review';
}

// Gmail returns base64url-encoded bodies, possibly nested in multipart parts
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  for (const part of payload.parts || []) {
    const text = extractBody(part);
    if (text) return text;
  }
  if (!payload.parts && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  return '';
}

// ROUTES START HERE

// GET /api/gmail/auth - Redirect to Google OAuth consent screen
router.get('/auth', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ authUrl });
});

// GET /api/gmail/auth/callback - Handle OAuth callback from Google
router.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }

    const { tokens } = await oauth2Client.getToken(code);

    // Redirect back to the app; the fragment is never sent to a server
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontend}/#gmail_token=${encodeURIComponent(tokens.access_token)}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// POST /api/gmail/scan - Scan Gmail and detect job statuses
router.post('/scan', async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token required' });
    }

    const oauth2ClientTemp = new google.auth.OAuth2();
    oauth2ClientTemp.setCredentials({ access_token: accessToken });

    const authGmail = google.gmail({ version: 'v1', auth: oauth2ClientTemp });

    const messagesRes = await authGmail.users.messages.list({
      userId: 'me',
      maxResults: 100,
      q: 'in:inbox newer_than:180d'
    });

    const messageIds = messagesRes.data.messages || [];

    if (messageIds.length === 0) {
      return res.json({
        message: 'No emails found',
        detectedJobs: []
      });
    }

    const detectedJobs = [];
    const processedEmails = new Set();

    for (const message of messageIds) {
      try {
        const messageRes = await authGmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const messageData = messageRes.data;
        const headers = messageData.payload.headers;

        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        const body = extractBody(messageData.payload);

        const emailKey = `${from}|${subject}`;
        if (processedEmails.has(emailKey)) continue;
        processedEmails.add(emailKey);

        const status = detectStatus(from, subject, body);
        const company = extractCompany(extractEmail(from));
        const parsedDate = new Date(date);
        const emailDate = isNaN(parsedDate)
          ? new Date().toISOString().split('T')[0]
          : parsedDate.toISOString().split('T')[0];

        if (status !== 'Review') {
          detectedJobs.push({
            company,
            jobTitle: '',
            status,
            source: 'Gmail',
            lastEmailDate: emailDate,
            lastEmailSubject: subject,
            senderEmail: extractEmail(from)
          });
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }

    res.json({
      message: 'Email scan complete',
      count: detectedJobs.length,
      detectedJobs
    });
  } catch (error) {
    console.error('Gmail scan error:', error);
    
    if (error.message.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Access token expired. Please re-authenticate.' });
    }
    
    res.status(500).json({
      error: 'Failed to scan Gmail',
      details: error.message
    });
  }
});

// GET /api/gmail/status - Check if user is authenticated
router.get('/status', (req, res) => {
  res.json({ message: 'Gmail integration ready' });
});

module.exports = router;