import {
  Browsers,
  DisconnectReason,
  WASocket,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { AgentSession } from '../types/index.js';
import { sessionStore } from './sessionStore.js';
import { config } from '../config/index.js';
import path from 'path';

type QrState = { qrCode: string; expiresAt: string } | null;

class WAClientManager {
  private clients: Map<string, WASocket> = new Map();
  private qrBySessionId: Map<string, QrState> = new Map();

  async createClient(session: AgentSession): Promise<WASocket> {
    const existingClient = this.clients.get(session.sessionId);
    if (existingClient) {
      return existingClient;
    }

    const authDir = path.join(config.paths.auth, session.sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.ubuntu('GAR'),
      defaultQueryTimeoutMs: 60000,
    });

    this.clients.set(session.sessionId, sock);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          const expiresAt = new Date(Date.now() + config.qrCodeExpirationMs).toISOString();
          
          sessionStore.updateSessionStatus(session.sessionId, 'waiting_qr');
          this.qrBySessionId.set(session.sessionId, { qrCode: qrDataUrl, expiresAt });
        } catch (err) {
          console.error('[WAClient] Errore generazione QR:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        
        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[WAClient] Sessione ${session.sessionId} disconnessa`);
          sessionStore.updateSessionStatus(session.sessionId, 'disconnected');
          this.removeClient(session.sessionId);
        } else {
          console.log(`[WAClient] Riconnessione per ${session.sessionId}...`);
          sessionStore.updateSessionStatus(session.sessionId, 'connecting');
          setTimeout(() => this.reconnect(session), 5000);
        }
      }

      if (connection === 'open') {
        console.log(`[WAClient] Sessione ${session.sessionId} connessa!`);
        const phone = sock.user?.id?.replace(':c.us', '') || '';
        sessionStore.updateSession(session.sessionId, { 
          status: 'connected', 
          phone,
          connectedAt: new Date().toISOString() 
        });
        this.qrBySessionId.set(session.sessionId, null);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
  }

  async reconnect(session: AgentSession): Promise<void> {
    await this.createClient(session);
  }

  getClient(sessionId: string): WASocket | undefined {
    return this.clients.get(sessionId);
  }

  getClientByAgentId(agentId: string): WASocket | undefined {
    const session = sessionStore.getSessionByAgentId(agentId);
    if (!session) return undefined;
    return this.clients.get(session.sessionId);
  }

  removeClient(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      client.end(new Error('closed'));
      this.clients.delete(sessionId);
    }
    this.qrBySessionId.delete(sessionId);
  }

  getQRCode(sessionId: string): QrState {
    return this.qrBySessionId.get(sessionId) ?? null;
  }

  async sendTextStatus(
    agentId: string,
    text: string,
    _backgroundColor: string,
    _textColor: string
  ): Promise<string> {
    const client = this.getClientByAgentId(agentId);
    if (!client || !client.user) {
      throw new Error('session_not_connected');
    }
    const result = await client.sendMessage('status@broadcast', { text });
    return result?.key?.id || `status_${Date.now()}`;
  }

  async sendMediaStatus(
    agentId: string,
    mediaBuffer: Buffer,
    mimeType: string,
    caption?: string
  ): Promise<string> {
    const client = this.getClientByAgentId(agentId);
    if (!client || !client.user) {
      throw new Error('session_not_connected');
    }

    const payload =
      mimeType === 'video/mp4'
        ? ({ video: mediaBuffer, mimetype: mimeType, caption } as const)
        : ({ image: mediaBuffer, mimetype: mimeType, caption } as const);

    const result = await client.sendMessage('status@broadcast', payload);
    return result?.key?.id || `status_${Date.now()}`;
  }

  isConnected(agentId: string): boolean {
    const session = sessionStore.getSessionByAgentId(agentId);
    return session?.status === 'connected';
  }

  async disconnect(sessionId: string): Promise<void> {
    this.removeClient(sessionId);
    sessionStore.deleteSession(sessionId);
  }
}

export const waClientManager = new WAClientManager();
