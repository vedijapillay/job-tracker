// Settings for the user's own Google OAuth credentials.
// The client secret is write-only: it is stored locally and never sent back.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { CLIENT_ID_KEY, CLIENT_SECRET_KEY, getGoogleConfig, newOAuthClient } = require('../lib/googleConfig');

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;
const TEST_TIMEOUT_MS = 10000;

function describe(config) {
  return {
    configured: Boolean(config.source),
    source: config.source, // 'app' | 'env' | null
    clientId: config.clientId,
    hasSecret: Boolean(config.clientSecret),
    redirectUri: config.redirectUri
  };
}

// GET /api/gmail/config
router.get('/', async (req, res) => {
  try {
    res.json(describe(await getGoogleConfig()));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings', details: error.message });
  }
});

// PUT /api/gmail/config  body: { clientId, clientSecret }
router.put('/', async (req, res) => {
  try {
    const clientId = String((req.body && req.body.clientId) || '').trim();
    const clientSecret = String((req.body && req.body.clientSecret) || '').trim();

    if (!CLIENT_ID_PATTERN.test(clientId)) {
      return res.status(400).json({ error: 'The Client ID should end with ".apps.googleusercontent.com". Copy it from the Google Cloud credentials page.' });
    }

    const savedId = await db.getSetting(CLIENT_ID_KEY);
    const savedSecret = await db.getSetting(CLIENT_SECRET_KEY);

    // A blank secret keeps the saved one, but only for the same client
    const secret = clientSecret || (savedId === clientId ? savedSecret : null);
    if (!secret) {
      return res.status(400).json({ error: 'Enter the Client secret for this Client ID.' });
    }
    if (/\s/.test(secret) || secret.length < 8 || secret.length > 200) {
      return res.status(400).json({ error: 'That Client secret does not look right. Copy it again without spaces.' });
    }

    await db.setSetting(CLIENT_ID_KEY, clientId);
    await db.setSetting(CLIENT_SECRET_KEY, secret);

    // A sign-in made with a different Google client cannot be reused
    if (savedId !== clientId || savedSecret !== secret) {
      await db.clearRefreshToken();
    }

    res.json(describe(await getGoogleConfig()));
  } catch (error) {
    console.error('Error saving Google credentials:', error);
    res.status(500).json({ error: 'Failed to save credentials', details: error.message });
  }
});

// DELETE /api/gmail/config - forget the saved credentials and the sign-in made with them
router.delete('/', async (req, res) => {
  try {
    await db.deleteSetting(CLIENT_ID_KEY);
    await db.deleteSetting(CLIENT_SECRET_KEY);
    await db.clearRefreshToken();
    res.json(describe(await getGoogleConfig()));
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove credentials', details: error.message });
  }
});

// POST /api/gmail/config/test
// Asks Google to exchange a made-up authorization code. Google checks the client
// credentials first: "invalid_client" means wrong ID or secret, while
// "invalid_grant" means the credentials were accepted and only the fake code failed.
router.post('/test', async (req, res) => {
  let client;
  try {
    client = await newOAuthClient();
  } catch (error) {
    if (error.code === 'not_configured') {
      return res.status(400).json({ ok: false, message: 'Save your Client ID and secret first.' });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }

  try {
    await Promise.race([
      client.getToken('job-tracker-connection-test'),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), TEST_TIMEOUT_MS))
    ]);
    // A real token would be surprising here, but it still means the credentials work
    return res.json({ ok: true, message: 'Google accepted these credentials.' });
  } catch (error) {
    const googleError = error.response && error.response.data && error.response.data.error;

    if (googleError === 'invalid_grant') {
      return res.json({ ok: true, message: 'Google accepted these credentials.' });
    }
    if (googleError === 'invalid_client') {
      return res.json({ ok: false, message: 'Google rejected the Client ID or secret. Check that you copied both from the same OAuth client.' });
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
      return res.json({ ok: false, message: 'Could not reach Google. Check your internet connection and try again.' });
    }
    return res.json({ ok: false, message: `Google returned an unexpected response: ${googleError || error.message}` });
  }
});

module.exports = router;
