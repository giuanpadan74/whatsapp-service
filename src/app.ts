import express from 'express';
import cors from 'cors';
import sessionsRouter from './routes/sessions.js';
import statusRouter from './routes/status.js';
import scheduledRouter from './routes/scheduled.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config } from './config/index.js';

const app = express();

app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/status', statusRouter);
app.use('/api/scheduled', scheduledRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
