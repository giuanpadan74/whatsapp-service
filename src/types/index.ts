export type SessionStatus = 
  | 'pending'
  | 'waiting_qr'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export interface AgentSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  phone?: string;
  status: SessionStatus;
  credentials?: string;
  createdAt: string;
  connectedAt?: string;
  lastActivity?: string;
}

export interface CreateSessionRequest {
  agentId: string;
  agentName: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  agentId: string;
  status: SessionStatus;
  qrCode?: string;
}

export interface QrCodeResponse {
  qrCode: string;
  expiresAt: string;
}

export interface SendStatusResponse {
  messageId: string;
  status: 'sent' | 'failed';
  timestamp: string;
  error?: string;
}

export interface ScheduledConfig {
  agentId: string;
  enabled: boolean;
  time: string;
  timezone: string;
  watchFolder: string;
  captionTemplate: string;
  autoDelete: boolean;
}

export interface ScheduledStatus {
  agentId: string;
  state: 'idle' | 'scanning' | 'sending' | 'error' | 'offline';
  lastSend?: {
    timestamp: string;
    successCount: number;
    failCount: number;
  };
  nextScheduled?: string;
  error?: string;
}

export interface ScheduledSendRequest {
  agentId: string;
  imagePath: string;
  caption?: string;
  timestamp: string;
}
