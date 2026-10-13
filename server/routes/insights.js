const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeInsights, RANGES } = require('../lib/insights');

// Listed explicitly: JavaScript puts numeric-looking object keys first, which would read "30, 90, all"
const RANGE_NAMES = ['all', '30', '90'];

// GET /api/insights?range=all|30|90 - numbers for the Insights tab, computed from your jobs
router.get('/', async (req, res) => {
  try {
    const range = req.query.range === undefined ? 'all' : String(req.query.range);
    if (!(range in RANGES)) {
      return res.status(400).json({ error: `range must be one of: ${RANGE_NAMES.join(', ')}` });
    }
    res.json(computeInsights(await db.getAllJobs(), { range }));
  } catch (error) {
    console.error('Error computing insights:', error);
    res.status(500).json({ error: 'Failed to compute insights', details: error.message });
  }
});

module.exports = router;
