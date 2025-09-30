/**
 * API 客户端
 */

// API 配置 - 使用全局配置
function getApiConfig() {
    if (window.CDK_CONFIG) {
        return {
            baseUrl: window.CDK_CONFIG.API_BASE_URL + '/api',
            timeout: window.CDK_CONFIG.REQUEST_TIMEOUT,
            secretKey: window.CDK_CONFIG.API_SECRET_KEY,
            retries: 3
        };
    }
    // 回退配置
    return {
        baseUrl: '/api',
        timeout: 30000,
        secretKey: null,
        retries: 3
    };
}

// HTTP 客户端
class HttpClient {
    constructor() {
        this.config = getApiConfig();
    }

    async request(endpoint, options = {}) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
        };

        // 添加安全密钥到请求头（当前已禁用）
        if (this.config.secretKey && this.config.secretKey !== 'your-secret-key-here' && this.config.secretKey !== '') {
            headers['X-API-Key'] = this.config.secretKey;
        }

        const config = {
            method: 'GET',
            headers,
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint, data = null) {
        const options = { method: 'DELETE' };
        if (data) {
            options.body = JSON.stringify(data);
        }
        return this.request(endpoint, options);
    }
}

// API 客户端实例
const apiClient = new HttpClient();

// API 方法
const API = {
    // 健康检查
    async health() {
        return apiClient.get('/health');
    },

    // 项目管理
    projects: {
        // 创建项目
        async create(projectData) {
            return apiClient.post('/projects', projectData);
        },

        // 获取项目列表
        async list() {
            return apiClient.get('/projects');
        },

        // 获取单个项目
        async get(id) {
            return apiClient.get(`/projects/${id}`);
        },

        // 更新项目
        async update(id, updates) {
            return apiClient.put(`/projects/${id}`, updates);
        },

        // 删除项目
        async delete(id, data = null) {
            return apiClient.delete(`/projects/${id}`, data);
        },

        // 添加卡密
        async addCards(id, cardsData) {
            return apiClient.post(`/projects/${id}/cards`, cardsData);
        },

        // 获取项目统计
        async getStats(id, adminPassword) {
            return apiClient.post(`/projects/${id}/stats`, { adminPassword });
        },

        // 验证管理密码
        async verifyAdminPassword(projectId, adminPassword) {
            return apiClient.post('/verify-admin', { projectId, adminPassword });
        }
    },

    // 卡密领取
    claim: {
        // 验证密码
        async verifyPassword(projectId, password) {
            return apiClient.post('/verify', {
                projectId,
                password
            });
        },

        // 领取卡密
        async claimCard(projectId, claimData) {
            return apiClient.post('/claim', {
                projectId,
                ...claimData
            });
        },

        // 获取领取状态
        async getStatus(projectId) {
            return apiClient.get(`/claim/${projectId}`);
        }
    },

    // 管理员功能
    admin: {
        // 获取用户列表
        async getUsers() {
            return apiClient.get('/admin/users');
        },

        // 获取用户统计
        async getUserStats() {
            return apiClient.get('/admin/users/stats');
        },

        // 封禁用户
        async banUser(userId, reason) {
            return apiClient.post('/admin/users/ban', { userId, reason });
        },

        // 解禁用户
        async unbanUser(userId) {
            return apiClient.post('/admin/users/unban', { userId });
        }
    }
};

// API 错误处理装饰器
function withErrorHandling(apiMethod) {
    return async function(...args) {
        try {
            showLoading();
            const result = await apiMethod.apply(this, args);
            hideLoading();
            return result;
        } catch (error) {
            hideLoading();
            
            // 根据错误类型显示不同的消息
            let message = '操作失败，请重试';
            
            if (error.message.includes('404')) {
                message = '资源不存在';
            } else if (error.message.includes('401')) {
                message = '密码错误';
            } else if (error.message.includes('403')) {
                message = '访问被拒绝';
            } else if (error.message.includes('410')) {
                message = '卡密已全部领完';
            } else if (error.message.includes('429')) {
                message = '请求过于频繁，请稍后重试';
            } else if (error.message.includes('500')) {
                message = '服务器错误，请稍后重试';
            } else if (error.message.includes('网络')) {
                message = '网络连接失败，请检查网络';
            }
            
            showToast(message, 'error');
            throw error;
        }
    };
}

// 包装 API 方法以添加错误处理
const wrappedAPI = {
    health: withErrorHandling(API.health),
    
    projects: {
        create: withErrorHandling(API.projects.create),
        list: withErrorHandling(API.projects.list),
        get: withErrorHandling(API.projects.get),
        update: withErrorHandling(API.projects.update),
        delete: withErrorHandling(API.projects.delete),
        addCards: withErrorHandling(API.projects.addCards),
        getStats: withErrorHandling(API.projects.getStats)
    },
    
    claim: {
        verifyPassword: withErrorHandling(API.claim.verifyPassword),
        claimCard: withErrorHandling(API.claim.claimCard),
        getStatus: withErrorHandling(API.claim.getStatus)
    }
};

// 导出 API
window.API = wrappedAPI;
