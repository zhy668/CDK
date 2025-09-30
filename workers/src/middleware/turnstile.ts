import { TurnstileVerifyResponse } from '../../shared/types';

/**
 * Turnstile 验证中间件
 */
export function createTurnstileMiddleware(env: any) {
  return async (request: Request): Promise<{ response?: Response; data?: any }> => {
    // 检查是否启用 Turnstile
    const turnstileEnabled = env.TURNSTILE_ENABLED === 'true';
    
    if (!turnstileEnabled) {
      // Turnstile 未启用，直接通过
      return {};
    }

    // 检查必要的环境变量
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('[TURNSTILE] 缺少 TURNSTILE_SECRET_KEY 环境变量');
      return {
        response: new Response(JSON.stringify({
          success: false,
          error: 'Turnstile 配置错误'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    let body: any;
    try {
      const clonedRequest = request.clone();
      const contentType = request.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        body = await clonedRequest.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await clonedRequest.formData();
        body = Object.fromEntries(formData.entries());
      } else {
        // 不支持的内容类型，跳过验证
        return {};
      }
    } catch (error) {
      console.error('[TURNSTILE] 解析请求体失败:', error);
      return {
        response: new Response(JSON.stringify({
          success: false,
          error: '请求格式错误'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    // 获取 Turnstile token
    const turnstileToken = body['cf-turnstile-response'] || body.turnstileToken;
    
    if (!turnstileToken) {
      return {
        response: new Response(JSON.stringify({
          success: false,
          error: '缺少 Turnstile 验证'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    // 验证 Turnstile token
    const isValid = await verifyTurnstileToken(
      turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get('CF-Connecting-IP') || ''
    );

    if (!isValid) {
      return {
        response: new Response(JSON.stringify({
          success: false,
          error: 'Turnstile 验证失败'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    // 验证通过，返回解析后的数据
    return { data: body };
  };
}

/**
 * 验证 Turnstile token
 */
async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteip: string
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    const result: TurnstileVerifyResponse = await response.json();

    console.log('[TURNSTILE] 验证结果:', {
      success: result.success,
      hostname: result.hostname,
      challenge_ts: result.challenge_ts,
      error_codes: result['error-codes']
    });

    return result.success;
  } catch (error) {
    console.error('[TURNSTILE] 验证请求失败:', error);
    return false;
  }
}

/**
 * 获取 Turnstile 配置信息
 */
export function getTurnstileConfig(env: any) {
  console.log('[TURNSTILE] 环境变量检查:', {
    TURNSTILE_ENABLED: env.TURNSTILE_ENABLED,
    TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY ? '已设置' : '未设置',
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ? '已设置' : '未设置'
  });

  const config = {
    enabled: env.TURNSTILE_ENABLED === 'true' || env.TURNSTILE_ENABLED === true,
    siteKey: env.TURNSTILE_SITE_KEY || '',
    hasSecretKey: !!env.TURNSTILE_SECRET_KEY
  };

  console.log('[TURNSTILE] 配置结果:', config);
  return config;
}
