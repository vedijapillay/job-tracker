const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { DEMO_MODE, demoDbPath } = require('./lib/demoConfig');

// Database path
const REAL_DB_PATH = path.join(__dirname, '../jobs.db');
const DB_PATH = DEMO_MODE ? demoDbPath() : (process.env.JOBS_DB_PATH || REAL_DB_PATH);

if (DEMO_MODE) {
  // Demo data is reset on every start, so it must never share a file with real data
  if (path.resolve(DB_PATH) === path.resolve(REAL_DB_PATH)) {
    throw new Error('Demo mode will not use the real jobs.db. Unset DEMO_DB_PATH or choose another file.');
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// Resolves once the schema exists. The server waits for this before it starts
// listening, so no request can arrive while tables are still being created.
let resolveReady;
let rejectReady;
const ready = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});
ready.catch(() => {}); // callers that care handle the failure; this avoids an unhandled rejection

// Initialize database
const db = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    rejectReady(err);
    return;
  }
  console.log('Connected to SQLite database at', DB_PATH);
  try {
    await initializeSchema();
    resolveReady();
  } catch (schemaError) {
    console.error('Error initializing database:', schemaError.message);
    rejectReady(schemaError);
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create the tables one after another. SQLite runs queued statements in parallel by
// default, so anything that depends on an earlier statement must wait for it.
async function initializeSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      jobTitle TEXT NOT NULL,
      appliedDate DATE NOT NULL,
      status TEXT DEFAULT 'Applied',
      source TEXT,
      lastEmailDate DATE,
      lastEmailSubject TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Jobs table initialized');

  // Jobs remember the Gmail message they came from, so deleting a job lets that
  // email show up in the next scan again
  const columns = await all('PRAGMA table_info(jobs)');
  if (!columns.some(col => col.name === 'emailId')) {
    await run('ALTER TABLE jobs ADD COLUMN emailId TEXT');
  }

  // Gmail messages the user has dismissed, so scans skip them
  await run(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      messageId TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      sender TEXT,
      subject TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Earlier versions recorded added emails here; they are now tracked on the job itself
  await run("DELETE FROM processed_emails WHERE reason = 'added'");

  // Single row: the one Gmail account connected to this local tracker
  await run(`
    CREATE TABLE IF NOT EXISTS gmail_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      refreshToken TEXT NOT NULL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // App settings entered in the UI, such as the user's own Google OAuth credentials
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // Messages already judged not job-related, per classifier version, so scans skip them
  await run(`
    CREATE TABLE IF NOT EXISTS scanned_emails (
      messageId TEXT PRIMARY KEY,
      version TEXT NOT NULL
    )
  `);
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
}

function setSetting(key, value) {
  return run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

function deleteSetting(key) {
  return run('DELETE FROM settings WHERE key = ?', [key]);
}

function saveRefreshToken(refreshToken) {
  return run(
    'INSERT OR REPLACE INTO gmail_auth (id, refreshToken, updatedAt) VALUES (1, ?, CURRENT_TIMESTAMP)',
    [refreshToken]
  );
}

function getRefreshToken() {
  return new Promise((resolve, reject) => {
    db.get('SELECT refreshToken FROM gmail_auth WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.refreshToken : null);
    });
  });
}

function clearRefreshToken() {
  return run('DELETE FROM gmail_auth WHERE id = 1');
}

// Forget judgments made by an older version of the classifier
function pruneIgnoredEmails(version) {
  return run('DELETE FROM scanned_emails WHERE version != ?', [version]);
}

function getIgnoredEmailIds(version) {
  return new Promise((resolve, reject) => {
    db.all('SELECT messageId FROM scanned_emails WHERE version = ?', [version], (err, rows) => {
      if (err) reject(err);
      else resolve(new Set(rows.map(row => row.messageId)));
    });
  });
}

function markEmailsIgnored(messageIds, version) {
  if (messageIds.length === 0) return Promise.resolve({ changes: 0 });
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN');
      const stmt = db.prepare('INSERT OR REPLACE INTO scanned_emails (messageId, version) VALUES (?, ?)');
      for (const id of messageIds) stmt.run(id, version);
      stmt.finalize();
      db.run('COMMIT', (err) => (err ? reject(err) : resolve({ changes: messageIds.length })));
    });
  });
}

// Record a Gmail message as dismissed or added
function markEmailProcessed({ messageId, reason, sender, subject }) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO processed_emails (messageId, reason, sender, subject) VALUES (?, ?, ?, ?)',
      [messageId, reason, sender, subject],
      (err) => (err ? reject(err) : resolve({ messageId, reason }))
    );
  });
}

// Set of Gmail message IDs the scan should skip
function getProcessedEmailIds() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT messageId FROM processed_emails
      UNION
      SELECT emailId FROM jobs WHERE emailId IS NOT NULL
    `, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(new Set(rows.map(row => row.messageId)));
      }
    });
  });
}

// Insert a new job
function insertJob(job) {
  return new Promise((resolve, reject) => {
    const { company, jobTitle, appliedDate, status = 'Applied', source, lastEmailDate, lastEmailSubject, notes, emailId = null } = job;
    
    const query = `
      INSERT INTO jobs (company, jobTitle, appliedDate, status, source, lastEmailDate, lastEmailSubject, notes, emailId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [company, jobTitle, appliedDate, status, source, lastEmailDate, lastEmailSubject, notes, emailId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, ...job });
      }
    });
  });
}

// Get all jobs
function getAllJobs() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM jobs ORDER BY appliedDate DESC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// Get jobs with filters
function getJobsFiltered(filters = {}) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];

    // Filter by status
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    // Filter by source
    if (filters.source) {
      query += ' AND source = ?';
      params.push(filters.source);
    }

    // Filter by date range
    if (filters.startDate) {
      query += ' AND appliedDate >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND appliedDate <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY appliedDate DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// Get job by ID
function getJobById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM jobs WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Update job
function updateJob(id, updates) {
  return new Promise((resolve, reject) => {
    const allowedFields = ['company', 'jobTitle', 'status', 'source', 'lastEmailDate', 'lastEmailSubject', 'notes', 'emailId'];
    const updateFields = [];
    const values = [];

    // Build dynamic update query
    for (const field of allowedFields) {
      if (field in updates) {
        updateFields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (updateFields.length === 0) {
      reject(new Error('No valid fields to update'));
      return;
    }

    updateFields.push('updatedAt = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id, ...updates });
      }
    });
  });
}

// Delete job
function deleteJob(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM jobs WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ deleted: this.changes > 0 });
      }
    });
  });
}

// Delete several jobs in one statement
function deleteJobs(ids) {
  return new Promise((resolve, reject) => {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM jobs WHERE id IN (${placeholders})`, ids, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ deletedCount: this.changes });
      }
    });
  });
}

// Get job statistics
function getStats() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Applied' THEN 1 ELSE 0 END) as applied,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'Interview Scheduled' THEN 1 ELSE 0 END) as interviews,
        SUM(CASE WHEN status IN ('Recruiter Screen', 'Technical Round', 'HM Round', 'Offer') THEN 1 ELSE 0 END) as moving_forward
      FROM jobs
    `, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows[0] || {});
      }
    });
  });
}

// Close database
function closeDb() {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
}

// Export functions
module.exports = {
  db,
  ready,
  DB_PATH,
  insertJob,
  getAllJobs,
  getJobsFiltered,
  getJobById,
  updateJob,
  deleteJob,
  deleteJobs,
  markEmailProcessed,
  getSetting,
  setSetting,
  deleteSetting,
  saveRefreshToken,
  getRefreshToken,
  clearRefreshToken,
  pruneIgnoredEmails,
  getIgnoredEmailIds,
  markEmailsIgnored,
  getProcessedEmailIds,
  getStats,
  closeDb
};