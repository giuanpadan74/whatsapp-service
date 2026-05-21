import { Router, Request, Response } from 'express';
import { sessionStore } from '../services/sessionStore.js';
import { waClientManager } from '../services/waClient.js';
import { config } from '../config/index.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const agentId = String(body?.agentId ?? '');
    const agentName = String(body?.agentName ?? '');

    if (!agentId || !agentName) {
      return res.status(400).json({ error: 'agentId e agentName sono richiesti' });
    }

    const session = sessionStore.createSession(agentId, agentName);
    
    if (session.status !== 'waiting_qr' || !waClientManager.getClient(session.sessionId)) {
      waClientManager.createClient(session);
    }

    res.json({
      sessionId: session.sessionId,
      agentId: session.agentId,
      status: session.status,
    });
  } catch (error) {
    console.error('[Sessions] Errore creazione sessione:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/:sessionId/qr', async (req: Request, res: Response) => {
  try {
    const sessionId = String((req.params as any).sessionId ?? '');
    const session = sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    if (session.status !== 'pending' && session.status !== 'waiting_qr') {
      return res.status(400).json({ error: 'session_not_waiting_qr' });
    }

    const currentQr = waClientManager.getQRCode(sessionId);
    if (!currentQr) {
      return res.status(404).json({ error: 'qr_not_available' });
    }

    res.json({
      qrCode: currentQr.qrCode,
      expiresAt: currentQr.expiresAt,
    });
  } catch (error) {
    console.error('[Sessions] Errore QR:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = String((req.params as any).agentId ?? '');
    const session = sessionStore.getSessionByAgentId(agentId);

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    res.json({
      sessionId: session.sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      status: session.status,
      phone: session.phone,
      connectedAt: session.connectedAt,
      createdAt: session.createdAt,
    });
  } catch (error) {
    console.error('[Sessions] Errore recupero sessione:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = String((req.params as any).agentId ?? '');
    const session = sessionStore.getSessionByAgentId(agentId);

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    await waClientManager.disconnect(session.sessionId);

    res.json({ message: 'Sessione eliminata con successo' });
  } catch (error) {
    console.error('[Sessions] Errore eliminazione sessione:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = sessionStore.getAllSessions();
    
    res.json({
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        agentId: s.agentId,
        agentName: s.agentName,
        status: s.status,
        phone: s.phone,
      })),
    });
  } catch (error) {
    console.error('[Sessions] Errore list sessioni:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
