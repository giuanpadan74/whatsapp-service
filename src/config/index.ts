import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  
  paths: {
    sessions: path.join(__dirname, '../../sessions'),
    auth: path.join(__dirname, '../../sessions/auth'),
    logs: path.join(__dirname, '../../logs'),
    uploads: path.join(__dirname, '../../uploads'),
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
