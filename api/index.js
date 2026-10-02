import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import db from '../server/db.js';
import jobsRouter from '../server/routes/jobs.js';
import gmailRouter from '../server/routes/gmail.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/jobs', jobsRouter);
app.use('/api/gmail', gmailRouter);

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

export default app;