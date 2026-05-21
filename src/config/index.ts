import path from 'path';
import type { CorsOptions } from 'cors';

function buildCorsOptions(): CorsOptions {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw || raw === '*') {
    return {
      origin: true,
      credentials: true,
    };
  }

  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('cors_not_allowed'));
    },
    credentials: true,
  };
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  
  paths: {
    sessions: path.join(process.cwd(), 'sessions'),
    auth: path.join(process.cwd(), 'sessions', 'auth'),
    logs: path.join(process.cwd(), 'logs'),
    uploads: path.join(process.cwd(), 'uploads'),
  },
  
  cors: buildCorsOptions(),
  
  qrCodeExpirationMs: 60000,
  
  rateLimit: {
    maxRequestsPerMinute: 10,
  },
};
