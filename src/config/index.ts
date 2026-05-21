import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  
  paths: {
    sessions: path.join(process.cwd(), 'sessions'),
    auth: path.join(process.cwd(), 'sessions', 'auth'),
    logs: path.join(process.cwd(), 'logs'),
    uploads: path.join(process.cwd(), 'uploads'),
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  
  qrCodeExpirationMs: 60000,
  
  rateLimit: {
    maxRequestsPerMinute: 10,
  },
};
