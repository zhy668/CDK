/**
 * Rate limiting middleware
 */

interface RateLimitConfig {
  windowMs: number;  // 时间窗口（毫秒）
  maxRequests: number;  // 最大请求数
  keyGenerator?: (request: Request) => string;  // 键生成器
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private kv: KVNamespace;

  constructor(kv: KVNamespace, config: RateLimitConfig) {
    this.kv = kv;
    this.config = {
      keyGenerator: (request) => this.getClientIP(request),
      ...config
    };
  }

  async checkLimit(request: Request): Promise<{ allowed: boolean; retryAfter?: number }> {
    const key = this.generateKey(request);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 获取当前记录
    const recordKey = `ratelimit:${key}`;
    const existingRecord = await this.kv.get(recordKey);
    
    let record: RateLimitRecord;
    
    if (existingRecord) {
      record = JSON.parse(existingRecord);
      
      // 如果记录已过期，重置
      if (record.resetTime <= now) {
        record = {
          count: 1,
          resetTime: now + this.config.windowMs
        };
      } else {
        record.count++;
      }
    } else {
      record = {
        count: 1,
        resetTime: now + this.config.windowMs
      };
    }

    // 检查是否超过限制
    if (record.count > this.config.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // 更新记录
    await this.kv.put(recordKey, JSON.stringify(record), {
      expirationTtl: Math.ceil(this.config.windowMs / 1000) + 60 // 额外60秒缓冲
    });

    return { allowed: true };
  }

  private generateKey(request: Request): string {
    return this.config.keyGenerator!(request);
  }

  private getClientIP(request: Request): string {
    return request.headers.get('CF-Connecting-IP') || 
           request.headers.get('X-Forwarded-For') || 
           request.headers.get('X-Real-IP') || 
           '127.0.0.1';
  }
}

// 预定义的限制配置
export const RATE_LIMITS = {
  // 通用API限制：每分钟60次请求
  GENERAL: {
    windowMs: 60 * 1000,
    maxRequests: 60
  },
  
  // 创建项目限制：每小时50次（放宽限制）
  CREATE_PROJECT: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 50
  },
  
  // 密码验证限制：每分钟10次（放宽限制）
  PASSWORD_VERIFY: {
    windowMs: 60 * 1000,
    maxRequests: 10
  },
  
  // 卡密领取限制：每分钟20次（进一步放宽限制）
  CLAIM_CARD: {
    windowMs: 60 * 1000,
    maxRequests: 20
  }
};

// 中间件函数
export function createRateLimitMiddleware(kv: KVNamespace, config: RateLimitConfig) {
  const limiter = new RateLimiter(kv, config);
  
  return async (request: Request): Promise<Response | null> => {
    const result = await limiter.checkLimit(request);
    
    if (!result.allowed) {
      return new Response(JSON.stringify({
        success: false,
        error: '请求过于频繁，请稍后重试',
        retryAfter: result.retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': result.retryAfter?.toString() || '60'
        }
      });
    }
    
    return null; // 允许继续处理
  };
}
