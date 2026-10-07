// Google OAuth credentials.
//
// Every user brings their own Google Cloud OAuth client, so nothing about the
// project is shared and no Google app verification is needed. Credentials come
// from the in-app Settings (stored in the local database) or, for developers,
// from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.

const { google } = require('googleapis');
const db = require('../db');

const CLIENT_ID_KEY = 'google_client_id';
const CLIENT_SECRET_KEY = 'google_client_secret';

function defaultRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/gmail/auth/callback`;
}

// Returns { clientId, clientSecret, redirectUri, source } where source is
// 'app' (saved in Settings), 'env' (.env), or null when nothing is configured.
async function getGoogleConfig() {
  const redirectUri = defaultRedirectUri();
  const [savedId, savedSecret] = await Promise.all([db.getSetting(CLIENT_ID_KEY), db.getSetting(CLIENT_SECRET_KEY)]);

  if (savedId && savedSecret) {
    return { clientId: savedId, clientSecret: savedSecret, redirectUri, source: 'app' };
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
      source: 'env'
    };
  }
  return { clientId: null, clientSecret: null, redirectUri, source: null };
}

async function newOAuthClient() {
  const config = await getGoogleConfig();
  if (!config.source) {
    const error = new Error('Google credentials are not set up yet.');
    error.code = 'not_configured';
    throw error;
  }
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

module.exports = { CLIENT_ID_KEY, CLIENT_SECRET_KEY, getGoogleConfig, newOAuthClient };
