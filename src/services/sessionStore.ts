import fs from 'fs/promises';
import path from 'path';
import { AgentSession, SessionStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

class SessionStore {
  private sessionsPath: string;
  private sessions: Map<string, AgentSession> = new Map();
  private agentToSession: Map<string, string> = new Map();

  constructor() {
    this.sessionsPath = path.join(config.paths.sessions, 'sessions.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(config.paths.sessions, { recursive: true });
    await fs.mkdir(config.paths.auth, { recursive: true });
    await fs.mkdir(config.paths.logs, { recursive: true });
    await this.loadSessions();
  }

  private async loadSessions(): Promise<void> {
    try {
      const data = await fs.readFile(this.sessionsPath, 'utf-8');
      const sessionsArray: AgentSession[] = JSON.parse(data);
      
      for (const session of sessionsArray) {
        this.sessions.set(session.sessionId, session);
        this.agentToSession.set(session.agentId, session.sessionId);
      }
      
      console.log(`[SessionStore] Caricate ${this.sessions.size} sessioni`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[SessionStore] Errore caricamento sessioni:', error);
      }
    }
  }

  private async saveSessions(): Promise<void> {
    const sessionsArray = Array.from(this.sessions.values());
    await fs.writeFile(this.sessionsPath, JSON.stringify(sessionsArray, null, 2));
  }

  createSession(agentId: string, agentName: string): AgentSession {
    const existingSessionId = this.agentToSession.get(agentId);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (existing) {
        existing.status = 'waiting_qr';
        existing.lastActivity = new Date().toISOString();
        this.sessions.set(existingSessionId, existing);
        this.saveSessions();
        return existing;
      }
    }

    const session: AgentSession = {
      sessionId: `sess_${uuidv4().slice(0, 8)}`,
      agentId,
      agentName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(session.sessionId, session);
    this.agentToSession.set(agentId, session.sessionId);
    this.saveSessions();

    return session;
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByAgentId(agentId: string): AgentSession | undefined {
    const sessionId = this.agentToSession.get(agentId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  updateSession(sessionId: string, updates: Partial<AgentSession>): AgentSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const updated = { ...session, ...updates, lastActivity: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    this.saveSessions();
    return updated;
  }

  updateSessionStatus(sessionId: string, status: SessionStatus): AgentSession | undefined {
    const updates: Partial<AgentSession> = { status };
    
    if (status === 'connected') {
      updates.connectedAt = new Date().toISOString();
    }
    
    return this.updateSession(sessionId, updates);
  }

  setSessionCredentials(sessionId: string, credentials: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.credentials = credentials;
      this.saveSessionAuth(sessionId, credentials);
    }
  }

  private async saveSessionAuth(sessionId: string, credentials: string): Promise<void> {
    const authPath = path.join(config.paths.auth, `${sessionId}.json`);
    await fs.writeFile(authPath, credentials);
  }

  async loadSessionAuth(sessionId: string): Promise<string | null> {
    const authPath = path.join(config.paths.auth, `${sessionId}.json`);
    try {
      return await fs.readFile(authPath, 'utf-8');
    } catch {
      return null;
    }
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.agentToSession.delete(session.agentId);
    this.sessions.delete(sessionId);
    
    const authPath = path.join(config.paths.auth, `${sessionId}.json`);
    fs.unlink(authPath).catch(() => {});

    this.saveSessions();
    return true;
  }

  deleteSessionByAgentId(agentId: string): boolean {
    const sessionId = this.agentToSession.get(agentId);
    if (sessionId) {
      return this.deleteSession(sessionId);
    }
    return false;
  }
}

export const sessionStore = new SessionStore();
