import { Router, Request, Response } from 'express';
import multer from 'multer';
import { waClientManager } from '../services/waClient.js';
import { sessionStore } from '../services/sessionStore.js';

const router = Router();
const upload = multer({ 
  limits: { fileSize: 16 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

router.post('/text', async (req: Request, res: Response) => {
  try {
    const { agentId, text, backgroundColor, textColor } = req.body;

    if (!agentId || !text) {
      return res.status(400).json({ error: 'agentId e text sono richiesti' });
    }

    const session = sessionStore.getSessionByAgentId(agentId);
    if (!session || session.status !== 'connected') {
      return res.status(400).json({ error: 'session_not_connected' });
    }

    if (!waClientManager.isConnected(agentId)) {
      return res.status(400).json({ error: 'session_not_connected' });
    }

    const messageId = await waClientManager.sendTextStatus(
      agentId,
      text,
      backgroundColor || '#000000',
      textColor || '#FFFFFF'
    );

    res.json({
      messageId,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Status] Errore invio testo:', error);
    const errorMessage = (error as Error).message;
    if (errorMessage === 'session_not_connected') {
      return res.status(400).json({ error: 'session_not_connected' });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/media', upload.single('media'), async (req: Request, res: Response) => {
  try {
    const { agentId, caption } = req.body;
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

    const mimeType = file.mimetype;
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mimeType)) {
      return res.status(400).json({ error: 'unsupported_media_type' });
    }

    const messageId = await waClientManager.sendMediaStatus(
      agentId,
      file.buffer,
      mimeType,
      caption
    );

    res.json({
      messageId,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Status] Errore invio media:', error);
    const errorMessage = (error as Error).message;
    if (errorMessage === 'session_not_connected') {
      return res.status(400).json({ error: 'session_not_connected' });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
