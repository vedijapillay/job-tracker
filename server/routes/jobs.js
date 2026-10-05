const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/jobs - Create a new job
router.post('/', async (req, res) => {
  try {
    const { company, jobTitle, appliedDate, status, source, lastEmailDate, lastEmailSubject, notes, emailId } = req.body;

    // Validate required fields
    if (!company || !jobTitle || !appliedDate) {
      return res.status(400).json({
        error: 'Missing required fields: company, jobTitle, appliedDate'
      });
    }

    const job = await db.insertJob({
      company,
      jobTitle,
      appliedDate,
      status: status || 'Applied',
      source,
      lastEmailDate,
      lastEmailSubject,
      notes,
      emailId
    });

    res.status(201).json({
      message: 'Job created successfully',
      job
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job', details: error.message });
  }
});

// GET /api/jobs - Get all jobs with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, source, startDate, endDate } = req.query;

    // Build filters object
    const filters = {};
    if (status) filters.status = status;
    if (source) filters.source = source;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    let jobs;
    if (Object.keys(filters).length > 0) {
      jobs = await db.getJobsFiltered(filters);
    } else {
      jobs = await db.getAllJobs();
    }

    res.json({
      count: jobs.length,
      jobs
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs', details: error.message });
  }
});

// GET /api/jobs/stats - Get statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({
      message: 'Job statistics',
      stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
  }
});

// GET /api/jobs/:id - Get a specific job by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const job = await db.getJobById(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      message: 'Job retrieved successfully',
      job
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job', details: error.message });
  }
});

// PUT /api/jobs/:id - Update a job
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Check if job exists
    const existingJob = await db.getJobById(id);
    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Validate update fields
    const allowedFields = ['company', 'jobTitle', 'status', 'source', 'lastEmailDate', 'lastEmailSubject', 'notes'];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid fields: ${invalidFields.join(', ')}`,
        allowedFields
      });
    }

    const updatedJob = await db.updateJob(id, updates);

    res.json({
      message: 'Job updated successfully',
      job: { ...existingJob, ...updates }
    });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job', details: error.message });
  }
});

// DELETE /api/jobs - Delete several jobs: { ids: [1, 2, 3] }
router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => !Number.isInteger(id))) {
      return res.status(400).json({ error: 'ids must be a non-empty array of integers' });
    }

    const result = await db.deleteJobs(ids);

    res.json({
      message: 'Jobs deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting jobs:', error);
    res.status(500).json({ error: 'Failed to delete jobs', details: error.message });
  }
});

// DELETE /api/jobs/:id - Delete a job
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Check if job exists
    const existingJob = await db.getJobById(id);
    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const result = await db.deleteJob(id);

    res.json({
      message: 'Job deleted successfully',
      deleted: result.deleted
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job', details: error.message });
  }
});

module.exports = router;