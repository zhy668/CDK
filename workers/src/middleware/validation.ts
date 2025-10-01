/**
 * Input validation middleware
 */

// 输入验证规则
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  valid: boolean;
  errors: { [key: string]: string };
}

// 验证器类
export class Validator {
  static validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: { [key: string]: string } = {};
    
    for (const [field, rule] of Object.entries(schema)) {
      const value = data[field];
      const error = this.validateField(value, rule, field);
      
      if (error) {
        errors[field] = error;
      }
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }
  
  private static validateField(value: any, rule: ValidationRule, fieldName: string): string | null {
    // 必填验证
    if (rule.required && (value === undefined || value === null || value === '')) {
      return `${fieldName} 是必填字段`;
    }
    
    // 如果值为空且不是必填，跳过其他验证
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return null;
    }
    
    // 字符串长度验证
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        return `${fieldName} 长度不能少于 ${rule.minLength} 个字符`;
      }
      
      if (rule.maxLength && value.length > rule.maxLength) {
        return `${fieldName} 长度不能超过 ${rule.maxLength} 个字符`;
      }
    }
    
    // 正则表达式验证
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      return `${fieldName} 格式不正确`;
    }
    
    // 自定义验证
    if (rule.custom) {
      const result = rule.custom(value);
      if (typeof result === 'string') {
        return result;
      }
      if (result === false) {
        return `${fieldName} 验证失败`;
      }
    }
    
    return null;
  }
}

// 预定义的验证模式
export const VALIDATION_SCHEMAS = {
  CREATE_PROJECT: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 50,
      custom: (value: string) => {
        // 检查是否包含特殊字符
        if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_]+$/.test(value)) {
          return '项目名称只能包含中文、英文、数字、空格、横线和下划线';
        }
        return true;
      }
    },
    password: {
      required: true,
      minLength: 6,
      maxLength: 20,
      custom: (value: string) => {
        // 检查密码强度
        if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/.test(value)) {
          return '密码只能包含字母、数字和常见特殊字符';
        }
        return true;
      }
    },
    description: {
      required: false,
      maxLength: 200
    },
    cards: {
      required: true,
      custom: (value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) {
          return '至少需要提供一个卡密';
        }
        if (value.length > 10000) {
          return '卡密数量不能超过10000个';
        }
        return true;
      }
    }
  },
  
  UPDATE_PROJECT: {
    name: {
      required: false,
      minLength: 1,
      maxLength: 50
    },
    password: {
      required: false,
      minLength: 6,
      maxLength: 20
    },
    description: {
      required: false,
      maxLength: 200
    },
    isActive: {
      required: false,
      custom: (value: any) => {
        if (value !== undefined && typeof value !== 'boolean') {
          return 'isActive 必须是布尔值';
        }
        return true;
      }
    }
  },
  
  VERIFY_PASSWORD: {
    projectId: {
      required: true,
      custom: (value: string) => {
        if (typeof value !== 'string' || value.length === 0) {
          return '项目ID不能为空';
        }
        return true;
      }
    },
    password: {
      required: true,
      minLength: 1
    }
  },
  
  CLAIM_CARD: {
    projectId: {
      required: true,
      custom: (value: string) => {
        if (typeof value !== 'string' || value.length === 0) {
          return '项目ID不能为空';
        }
        return true;
      }
    },
    password: {
      required: true,
      minLength: 1
    }
  },
  
  ADD_CARDS: {
    adminPassword: {
      required: true,
      minLength: 1
    },
    cards: {
      required: true,
      custom: (value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) {
          return '至少需要提供一个卡密';
        }
        if (value.length > 1000) {
          return '单次添加的卡密数量不能超过1000个';
        }
        return true;
      }
    },
    format: {
      required: false,
      custom: (value: string) => {
        if (value && !['text', 'csv', 'json'].includes(value)) {
          return '格式只能是 text、csv 或 json';
        }
        return true;
      }
    },
    removeDuplicates: {
      required: false,
      custom: (value: any) => {
        if (value !== undefined && typeof value !== 'boolean') {
          return 'removeDuplicates 必须是布尔值';
        }
        return true;
      }
    }
  }
};

// XSS 防护
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

// 验证中间件 - 修改为将解析的数据附加到请求对象
export function createValidationMiddleware(schema: ValidationSchema) {
  return async (request: Request): Promise<{ response?: Response; data?: any }> => {
    try {
      const data = await request.json();
      const result = Validator.validate(data, schema);

      if (!result.valid) {
        return {
          response: new Response(JSON.stringify({
            success: false,
            error: '输入验证失败',
            details: result.errors
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        };
      }

      return { data }; // 验证通过，返回解析的数据
    } catch (error) {
      return {
        response: new Response(JSON.stringify({
          success: false,
          error: '请求数据格式错误'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }
  };
}
