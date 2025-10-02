/**
 * LinuxDoConnect OAuth2 Authentication Handler
 * Implements OAuth2 authorization code flow for Linux.do authentication
 */

import { SessionService } from '../services/session';
import { DatabaseService } from '../database';

export interface LinuxDoUserInfo {
  id: number;
  username: string;
  name: string;
  avatar_url?: string;
  email?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface AuthEnv {
  LINUXDO_CLIENT_ID: string;
  LINUXDO_CLIENT_SECRET: string;
  LINUXDO_REDIRECT_URI: string;
  ADMIN_USERNAMES?: string;
}

export class AuthHandler {
  private readonly AUTH_URL = 'https://connect.linux.do/oauth2/authorize';
  private readonly TOKEN_URL = 'https://connect.linux.do/oauth2/token';
  private readonly USER_INFO_URL = 'https://connect.linux.do/api/user';

  constructor(
    private sessionService: SessionService,
    private dbService: DatabaseService,
    private env: AuthEnv
  ) {}

  /**
   * Generate authorization URL for OAuth2 flow
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.LINUXDO_CLIENT_ID,
      redirect_uri: this.env.LINUXDO_REDIRECT_URI,
      response_type: 'code',
      scope: 'user'
    });

    if (state) {
      params.append('state', state);
    }

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback - exchange code for token
   */
  async handleCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      // Check for OAuth errors
      if (error) {
        console.error('[AUTH] OAuth error:', error);
        return this.redirectToLogin(`认证失败: ${error}`);
      }

      if (!code) {
        console.error('[AUTH] Missing authorization code');
        return this.redirectToLogin('缺少授权码');
      }

      console.log('[AUTH] Received authorization code, exchanging for token...');

      // Exchange code for access token
      const tokenData = await this.exchangeCodeForToken(code);
      
      if (!tokenData.access_token) {
        console.error('[AUTH] Failed to get access token');
        return this.redirectToLogin('获取访问令牌失败');
      }

      console.log('[AUTH] Successfully obtained access token');

      // Get user information
      const userInfo = await this.getUserInfo(tokenData.access_token);
      
      if (!userInfo) {
        console.error('[AUTH] Failed to get user info');
        return this.redirectToLogin('获取用户信息失败');
      }

      console.log('[AUTH] User authenticated:', userInfo.username);

      // Create or update user record
      await this.dbService.createOrUpdateUser({
        userId: userInfo.id.toString(),
        username: userInfo.username,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url
      });

      // Create session
      const sessionId = await this.sessionService.createSession({
        userId: userInfo.id.toString(),
        username: userInfo.username,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: 30 * 24 * 60 * 60 // 30 days
      });

      console.log('[AUTH] Session created:', sessionId);

      // Set session cookie and redirect to home
      return this.redirectToHome(sessionId, state);

    } catch (error) {
      console.error('[AUTH] Callback error:', error);
      return this.redirectToLogin('认证过程出错');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: this.env.LINUXDO_CLIENT_ID,
        client_secret: this.env.LINUXDO_CLIENT_SECRET,
        code: code,
        redirect_uri: this.env.LINUXDO_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AUTH] Token exchange failed:', response.status, errorText);
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get user information using access token
   */
  private async getUserInfo(accessToken: string): Promise<LinuxDoUserInfo | null> {
    try {
      const response = await fetch(this.USER_INFO_URL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        console.error('[AUTH] Get user info failed:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[AUTH] Get user info error:', error);
      return null;
    }
  }

  /**
   * Handle logout request
   */
  async handleLogout(request: Request): Promise<Response> {
    try {
      const sessionId = this.getSessionIdFromRequest(request);
      
      if (sessionId) {
        await this.sessionService.deleteSession(sessionId);
        console.log('[AUTH] Session deleted:', sessionId);
      }

      // Clear session cookie and redirect to login
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/?login=required',
          'Set-Cookie': this.clearSessionCookie()
        }
      });
    } catch (error) {
      console.error('[AUTH] Logout error:', error);
      return this.errorResponse('登出失败', 500);
    }
  }

  /**
   * Get current user information
   */
  async handleGetUserInfo(request: Request): Promise<Response> {
    try {
      const sessionId = this.getSessionIdFromRequest(request);

      if (!sessionId) {
        return this.errorResponse('未登录', 401);
      }

      const session = await this.sessionService.getSession(sessionId);

      if (!session) {
        return this.errorResponse('会话已过期', 401);
      }

      // Check if user is banned
      const user = await this.dbService.getUser(session.userId);
      if (user && user.isBanned) {
        console.log('[AUTH] Banned user attempted access:', user.username);
        return this.errorResponse('账号已被封禁', 403);
      }

      // Auto-refresh session to extend expiration
      await this.sessionService.refreshSession(sessionId);

      // Check if user is admin
      const adminUsernames = this.env.ADMIN_USERNAMES?.split(',').map(u => u.trim()).filter(u => u) || [];
      const isAdmin = adminUsernames.includes(session.username);

      return this.successResponse({
        userId: session.userId,
        username: session.username,
        name: session.name,
        avatarUrl: session.avatarUrl,
        isAdmin
      });
    } catch (error) {
      console.error('[AUTH] Get user info error:', error);
      return this.errorResponse('获取用户信息失败', 500);
    }
  }

  /**
   * Verify session validity
   */
  async verifySession(request: Request): Promise<{ valid: boolean; session?: any }> {
    const sessionId = this.getSessionIdFromRequest(request);

    if (!sessionId) {
      return { valid: false };
    }

    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      return { valid: false };
    }

    // Check if user is banned
    const user = await this.dbService.getUser(session.userId);
    if (user && user.isBanned) {
      console.log('[AUTH] Banned user attempted access:', user.username);
      return { valid: false };
    }

    // Auto-refresh session to extend expiration (every access extends the session)
    await this.sessionService.refreshSession(sessionId);

    return { valid: true, session };
  }

  /**
   * Extract session ID from request (cookie or header)
   */
  private getSessionIdFromRequest(request: Request): string | null {
    // Try to get from cookie first
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        if (cookie.startsWith('cdk_session=')) {
          return cookie.substring('cdk_session='.length);
        }
      }
    }

    // Try to get from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring('Bearer '.length);
    }

    return null;
  }

  /**
   * Redirect to login page with error message
   */
  private redirectToLogin(error?: string): Response {
    const url = error ? `/?login=required&error=${encodeURIComponent(error)}` : '/?login=required';
    return new Response(null, {
      status: 302,
      headers: { 'Location': url }
    });
  }

  /**
   * Redirect to home page with session cookie
   */
  private redirectToHome(sessionId: string, state?: string | null): Response {
    const url = state || '/';
    return new Response(null, {
      status: 302,
      headers: {
        'Location': url,
        'Set-Cookie': this.createSessionCookie(sessionId)
      }
    });
  }

  /**
   * Create session cookie
   */
  private createSessionCookie(sessionId: string): string {
    const maxAge = 30 * 24 * 60 * 60; // 30 days
    return `cdk_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }

  /**
   * Clear session cookie
   */
  private clearSessionCookie(): string {
    return 'cdk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  }

  /**
   * Success response helper
   */
  private successResponse(data: any): Response {
    return new Response(JSON.stringify({
      success: true,
      data
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Error response helper
   */
  private errorResponse(message: string, status: number = 400): Response {
    return new Response(JSON.stringify({
      success: false,
      error: message
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

