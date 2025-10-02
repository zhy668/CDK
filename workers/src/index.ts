/**
 * CDK API - Cloudflare Workers backend for card distribution system
 */

import { DatabaseService } from './database';
import { ProjectHandler } from './handlers/projects';
import { ClaimHandler } from './handlers/claim';
import { AuthHandler } from './handlers/auth';
import { AdminHandler } from './handlers/admin';
import { SessionService } from './services/session';
import { createRateLimitMiddleware, RATE_LIMITS } from './middleware/rateLimit';
import { createValidationMiddleware, VALIDATION_SCHEMAS } from './middleware/validation';
import { createAuthMiddleware, createCorsMiddleware, createSecurityMiddleware, createSessionAuthMiddleware } from './middleware/auth';
import { createTurnstileMiddleware, getTurnstileConfig } from './middleware/turnstile';
import { getStaticAsset } from './static-assets';

export interface Env {
  CDK_DB: D1Database; // D1 数据库绑�?
  CDK_KV: KVNamespace; // KV 用于 session 存储
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  API_SECRET_KEY: string;
  // LinuxDoConnect OAuth Configuration
  LINUXDO_CLIENT_ID: string;
  LINUXDO_CLIENT_SECRET: string;
  LINUXDO_REDIRECT_URI: string;
  // Admin Configuration
  ADMIN_USERNAMES: string; // Comma-separated list of admin usernames
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 创建中间�?
    const corsMiddleware = createCorsMiddleware();
    const securityMiddleware = createSecurityMiddleware();

    // 中间件链（暂时禁用API密钥验证，简化小项目部署�?
    const middlewares = [corsMiddleware, securityMiddleware];

    // 如果需要启用API密钥验证，取消注释以下代码：
    // const authMiddleware = createAuthMiddleware({
    //   secretKey: env.API_SECRET_KEY,
    //   skipPaths: ['/api/health', '/api/verify', '/api/claim']
    // });
    // middlewares.push(authMiddleware);

    // 执行中间件链
    let middlewareIndex = 0;
    const next = async (): Promise<Response> => {
      if (middlewareIndex < middlewares.length) {
        const middleware = middlewares[middlewareIndex++];
        return middleware(request, env, ctx, next);
      }
      return handleRequest(request, env, ctx);
    };

    return next();
  }
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // 详细日志记录
      console.log(`[${new Date().toISOString()}] ${method} ${path}`, {
        userAgent: request.headers.get('User-Agent'),
        referer: request.headers.get('Referer'),
        ip: request.headers.get('CF-Connecting-IP'),
        country: request.headers.get('CF-IPCountry')
      });

      // 处理静态文件请求（非API路径�?
      if (!path.startsWith('/api')) {
        console.log(`[STATIC] 请求静态文�? ${path}`);
        const asset = getStaticAsset(path);
        if (asset) {
          console.log(`[STATIC] 找到静态文�? ${path}, MIME: ${asset.mimeType}`);
          return new Response(asset.content, {
            headers: {
              'Content-Type': asset.mimeType,
              'Cache-Control': 'public, max-age=3600' // 缓存1小时
            }
          });
        }

        // 如果找不到静态文件，返回首页（SPA路由支持�?
        console.log(`[STATIC] 静态文件未找到，返回首�? ${path}`);
        const indexAsset = getStaticAsset('/');
        if (indexAsset) {
          return new Response(indexAsset.content, {
            headers: {
              'Content-Type': indexAsset.mimeType,
              'Cache-Control': 'public, max-age=300' // 缓存5分钟
            }
          });
        }
      }

      // Initialize services for API requests
      console.log(`[API] 初始化服务，处理API请求: ${path}`);

      // 检查 D1 和 KV 绑定
      if (!env.CDK_DB) {
        console.error('[API] D1 数据库未绑定！');
        return new Response(JSON.stringify({
          success: false,
          error: 'D1 database not configured',
          message: '请在 Cloudflare Dashboard 中绑定 CDK_DB 数据库'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!env.CDK_KV) {
        console.error('[API] KV 存储未绑定！');
        return new Response(JSON.stringify({
          success: false,
          error: 'KV storage not configured',
          message: '请在 Cloudflare Dashboard 中绑定 CDK_KV 命名空间'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const dbService = new DatabaseService(env.CDK_DB);
      const sessionService = new SessionService(env.CDK_KV);
      const projectHandler = new ProjectHandler(dbService);
      const claimHandler = new ClaimHandler(dbService, env);
      const adminHandler = new AdminHandler(dbService);
      const authHandler = new AuthHandler(sessionService, dbService, {
        LINUXDO_CLIENT_ID: env.LINUXDO_CLIENT_ID,
        LINUXDO_CLIENT_SECRET: env.LINUXDO_CLIENT_SECRET,
        LINUXDO_REDIRECT_URI: env.LINUXDO_REDIRECT_URI,
        ADMIN_USERNAMES: env.ADMIN_USERNAMES
      });

      // Helper function to check if user is admin
      const isAdmin = (username: string): boolean => {
        const adminUsernames = env.ADMIN_USERNAMES?.split(',').map(u => u.trim()) || [];
        return adminUsernames.includes(username);
      };

      // Health check
      if (path === '/api/health') {
        console.log(`[API] 健康检查请求`);
        return new Response(JSON.stringify({
          message: 'CDK API is running',
          version: '1.0.0',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
          auth: {
            enabled: !!env.LINUXDO_CLIENT_ID,
            redirectUri: env.LINUXDO_REDIRECT_URI
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ==================== OAuth Authentication Routes ====================

      // Get login URL
      if (path === '/api/auth/login' && method === 'GET') {
        console.log('[AUTH] Login request');
        const url = new URL(request.url);
        const returnTo = url.searchParams.get('return_to') || '/';
        const authUrl = authHandler.getAuthorizationUrl(returnTo);

        return new Response(JSON.stringify({
          success: true,
          data: {
            authUrl
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // OAuth callback
      if (path === '/api/auth/callback' && method === 'GET') {
        console.log('[AUTH] OAuth callback');
        return await authHandler.handleCallback(request);
      }

      // Get current user info
      if (path === '/api/auth/userinfo' && method === 'GET') {
        console.log('[AUTH] Get user info');
        return await authHandler.handleGetUserInfo(request);
      }

      // Logout
      if (path === '/api/auth/logout' && method === 'POST') {
        console.log('[AUTH] Logout request');
        return await authHandler.handleLogout(request);
      }

      // ==================== End OAuth Routes ====================

      // Turnstile 配置端点
      if (path === '/api/turnstile/config' && method === 'GET') {
        console.log(`[API] Turnstile 配置请求`);
        const config = getTurnstileConfig(env);
        return new Response(JSON.stringify({
          success: true,
          data: {
            enabled: config.enabled,
            siteKey: config.siteKey
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 应用中间件的辅助函数
      const applyMiddleware = async (middlewares: Array<(req: Request) => Promise<Response | null>>, request: Request) => {
        for (const middleware of middlewares) {
          const result = await middleware(request);
          if (result) {
            return result;
          }
        }
        return null;
      };

      // ==================== Session Authentication Check ====================
      // 需要认证的路径列表
      const protectedPaths = [
        '/api/projects',
        '/api/verify-admin',
        '/api/verify',
        '/api/claim',
        '/api/admin'
      ];

      // 检查是否需要认�?
      const needsAuth = protectedPaths.some(p => path.startsWith(p));
      let currentSession: any = null;

      if (needsAuth) {
        const { valid, session } = await authHandler.verifySession(request);

        if (!valid) {
          console.log('[AUTH] Unauthorized access attempt to:', path);
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized',
            message: '请先登录',
            requireLogin: true
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        currentSession = session;
        console.log('[AUTH] Authenticated user:', session?.username, 'accessing:', path);
      }
      // ==================== End Session Authentication ====================

      // Project management routes
      if (path === '/api/projects') {
        if (method === 'GET') {
          // 应用通用限制
          const middlewareResult = await applyMiddleware([
            createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
          ], request);
          if (middlewareResult) return middlewareResult;

          return await projectHandler.getProjects(request);
        } else if (method === 'POST') {
          // 创建项目：只需要数据验证，不需�?Turnstile 验证
          const validationMiddleware = createValidationMiddleware(VALIDATION_SCHEMAS.CREATE_PROJECT);
          const validationResult = await validationMiddleware(request);
          if (validationResult.response) return validationResult.response;

          return await projectHandler.createProject(request, validationResult.data);
        }
      }

      // Individual project routes
      const projectMatch = path.match(/^\/api\/projects\/([^\/]+)$/);
      if (projectMatch) {
        const projectId = projectMatch[1];
        if (method === 'GET') {
          const middlewareResult = await applyMiddleware([
            createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
          ], request);
          if (middlewareResult) return middlewareResult;

          return await projectHandler.getProject(request, projectId);
        } else if (method === 'PUT') {
          // 应用限制
          const rateLimitResult = await applyMiddleware([
            createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
          ], request);
          if (rateLimitResult) return rateLimitResult;

          // 应用验证中间�?
          const validationMiddleware = createValidationMiddleware(VALIDATION_SCHEMAS.UPDATE_PROJECT);
          const validationResult = await validationMiddleware(request);
          if (validationResult.response) return validationResult.response;

          return await projectHandler.updateProject(request, projectId, validationResult.data);
        } else if (method === 'DELETE') {
          // 应用限制
          const rateLimitResult = await applyMiddleware([
            createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
          ], request);
          if (rateLimitResult) return rateLimitResult;

          // 删除项目需要验证管理密码，所以需要读取请求体
          return await projectHandler.deleteProject(request, projectId);
        }
      }

      // Project cards routes
      const cardsMatch = path.match(/^\/api\/projects\/([^\/]+)\/cards$/);
      if (cardsMatch && method === 'POST') {
        const projectId = cardsMatch[1];
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        // 应用验证中间�?
        const validationMiddleware = createValidationMiddleware(VALIDATION_SCHEMAS.ADD_CARDS);
        const validationResult = await validationMiddleware(request);
        if (validationResult.response) return validationResult.response;

        return await projectHandler.addCards(request, projectId, validationResult.data);
      }

      // Delete card route
      const deleteCardMatch = path.match(/^\/api\/projects\/([^\/]+)\/cards\/([^\/]+)$/);
      if (deleteCardMatch && method === 'DELETE') {
        const projectId = deleteCardMatch[1];
        const cardId = deleteCardMatch[2];
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        // 从请求体中读取管理密�?
        const data = await request.json() as any;
        return await projectHandler.deleteCard(request, projectId, { ...data, cardId });
      }

      // Toggle project status route
      const toggleStatusMatch = path.match(/^\/api\/projects\/([^\/]+)\/toggle-status$/);
      if (toggleStatusMatch && method === 'POST') {
        const projectId = toggleStatusMatch[1];
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        return await projectHandler.toggleProjectStatus(request, projectId);
      }

      // Project stats routes
      const statsMatch = path.match(/^\/api\/projects\/([^\/]+)\/stats$/);
      if (statsMatch && method === 'POST') {
        const projectId = statsMatch[1];
        const middlewareResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
        ], request);
        if (middlewareResult) return middlewareResult;

        return await projectHandler.getProjectStats(request, projectId);
      }

      // Admin password verification route
      if (path === '/api/verify-admin' && method === 'POST') {
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.PASSWORD_VERIFY)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        return await projectHandler.verifyAdminPassword(request);
      }

      // Claim routes
      if (path === '/api/verify' && method === 'POST') {
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.PASSWORD_VERIFY)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        // 应用验证中间�?
        const validationMiddleware = createValidationMiddleware(VALIDATION_SCHEMAS.VERIFY_PASSWORD);
        const validationResult = await validationMiddleware(request);
        if (validationResult.response) return validationResult.response;

        return await claimHandler.verifyPassword(request, validationResult.data);
      }

      if (path === '/api/claim' && method === 'POST') {
        // 应用限制
        const rateLimitResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.CLAIM_CARD)
        ], request);
        if (rateLimitResult) return rateLimitResult;

        // 应用验证中间�?
        const validationMiddleware = createValidationMiddleware(VALIDATION_SCHEMAS.CLAIM_CARD);
        const validationResult = await validationMiddleware(request);
        if (validationResult.response) return validationResult.response;

        return await claimHandler.claimCard(request, validationResult.data, currentSession);
      }

      // Claim status routes
      const claimStatusMatch = path.match(/^\/api\/claim\/([^\/]+)$/);
      if (claimStatusMatch && method === 'GET') {
        const projectId = claimStatusMatch[1];
        const middlewareResult = await applyMiddleware([
          createRateLimitMiddleware(env.CDK_KV, RATE_LIMITS.GENERAL)
        ], request);
        if (middlewareResult) return middlewareResult;

        return await claimHandler.getClaimStatus(request, projectId);
      }

      // Admin routes
      if (path.startsWith('/api/admin/')) {
        // Check if user is authenticated and is admin
        if (!currentSession || !isAdmin(currentSession.username)) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Forbidden',
            message: '需要管理员权限'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Get users list
        if (path === '/api/admin/users' && method === 'GET') {
          return await adminHandler.getUsers(request);
        }

        // Get user statistics
        if (path === '/api/admin/users/stats' && method === 'GET') {
          return await adminHandler.getUserStats(request);
        }

        // Ban user
        if (path === '/api/admin/users/ban' && method === 'POST') {
          const data = await request.json() as any;
          return await adminHandler.banUser(request, data, currentSession.username);
        }

        // Unban user
        if (path === '/api/admin/users/unban' && method === 'POST') {
          const data = await request.json() as any;
          return await adminHandler.unbanUser(request, data);
        }
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({
        success: false,
        error: 'API endpoint not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Request details:', {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries())
      });

      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: env.ENVIRONMENT === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
}
