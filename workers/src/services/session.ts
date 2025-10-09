/**
 * Session Management Service
 * Handles user session storage and validation using Cloudflare KV
 */

export interface SessionData {
  userId: string;
  username: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  createdAt: number;
}

export interface CreateSessionParams {
  userId: string;
  username: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export class SessionService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly DEFAULT_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(private kv: KVNamespace) {}

  /**
   * Create a new session
   */
  async createSession(params: CreateSessionParams): Promise<string> {
    const sessionId = this.generateSessionId();
    const sessionData: SessionData = {
      ...params,
      createdAt: Date.now()
    };

    const ttl = params.expiresIn || this.DEFAULT_TTL;
    const key = this.getSessionKey(sessionId);

    await this.kv.put(key, JSON.stringify(sessionData), {
      expirationTtl: ttl
    });

    console.log('[SESSION] Created session:', sessionId, 'TTL:', ttl);
    return sessionId;
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const key = this.getSessionKey(sessionId);
      const data = await this.kv.get(key);

      if (!data) {
        console.log('[SESSION] Session not found:', sessionId);
        return null;
      }

      const sessionData: SessionData = JSON.parse(data);

      // KV TTL handles expiration automatically, no need for manual check
      // Just return the session data if it exists in KV
      return sessionData;
    } catch (error) {
      console.error('[SESSION] Error getting session:', error);
      return null;
    }
  }

  // updateSession method removed - not used in current implementation

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      await this.kv.delete(key);
      console.log('[SESSION] Deleted session:', sessionId);
    } catch (error) {
      console.error('[SESSION] Error deleting session:', error);
    }
  }

  // refreshSession method removed - disabled to reduce KV writes
  // validateSession method removed - not used in current implementation

  /**
   * Get session key for KV storage
   */
  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomPart}${randomPart2}`;
  }

  // cleanupExpiredSessions method removed - KV TTL handles expiration automatically
  // getUserSessions method removed - not used in current implementation
  // deleteUserSessions method removed - not used in current implementation
}

