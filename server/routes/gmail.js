const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const db = require('../db');

const { parseFrom, extractJobInfo, classify, htmlToText, cleanBody } = require('../lib/classify');
const { buildSearchQueries } = require('../lib/query');
const { findMatch, shouldUpdate, collapseByApplication } = require('../lib/match');
const { classifierVersion } = require('../lib/version');
const { getGoogleConfig, newOAuthClient } = require('../lib/googleConfig');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const FETCH_CONCURRENCY = 8;

const LOCAL_PORT = process.env.PORT || 3000;

// One-time values that tie an OAuth callback to the sign-in we started, so a
// crafted callback link can't connect someone else's Gmail to this tracker
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function createState() {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, now);
  return state;
}

function consumeState(state) {
  const createdAt = pendingStates.get(state);
  pendingStates.delete(state);
  return createdAt !== undefined && Date.now() - createdAt <= STATE_TTL_MS;
}

// Run fn over items with at most `limit` in flight
async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Retry rate-limit and server errors a couple of times
async function withRetry(fn, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = Number(error.code || (error.response && error.response.status));
      const retryable = code === 429 || code >= 500;
      if (!retryable || attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

// Gmail returns base64url-encoded bodies, possibly nested in multipart parts
function findPartData(payload, mimeType) {
  if (!payload) return '';
  if (payload.mimeType === mimeType && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  for (const part of payload.parts || []) {
    const data = findPartData(part, mimeType);
    if (data) return data;
  }
  return '';
}

// Prefer text/plain; many ATS and LinkedIn emails are HTML-only, so fall back to that
function extractBody(payload) {
  const plain = findPartData(payload, 'text/plain');
  if (plain.trim()) return plain;
  const html = findPartData(payload, 'text/html');
  return html ? htmlToText(html) : '';
}

// ROUTES START HERE

// GET /api/gmail/auth - URL of the Google consent screen
router.get('/auth', async (req, res) => {
  try {
    const client = await newOAuthClient();
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: createState()
    });

    res.json({ authUrl });
  } catch (error) {
    if (error.code === 'not_configured') {
      return res.status(400).json({ error: error.message, code: 'not_configured' });
    }
    res.status(500).json({ error: 'Failed to start sign-in', details: error.message });
  }
});

// GET /api/gmail/auth/callback - Google sends the user back here with a code
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!state || !consumeState(String(state))) {
      return res.status(400).json({ error: 'Invalid or expired sign-in. Please try connecting again.' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }

    const { tokens } = await (await newOAuthClient()).getToken(code);

    // The refresh token lets future scans run without signing in again
    if (tokens.refresh_token) {
      await db.saveRefreshToken(tokens.refresh_token);
    } else if (!(await db.getRefreshToken())) {
      throw new Error('Google did not return a refresh token. Remove this app from your Google account permissions and try again.');
    }

    // No credentials in the URL
    const frontend = process.env.FRONTEND_URL || `http://localhost:${LOCAL_PORT}`;
    res.redirect(`${frontend}/#gmail=connected`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// GET /api/gmail/status - Is a Gmail account connected?
router.get('/status', async (req, res) => {
  try {
    const config = await getGoogleConfig();
    res.json({
      message: 'Gmail integration ready',
      configured: Boolean(config.source),
      connected: Boolean(await db.getRefreshToken())
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read status', details: error.message });
  }
});

// POST /api/gmail/disconnect - Forget the stored Google credentials
router.post('/disconnect', async (req, res) => {
  try {
    await db.clearRefreshToken();
    res.json({ message: 'Gmail disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect', details: error.message });
  }
});

// POST /api/gmail/scan - Scan Gmail and detect job statuses
router.post('/scan', async (req, res) => {
  const startedAt = Date.now();

  try {
    const refreshToken = await db.getRefreshToken();
    if (!refreshToken) {
      return res.status(401).json({ error: 'Gmail is not connected.', code: 'not_connected' });
    }

    // Credentials are refreshed automatically from the stored refresh token
    const auth = await newOAuthClient();
    auth.setCredentials({ refresh_token: refreshToken });
    const authGmail = google.gmail({ version: 'v1', auth });

    // Run each search and merge, keeping one entry per message
    const seen = new Set();
    const messageIds = [];
    for (const { q, maxResults } of buildSearchQueries()) {
      const listRes = await withRetry(() => authGmail.users.messages.list({ userId: 'me', maxResults, q }));
      for (const message of listRes.data.messages || []) {
        if (!seen.has(message.id)) {
          seen.add(message.id);
          messageIds.push(message);
        }
      }
    }

    if (messageIds.length === 0) {
      return res.json({
        message: 'No emails found',
        detectedJobs: []
      });
    }

    // Skip messages that were dismissed, are already tracked, or were judged
    // not job-related by this version of the classifier
    await db.pruneIgnoredEmails(classifierVersion);
    const [skipIds, ignoredIds] = await Promise.all([
      db.getProcessedEmailIds(),
      db.getIgnoredEmailIds(classifierVersion)
    ]);
    const toFetch = messageIds.filter(m => !skipIds.has(m.id) && !ignoredIds.has(m.id));

    const detectedJobs = [];
    const newlyIgnored = [];

    await mapLimit(toFetch, FETCH_CONCURRENCY, async (message) => {
      try {
        const messageRes = await withRetry(() => authGmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        }));

        const messageData = messageRes.data;
        const headers = messageData.payload.headers;

        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        const body = cleanBody(extractBody(messageData.payload));

        const { status, confidence } = classify(from, subject, body);

        if (status === 'Review') {
          newlyIgnored.push(message.id);
          return;
        }

        const { company, jobTitle } = extractJobInfo(from, subject, body);
        const parsedDate = new Date(date);
        const emailDate = isNaN(parsedDate)
          ? new Date().toISOString().split('T')[0]
          : parsedDate.toISOString().split('T')[0];

        detectedJobs.push({
          id: message.id,
          receivedAt: Number(messageData.internalDate) || 0,
          company,
          jobTitle,
          status,
          confidence,
          source: 'Gmail',
          lastEmailDate: emailDate,
          lastEmailSubject: subject,
          senderEmail: parseFrom(from).email
        });
      } catch (error) {
        // Not cached, so a failed message is tried again next scan
        console.error('Error processing message:', error);
      }
    });

    await db.markEmailsIgnored(newlyIgnored, classifierVersion);

    // One result per application, then compare against what is already tracked
    const trackedJobs = await db.getAllJobs();
    let alreadyTracked = 0;
    const results = [];

    // Parallel fetches finish out of order; collapsing keeps the newest on ties
    detectedJobs.sort((a, b) => b.receivedAt - a.receivedAt);

    for (const job of collapseByApplication(detectedJobs)) {
      const { matchedJob, similarCount } = findMatch(job, trackedJobs);

      if (matchedJob && !shouldUpdate(matchedJob.status, job.status)) {
        alreadyTracked++; // the tracker is already as far along as this email says
        continue;
      }

      const { receivedAt, ...rest } = job;
      results.push({
        ...rest,
        matchedJob: matchedJob
          ? { id: matchedJob.id, company: matchedJob.company, jobTitle: matchedJob.jobTitle, status: matchedJob.status }
          : null,
        similarCount
      });
    }

    res.json({
      message: 'Email scan complete',
      count: results.length,
      alreadyTracked,
      detectedJobs: results,
      stats: {
        listed: messageIds.length,
        fetched: toFetch.length,
        skipped: messageIds.length - toFetch.length,
        ms: Date.now() - startedAt
      }
    });
  } catch (error) {
    if (error.code === 'not_configured') {
      return res.status(400).json({ error: error.message, code: 'not_configured' });
    }

    console.error('Gmail scan error:', error);

    // Revoked or expired (Google expires refresh tokens after 7 days while the
    // OAuth app is in "Testing"): forget it so the client asks the user to sign in again
    if (String(error.message).includes('invalid_grant')) {
      await db.clearRefreshToken();
      return res.status(401).json({ error: 'Gmail access expired. Please sign in again.', code: 'reauth_required' });
    }

    res.status(500).json({
      error: 'Failed to scan Gmail',
      details: error.message
    });
  }
});

// POST /api/gmail/processed - Remember an email so future scans skip it
// body: { id, reason: 'dismissed', senderEmail?, subject? }
router.post('/processed', async (req, res) => {
  try {
    const { id, reason, senderEmail, subject } = req.body || {};

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Email id required' });
    }
    if (reason !== 'dismissed') {
      return res.status(400).json({ error: "reason must be 'dismissed'" });
    }

    await db.markEmailProcessed({ messageId: id, reason, sender: senderEmail, subject });
    res.json({ message: 'Email will be skipped in future scans' });
  } catch (error) {
    console.error('Error marking email processed:', error);
    res.status(500).json({ error: 'Failed to save', details: error.message });
  }
});

module.exports = router;
