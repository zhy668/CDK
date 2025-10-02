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

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    try {
      const existingSession = await this.getSession(sessionId);

      if (!existingSession) {
        console.log('[SESSION] Cannot update non-existent session:', sessionId);
        return false;
      }

      const updatedSession: SessionData = {
        ...existingSession,
        ...updates
      };

      const key = this.getSessionKey(sessionId);
      const ttl = updatedSession.expiresIn || this.DEFAULT_TTL;

      await this.kv.put(key, JSON.stringify(updatedSession), {
        expirationTtl: ttl
      });

      console.log('[SESSION] Updated session:', sessionId);
      return true;
    } catch (error) {
      console.error('[SESSION] Error updating session:', error);
      return false;
    }
  }

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

  /**
   * Refresh session expiration time
   */
  async refreshSession(sessionId: string, expiresIn?: number): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        console.log('[SESSION] Cannot refresh non-existent session:', sessionId);
        return false;
      }

      const newExpiresIn = expiresIn || this.DEFAULT_TTL;
      const key = this.getSessionKey(sessionId);

      const updatedSession = {
        ...session,
        expiresIn: newExpiresIn,
        createdAt: Date.now() // Reset creation time
      };

      await this.kv.put(key, JSON.stringify(updatedSession), {
        expirationTtl: newExpiresIn
      });

      console.log('[SESSION] Refreshed session:', sessionId, 'New TTL:', newExpiresIn, 'seconds (', Math.round(newExpiresIn / 86400), 'days)');
      return true;
    } catch (error) {
      console.error('[SESSION] Error refreshing session:', sessionId, error);
      return false;
    }
  }

  /**
   * Validate session and return user info
   */
  async validateSession(sessionId: string): Promise<{ valid: boolean; user?: any }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { valid: false };
    }

    return {
      valid: true,
      user: {
        userId: session.userId,
        username: session.username,
        name: session.name,
        avatarUrl: session.avatarUrl
      }
    };
  }

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

  /**
   * Clean up expired sessions (optional maintenance task)
   * Note: KV automatically deletes expired keys, so this is optional
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      let cleaned = 0;
      const list = await this.kv.list({ prefix: this.SESSION_PREFIX });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name);
        if (!data) {
          cleaned++;
          continue;
        }

        try {
          const session: SessionData = JSON.parse(data);
          const now = Date.now();
          const expiresAt = session.createdAt + (session.expiresIn * 1000);

          if (now > expiresAt) {
            await this.kv.delete(key.name);
            cleaned++;
          }
        } catch (error) {
          // Invalid session data, delete it
          await this.kv.delete(key.name);
          cleaned++;
        }
      }

      console.log('[SESSION] Cleaned up expired sessions:', cleaned);
      return cleaned;
    } catch (error) {
      console.error('[SESSION] Error cleaning up sessions:', error);
      return 0;
    }
  }

  /**
   * Get all active sessions for a user (by userId)
   */
  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const sessions: string[] = [];
      const list = await this.kv.list({ prefix: this.SESSION_PREFIX });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name);
        if (!data) continue;

        try {
          const session: SessionData = JSON.parse(data);
          if (session.userId === userId) {
            const sessionId = key.name.replace(this.SESSION_PREFIX, '');
            sessions.push(sessionId);
          }
        } catch (error) {
          // Skip invalid session data
          continue;
        }
      }

      return sessions;
    } catch (error) {
      console.error('[SESSION] Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId);
      
      for (const sessionId of sessions) {
        await this.deleteSession(sessionId);
      }

      console.log('[SESSION] Deleted all sessions for user:', userId, 'Count:', sessions.length);
      return sessions.length;
    } catch (error) {
      console.error('[SESSION] Error deleting user sessions:', error);
      return 0;
    }
  }
}

