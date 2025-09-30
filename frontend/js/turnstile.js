/**
 * Cloudflare Turnstile 管理器 - 优化版本 v2.0
 * 负责按需加载、渲染和管理 Turnstile 验证组件
 * 基于官方最佳实践和 cloud-mail 项目优化
 * 只在领取密钥时验证，不在项目创建时验证
 */



class TurnstileManager {
    constructor() {
        this.config = {
            SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
            SITEVERIFY_URL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            RETRY_ATTEMPTS: 3,
            RETRY_DELAY: 1000,
            LOAD_TIMEOUT: 10000
        };

        this.isLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;
        this.siteKey = '';
        this.widgetId = null;
        this.token = null;
        this.retryCount = 0;
        this.loadPromise = null;

        this.callbacks = {
            onSuccess: [],
            onError: [],
            onExpired: [],
            onLoad: [],
            onTimeout: []
        };

        // 错误代码映射
        this.errorMessages = {
            '100000': '网络连接失败，请检查网络连接',
            '100001': '验证失败，请重试',
            '100002': '验证超时，请重试',
            '100003': '验证被拒绝，请重试',
            '100004': '验证频率过高，请稍后重试',
            '100005': '验证环境异常，请刷新页面重试',
            '100006': '验证配置错误，请联系管理员',
            '100007': '验证服务暂时不可用，请稍后重试',
            '100008': '浏览器不支持，请更新浏览器',
            '100009': '验证已过期，请重新验证',
            '100010': '验证令牌无效，请重新验证'
        };
    }

    /**
     * 检查配置（不加载脚本）
     */
    async checkConfig() {
        try {


            // 获取服务器配置
            const configResponse = await fetch('/api/turnstile/config');
            const configData = await configResponse.json();

            if (!configData.success) {
                console.warn('[TURNSTILE] 获取配置失败:', configData.error);
                return false;
            }

            this.isEnabled = configData.data.enabled;
            this.siteKey = configData.data.siteKey;



            return true;
        } catch (error) {
            console.error('[TURNSTILE] 配置检查失败:', error);
            return false;
        }
    }

    /**
     * 按需初始化 Turnstile（只在需要时加载脚本）
     */
    async init() {
        if (!this.isEnabled) {

            return true;
        }

        if (!this.siteKey) {
            console.warn('[TURNSTILE] 缺少 Site Key');
            return false;
        }

        try {

            await this.loadScript();
            return true;
        } catch (error) {
            console.error('[TURNSTILE] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 加载 Turnstile 脚本（带重试和超时机制）
     */
    loadScript() {
        // 如果已经在加载中，返回现有的 Promise
        if (this.loadPromise) {
            return this.loadPromise;
        }

        // 如果已经加载完成
        if (this.isLoaded || window.turnstile) {

            this.isLoaded = true;
            this.triggerCallbacks('onLoad');
            return Promise.resolve();
        }


        this.isLoading = true;

        this.loadPromise = new Promise((resolve, reject) => {
            const attemptLoad = (attempt = 1) => {
                const script = document.createElement('script');
                script.src = this.config.SCRIPT_URL;
                script.async = true;
                script.defer = true;

                // 设置超时
                const timeout = setTimeout(() => {
                    script.remove();
                    console.warn(`[TURNSTILE] 脚本加载超时 (尝试 ${attempt}/${this.config.RETRY_ATTEMPTS})`);

                    if (attempt < this.config.RETRY_ATTEMPTS) {
                        setTimeout(() => attemptLoad(attempt + 1), this.config.RETRY_DELAY);
                    } else {
                        this.isLoading = false;
                        this.triggerCallbacks('onTimeout');
                        reject(new Error('脚本加载超时'));
                    }
                }, this.config.LOAD_TIMEOUT);

                script.onload = () => {
                    clearTimeout(timeout);

                    this.isLoaded = true;
                    this.isLoading = false;
                    this.triggerCallbacks('onLoad');
                    resolve();
                };

                script.onerror = (error) => {
                    clearTimeout(timeout);
                    script.remove();
                    console.error(`[TURNSTILE] 脚本加载失败 (尝试 ${attempt}/${this.config.RETRY_ATTEMPTS}):`, error);

                    if (attempt < this.config.RETRY_ATTEMPTS) {
                        setTimeout(() => attemptLoad(attempt + 1), this.config.RETRY_DELAY);
                    } else {
                        this.isLoading = false;
                        reject(error);
                    }
                };

                document.head.appendChild(script);
            };

            attemptLoad();
        });

        return this.loadPromise;
    }

    /**
     * 渲染 Turnstile 组件（带加载状态和错误处理）
     */
    async render(container, options = {}) {
        if (!this.isEnabled) {

            return null;
        }

        if (!this.siteKey) {
            console.warn('[TURNSTILE] 缺少 Site Key，无法渲染');
            return null;
        }

        try {
            // 显示加载状态
            this.showLoadingState(container);

            // 确保脚本已加载
            if (!this.isLoaded || !window.turnstile) {

                await this.loadScript();
            }

            // 隐藏加载状态
            this.hideLoadingState(container);



            const renderOptions = {
                sitekey: this.siteKey,
                callback: (token) => this.onSuccess(token),
                'error-callback': (error) => this.onError(error),
                'expired-callback': () => this.onExpired(),
                theme: options.theme || 'auto',
                size: options.size || 'normal',
                ...options
            };

            this.widgetId = window.turnstile.render(container, renderOptions);


            return this.widgetId;
        } catch (error) {
            console.error('[TURNSTILE] 渲染失败:', error);
            this.hideLoadingState(container);
            this.showErrorState(container, error);
            return null;
        }
    }

    /**
     * 获取当前 token
     */
    getToken() {
        if (!this.isEnabled) {
            return null;
        }

        if (!this.isLoaded || !window.turnstile || !this.widgetId) {
            return this.token;
        }

        try {
            const token = window.turnstile.getResponse(this.widgetId);
            this.token = token;
            return token;
        } catch (error) {
            console.error('[TURNSTILE] 获取 token 失败:', error);
            return this.token;
        }
    }

    /**
     * 重置组件
     */
    reset() {
        if (!this.isEnabled || !this.isLoaded || !window.turnstile || !this.widgetId) {
            return;
        }

        try {
            window.turnstile.reset(this.widgetId);
            this.token = null;

        } catch (error) {
            console.error('[TURNSTILE] 重置失败:', error);
        }
    }

    /**
     * 移除组件
     */
    remove() {
        if (!this.isEnabled || !this.isLoaded || !window.turnstile || !this.widgetId) {
            return;
        }

        try {
            window.turnstile.remove(this.widgetId);
            this.widgetId = null;
            this.token = null;

        } catch (error) {
            console.error('[TURNSTILE] 移除失败:', error);
        }
    }

    /**
     * 成功回调
     */
    onSuccess(token) {

        this.token = token;
        this.callbacks.onSuccess.forEach(callback => {
            try {
                callback(token);
            } catch (error) {
                console.error('[TURNSTILE] 成功回调执行失败:', error);
            }
        });
    }

    /**
     * 错误回调（增强错误处理）
     */
    onError(errorCode) {
        console.error('[TURNSTILE] 验证失败:', errorCode);
        this.token = null;

        // 获取友好的错误消息
        const errorMessage = this.getErrorMessage(errorCode);
        console.error('[TURNSTILE] 错误详情:', errorMessage);

        // 对于测试环境，某些错误是正常的
        if (this.isTestEnvironment()) {

            this.token = 'test-token-' + Date.now();
            this.onSuccess(this.token);
            return;
        }

        // 对于某些可重试的错误，自动重试
        if (this.shouldRetry(errorCode) && this.retryCount < this.config.RETRY_ATTEMPTS) {
            this.retryCount++;


            setTimeout(() => {
                this.reset();
            }, this.config.RETRY_DELAY);
            return;
        }

        // 重置重试计数
        this.retryCount = 0;

        this.callbacks.onError.forEach(callback => {
            try {
                callback(errorCode, errorMessage);
            } catch (err) {
                console.error('[TURNSTILE] 错误回调执行失败:', err);
            }
        });
    }

    /**
     * 过期回调
     */
    onExpired() {
        console.warn('[TURNSTILE] 验证已过期');
        this.token = null;
        this.callbacks.onExpired.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('[TURNSTILE] 过期回调执行失败:', error);
            }
        });
    }

    /**
     * 添加事件监听器
     */
    addEventListener(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    /**
     * 移除事件监听器
     */
    removeEventListener(event, callback) {
        if (this.callbacks[event]) {
            const index = this.callbacks[event].indexOf(callback);
            if (index > -1) {
                this.callbacks[event].splice(index, 1);
            }
        }
    }

    /**
     * 检查是否已验证
     */
    isVerified() {
        return this.isEnabled ? !!this.token : true;
    }

    /**
     * 获取验证数据（用于表单提交）
     */
    getVerificationData() {
        if (!this.isEnabled) {
            return {};
        }

        return {
            'cf-turnstile-response': this.getToken(),
            turnstileToken: this.getToken()
        };
    }

    // ========== 新增辅助方法 ==========

    /**
     * 获取友好的错误消息
     */
    getErrorMessage(errorCode) {
        return this.errorMessages[errorCode] || `未知错误 (${errorCode})`;
    }

    /**
     * 判断错误是否可重试
     */
    shouldRetry(errorCode) {
        const retryableErrors = ['100000', '100002', '100004', '100007'];
        return retryableErrors.includes(errorCode);
    }

    /**
     * 触发回调
     */
    triggerCallbacks(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`[TURNSTILE] ${event} 回调执行失败:`, error);
                }
            });
        }
    }

    /**
     * 显示加载状态
     */
    showLoadingState(container) {
        const element = typeof container === 'string' ? document.querySelector(container) : container;
        if (element) {
            element.innerHTML = `
                <div class="turnstile-loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在加载安全验证...</div>
                </div>
            `;
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoadingState(container) {
        const element = typeof container === 'string' ? document.querySelector(container) : container;
        if (element) {
            const loading = element.querySelector('.turnstile-loading');
            if (loading) {
                loading.remove();
            }
        }
    }

    /**
     * 显示错误状态
     */
    showErrorState(container, error) {
        const element = typeof container === 'string' ? document.querySelector(container) : container;
        if (element) {
            element.innerHTML = `
                <div class="turnstile-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">验证组件加载失败</div>
                    <button class="retry-btn" onclick="window.TurnstileManager.retryRender('${container}')">重试</button>
                </div>
            `;
        }
    }

    /**
     * 重试渲染
     */
    async retryRender(container) {
        this.reset();
        this.isLoaded = false;
        this.loadPromise = null;
        await this.render(container);
    }

    /**
     * 预加载（在需要之前预先加载脚本）
     */
    async preload() {
        if (!this.isEnabled || this.isLoaded || this.isLoading) {
            return;
        }

        try {

            await this.loadScript();
        } catch (error) {
            console.warn('[TURNSTILE] 预加载失败:', error);
        }
    }
}

// 创建全局实例
window.TurnstileManager = new TurnstileManager();
