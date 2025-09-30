/**
 * API 认证中间件
 */

import { SessionService } from '../services/session';

export interface AuthConfig {
    secretKey?: string;
    skipPaths?: string[];
}

export interface SessionAuthConfig {
    sessionService: SessionService;
    skipPaths?: string[];
}

/**
 * API 密钥验证中间件
 */
export function createAuthMiddleware(config: AuthConfig = {}) {
    const { secretKey, skipPaths = ['/api/health'] } = config;
    
    return async (request: Request, env: any, ctx: any, next: () => Promise<Response>) => {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // 跳过不需要验证的路径
        if (skipPaths.some(skipPath => path.startsWith(skipPath))) {
            return next();
        }
        
        // 如果没有配置密钥，跳过验证（开发模式）
        if (!secretKey) {
            console.warn('API 密钥未配置，跳过验证');
            return next();
        }
        
        // 检查请求头中的 API 密钥
        const apiKey = request.headers.get('X-API-Key');
        
        if (!apiKey) {
            return new Response(JSON.stringify({
                error: 'Missing API key',
                message: '缺少 API 密钥'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        if (apiKey !== secretKey) {
            return new Response(JSON.stringify({
                error: 'Invalid API key',
                message: 'API 密钥无效'
            }), {
                status: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        // 验证通过，继续处理请求
        return next();
    };
}

/**
 * CORS 中间件
 */
export function createCorsMiddleware() {
    return async (request: Request, env: any, ctx: any, next: () => Promise<Response>) => {
        // 处理 OPTIONS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }
        
        const response = await next();
        
        // 为所有响应添加 CORS 头
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
        
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    };
}

/**
 * 安全头中间件
 */
export function createSecurityMiddleware() {
    return async (request: Request, env: any, ctx: any, next: () => Promise<Response>) => {
        const response = await next();

        const newHeaders = new Headers(response.headers);

        // 添加安全头
        newHeaders.set('X-Content-Type-Options', 'nosniff');
        newHeaders.set('X-Frame-Options', 'DENY');
        newHeaders.set('X-XSS-Protection', '1; mode=block');
        newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        newHeaders.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    };
}

/**
 * OAuth Session 认证中间件
 * 验证用户是否已登录,未登录则返回 401
 */
export function createSessionAuthMiddleware(config: SessionAuthConfig) {
    const { sessionService, skipPaths = [] } = config;

    return async (request: Request, env: any, ctx: any, next: () => Promise<Response>) => {
        const url = new URL(request.url);
        const path = url.pathname;

        // 跳过不需要验证的路径
        const defaultSkipPaths = [
            '/api/auth/login',
            '/api/auth/callback',
            '/api/health',
            '/api/turnstile/config'
        ];

        const allSkipPaths = [...defaultSkipPaths, ...skipPaths];

        if (allSkipPaths.some(skipPath => path.startsWith(skipPath))) {
            return next();
        }

        // 静态资源不需要验证
        if (!path.startsWith('/api/')) {
            return next();
        }

        // 提取 session ID
        const sessionId = extractSessionId(request);

        if (!sessionId) {
            console.log('[AUTH] No session ID found for path:', path);
            return unauthorizedResponse('未登录,请先登录');
        }

        // 验证 session
        const session = await sessionService.getSession(sessionId);

        if (!session) {
            console.log('[AUTH] Invalid or expired session:', sessionId);
            return unauthorizedResponse('会话已过期,请重新登录');
        }

        console.log('[AUTH] Session validated for user:', session.username);

        // 将用户信息附加到请求上下文(可选)
        // @ts-ignore
        request.user = {
            userId: session.userId,
            username: session.username,
            name: session.name,
            avatarUrl: session.avatarUrl
        };

        return next();
    };
}

/**
 * 从请求中提取 session ID
 */
function extractSessionId(request: Request): string | null {
    // 优先从 Cookie 中获取
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        for (const cookie of cookies) {
            if (cookie.startsWith('cdk_session=')) {
                return cookie.substring('cdk_session='.length);
            }
        }
    }

    // 其次从 Authorization header 获取
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring('Bearer '.length);
    }

    return null;
}

/**
 * 返回未授权响应
 */
function unauthorizedResponse(message: string): Response {
    return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message
    }), {
        status: 401,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
