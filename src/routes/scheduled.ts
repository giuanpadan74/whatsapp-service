import { Router, Request, Response } from 'express';
import multer from 'multer';
import { waClientManager } from '../services/waClient.js';
import { sessionStore } from '../services/sessionStore.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const upload = multer({ 
  limits: { fileSize: 16 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

const scheduledConfigs: Map<string, any> = new Map();
const scheduledStatus: Map<string, any> = new Map();

router.post('/send', upload.single('media'), async (req: Request, res: Response) => {
  const agentId = String((req.body as any)?.agentId ?? '');
  try {
    const caption = (req.body as any)?.caption as string | undefined;
    const file = req.file;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId è richiesto' });
    }

    if (!file) {
      return res.status(400).json({ error: 'media file è richiesto' });
    }

    const session = sessionStore.getSessionByAgentId(agentId);
    if (!session || session.status !== 'connected') {
      return res.status(400).json({ error: 'session_not_connected' });
    }

    if (!waClientManager.isConnected(agentId)) {
      return res.status(400).json({ error: 'session_not_connected' });
    }

    const messageId = await waClientManager.sendMediaStatus(
      agentId,
      file.buffer,
      file.mimetype,
      caption
    );

    updateScheduledStatus(agentId, 'idle', true);

    res.json({
      success: true,
      messageId,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Scheduled] Errore invio:', error);
    updateScheduledStatus(agentId, 'error', false, (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/status/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = String((req.params as any).agentId ?? '');
    
    let status = scheduledStatus.get(agentId);
    
    if (!status) {
      status = {
        agentId,
        state: 'offline' as const,
      };
      scheduledStatus.set(agentId, status);
    }

    const session = sessionStore.getSessionByAgentId(agentId);
    if (!session || session.status !== 'connected') {
      status.state = 'offline';
    }

    res.json(status);
  } catch (error) {
    console.error('[Scheduled] Errore status:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/config', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const agentId = String(body?.agentId ?? '');
    const enabled = body?.enabled as boolean | undefined;
    const time = body?.time as string | undefined;
    const timezone = body?.timezone as string | undefined;
    const watchFolder = body?.watchFolder as string | undefined;
    const captionTemplate = body?.captionTemplate as string | undefined;
    const autoDelete = body?.autoDelete as boolean | undefined;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId è richiesto' });
    }

    const config = {
      agentId,
      enabled: enabled ?? false,
      time: time ?? '08:00',
      timezone: timezone ?? 'Europe/Rome',
      watchFolder: watchFolder ?? '',
      captionTemplate: captionTemplate ?? '📸 {date}',
      autoDelete: autoDelete ?? false,
    };

    scheduledConfigs.set(agentId, config);
    saveScheduledConfig(agentId, config);

    res.json(config);
  } catch (error) {
    console.error('[Scheduled] Errore salvataggio config:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/config/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = String((req.params as any).agentId ?? '');
    
    let config = scheduledConfigs.get(agentId);
    
    if (!config) {
      config = await loadScheduledConfig(agentId);
      if (config) {
        scheduledConfigs.set(agentId, config);
      }
    }

    if (!config) {
      config = {
        agentId,
        enabled: false,
        time: '08:00',
        timezone: 'Europe/Rome',
        watchFolder: '',
        captionTemplate: '📸 {date}',
        autoDelete: false,
      };
    }

    res.json(config);
  } catch (error) {
    console.error('[Scheduled] Errore caricamento config:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

async function saveScheduledConfig(agentId: string, config: any): Promise<void> {
  try {
    const configPath = path.join(process.cwd(), 'config', `${agentId}_scheduled.json`);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('[Scheduled] Errore salvataggio config file:', err);
  }
}

async function loadScheduledConfig(agentId: string): Promise<any | null> {
  try {
    const configPath = path.join(process.cwd(), 'config', `${agentId}_scheduled.json`);
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function updateScheduledStatus(
  agentId: string, 
  state: 'idle' | 'scanning' | 'sending' | 'error' | 'offline',
  success?: boolean,
  error?: string
): void {
  const current = scheduledStatus.get(agentId) || { agentId, state: 'idle' as const };
  
  current.state = state;
  
  if (state === 'sending' && success) {
    current.lastSend = {
      timestamp: new Date().toISOString(),
      successCount: (current.lastSend?.successCount || 0) + 1,
      failCount: current.lastSend?.failCount || 0,
    };
  }
  
  if (error) {
    current.error = error;
    current.lastSend = {
      ...current.lastSend,
      timestamp: new Date().toISOString(),
      failCount: (current.lastSend?.failCount || 0) + 1,
    };
  } else {
    delete current.error;
  }

  scheduledStatus.set(agentId, current);
}

export default router;
