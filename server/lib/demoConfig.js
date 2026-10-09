// Demo mode: `npm run demo` runs the app on sample data in its own database, with a
// simulated Gmail scan, so people can look around without touching real data or Google.
//
// This file has no dependencies so server/db.js can use it before anything else loads.

const os = require('os');
const path = require('path');

// Only an environment variable set when the process starts can turn this on
const DEMO_MODE = process.env.DEMO_MODE === '1';

// Always a dedicated file. JOBS_DB_PATH is deliberately ignored in demo mode, so the
// demo can never be pointed at a real database by accident.
function demoDbPath() {
  return process.env.DEMO_DB_PATH || path.join(os.tmpdir(), 'job-tracker-demo', 'demo.db');
}

module.exports = { DEMO_MODE, demoDbPath };
