import app from './app.js';
import { config } from './config/index.js';
import { sessionStore } from './services/sessionStore.js';
import fs from 'fs/promises';

async function initialize(): Promise<void> {
  try {
    await fs.mkdir(config.paths.logs, { recursive: true });
    await fs.mkdir(config.paths.uploads, { recursive: true });
    
    await sessionStore.initialize();
    
    const sessions = sessionStore.getAllSessions();
    console.log(`[Init] Trovate ${sessions.length} sessioni esistenti`);
  } catch (error) {
    console.error('[Init] Errore inizializzazione:', error);
    process.exit(1);
  }
}

async function start(): Promise<void> {
  await initialize();

  app.listen(config.port, config.host, () => {
    console.log(`[Server] WhatsApp Service avviato su ${config.host}:${config.port}`);
    console.log(`[Server] Health check: http://localhost:${config.port}/health`);
  });
}

start().catch(console.error);
