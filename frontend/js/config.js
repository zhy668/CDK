/**
 * CDK 系统配置文件
 * 在这里配置 API 地址和安全密钥
 */

// 配置对象
const CDK_CONFIG = {
    // API 基础地址 - 单Worker模式使用相对路径
    // 在构建时会自动设置为空字符串，使用相对路径调用API
    API_BASE_URL: '',

    // API 安全密钥 - 当前已禁用，简化小项目部署
    // 如需启用，请在 Worker 中取消注释认证中间件
    API_SECRET_KEY: '',

    // 请求超时时间（毫秒）
    REQUEST_TIMEOUT: 30000,

    // 是否启用调试模式
    DEBUG_MODE: false,

    // 版本信息
    VERSION: '3.0.0',

    // Turnstile 配置
    TURNSTILE: {
        SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
        WIDGET_ID: null,
        ENABLED: false,
        SITE_KEY: ''
    },

    // LinuxDoConnect OAuth 配置
    AUTH: {
        ENABLED: true,
        REQUIRE_LOGIN: true, // 是否全站需要登录
        LOGIN_URL: '/api/auth/login',
        LOGOUT_URL: '/api/auth/logout',
        USERINFO_URL: '/api/auth/userinfo',
        CALLBACK_URL: '/api/auth/callback'
    }
};

// 导出配置（兼容不同的模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CDK_CONFIG;
} else if (typeof window !== 'undefined') {
    window.CDK_CONFIG = CDK_CONFIG;
}

// 配置验证函数
function validateConfig() {
    const errors = [];

    // 单Worker模式下，API_BASE_URL为空是正常的
    if (CDK_CONFIG.API_BASE_URL && CDK_CONFIG.API_BASE_URL === 'https://your-worker-domain.workers.dev') {
        errors.push('请配置正确的 API_BASE_URL');
    }

    // API密钥当前已禁用，不需要验证
    if (CDK_CONFIG.API_SECRET_KEY && CDK_CONFIG.API_SECRET_KEY === 'your-secret-key-here') {
        errors.push('请配置 API_SECRET_KEY 安全密钥');
    }

    if (errors.length > 0) {
        console.warn('CDK 配置警告:', errors);
        if (CDK_CONFIG.DEBUG_MODE) {
            alert('配置错误:\n' + errors.join('\n'));
        }
    }

    return errors.length === 0;
}

// 自动验证配置
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', validateConfig);
}
