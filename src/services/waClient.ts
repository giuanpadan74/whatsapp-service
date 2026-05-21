import { createWASocket, AnyWASocket, DisconnectReason, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { AgentSession } from '../types/index.js';
import { sessionStore } from './sessionStore.js';
import { config } from '../config/index.js';
import fs from 'fs/promises';
import path from 'path';

class WAClientManager {
  private clients: Map<string, AnyWASocket> = new Map();
  private qrCallbacks: Map<string, (qr: string, expiresAt: string) => void> = new Map();

  async createClient(session: AgentSession): Promise<AnyWASocket> {
    const existingClient = this.clients.get(session.sessionId);
    if (existingClient) {
      return existingClient;
    }

    const authPath = path.join(config.paths.auth, `${session.sessionId}.json`);
    
    let authState: any = {};
    try {
      const authData = await fs.readFile(authPath, 'utf-8');
      authState = JSON.parse(authData);
    } catch {}

    const sock = createWASocket({
      auth: authState,
      printQRInTerminal: true,
      defaultQueryTimeoutMs: 60000,
    });

    this.clients.set(session.sessionId, sock);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          const expiresAt = new Date(Date.now() + config.qrCodeExpirationMs).toISOString();
          
          sessionStore.updateSessionStatus(session.sessionId, 'waiting_qr');
          
          const callback = this.qrCallbacks.get(session.sessionId);
          if (callback) {
            callback(qrDataUrl, expiresAt);
          }
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
        } else if (statusCode !== DisconnectReason.closeTab) {
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
      }
    });

    sock.ev.on('creds.update', async (creds) => {
      try {
        await fs.mkdir(config.paths.auth, { recursive: true });
        await fs.writeFile(authPath, JSON.stringify(creds));
      } catch (err) {
        console.error('[WAClient] Errore salvataggio credenziali:', err);
      }
    });

    return sock;
  }

  async reconnect(session: AgentSession): Promise<void> {
    await this.createClient(session);
  }

  getClient(sessionId: string): AnyWASocket | undefined {
    return this.clients.get(sessionId);
  }

  getClientByAgentId(agentId: string): AnyWASocket | undefined {
    const session = sessionStore.getSessionByAgentId(agentId);
    if (!session) return undefined;
    return this.clients.get(session.sessionId);
  }

  removeClient(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      client.end();
      this.clients.delete(sessionId);
    }
    this.qrCallbacks.delete(sessionId);
  }

  onQRCode(sessionId: string, callback: (qr: string, expiresAt: string) => void): void {
    this.qrCallbacks.set(sessionId, callback);
  }

  async sendTextStatus(
    agentId: string,
    text: string,
    backgroundColor: string,
    textColor: string
  ): Promise<string> {
    const client = this.getClientByAgentId(agentId);
    if (!client || !client.user) {
      throw new Error('session_not_connected');
    }

    const message = proto.Message.createMessage({
      imageMessage: {
        url: '',
        mimetype: 'image/png',
        fileLength: '0',
        caption: text,
        contextInfo: {
          isForwarded: true,
          forwardingScore: 0,
          isForwardedFromMe: false,
        },
      },
    });

    const id = `status_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    await client.relayMessage('status@broadcast', message, {
      messageId: id,
    });

    return id;
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

    const id = `status_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const uploadResult = await client.uploadMedia(mediaBuffer, {
      isRemoteUrl: false,
    });

    const message = proto.Message.createMessage({
      imageMessage: {
        url: uploadResult.url,
        mimetype: mimeType,
        fileLength: mediaBuffer.length.toString(),
        caption: caption,
      },
    });

    await client.relayMessage('status@broadcast', message, {
      messageId: id,
    });

    return id;
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
