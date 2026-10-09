const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
require('dotenv').config();

const db = require('./db');
const { createSecurity, splitList } = require('./lib/security');
const { DEMO_MODE } = require('./lib/demoConfig');
const jobsRouter = require('./routes/jobs');
const gmailRouter = require('./routes/gmail');
const gmailConfigRouter = require('./routes/gmailConfig');
const app = express();
const PORT = process.env.PORT || 3000;
// Loopback only: the tracker holds personal data, so other machines must not reach it
const HOST = process.env.HOST || '127.0.0.1';

const CLIENT_DIST = path.join(__dirname, '../client/dist');
const CLIENT_INDEX = path.join(CLIENT_DIST, 'index.html');
const hasBuiltClient = fs.existsSync(CLIENT_INDEX);

// Middleware
app.disable('x-powered-by');
app.use(createSecurity({
  port: PORT,
  extraHosts: splitList(process.env.ALLOWED_HOSTS),
  extraOrigins: splitList(process.env.ALLOWED_ORIGINS)
}));
app.use(express.json());

// Routes
app.use('/api/jobs', jobsRouter);
app.use('/api/gmail/config', gmailConfigRouter);
app.use('/api/gmail', gmailRouter);
// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Job Tracker API is healthy' });
});

// The built web app, so one process on one port is all a user has to run
if (hasBuiltClient) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts('html')) {
      return res.sendFile(CLIENT_INDEX);
    }
    next();
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

function start() {
  const server = http.createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or start with PORT=<another port>.`);
    } else {
      console.error('Server error:', error.message);
    }
    process.exit(1);
  });

  // Only start accepting requests once the database tables exist (and, in demo mode, the sample data)
  db.ready.then(async () => {
    if (DEMO_MODE) {
      const count = await require('./lib/demo').seedDemoData();
      console.log(`DEMO MODE: loaded ${count} sample jobs into a separate database (${db.DB_PATH}).`);
      console.log('Your real data is not used. Press Ctrl+C, then run "npm start" for the real app.');
    }
    server.listen(PORT, HOST, () => {
      console.log(`Job Tracker running at http://localhost:${PORT}`);
      if (!hasBuiltClient) {
        console.log('The web app is not built yet. Run "npm run build" (or "npm run dev:client" for development).');
      }
    });
  }).catch((error) => {
    console.error('Could not start:', error.message);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
      db.closeDb();
      process.exit(0);
    });
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
