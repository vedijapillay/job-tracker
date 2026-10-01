const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');
const jobsRouter = require('./routes/jobs');
const gmailRouter = require('./routes/gmail');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/jobs', jobsRouter);
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test it: http://localhost:${PORT}/api/test`);
  console.log(`API docs: http://localhost:${PORT}/api/jobs`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    db.closeDb();
    process.exit(0);
  });
});

module.exports = app;