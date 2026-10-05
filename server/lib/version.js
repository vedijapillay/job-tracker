// Fingerprint of the code that decides whether an email is job-related.
// Cached "not a job email" judgments are only reused while this is unchanged,
// so editing a rule automatically re-checks old emails on the next scan.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILES = [
  path.join(__dirname, 'classify.js'),
  path.join(__dirname, 'signals.js'),
  path.join(__dirname, '../routes/gmail.js')
];

function computeClassifierVersion() {
  const hash = crypto.createHash('sha1');
  for (const file of FILES) hash.update(fs.readFileSync(file));
  return hash.digest('hex').slice(0, 12);
}

module.exports = { classifierVersion: computeClassifierVersion() };
