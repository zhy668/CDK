/**
 * 工具函数库
 */

// DOM 操作工具
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// 显示/隐藏元素
function show(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.display = 'block';
    }
}

function hide(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.display = 'none';
    }
}

// 页面切换
function showPage(pageId) {
    // 隐藏所有页面
    $$('.page').forEach(page => page.classList.remove('active'));
    // 显示目标页面
    const targetPage = $(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// 加载状态管理
function showLoading(message = '处理中...') {
    const overlay = $('#loading-overlay');
    const text = overlay.querySelector('p');
    if (text) {
        text.textContent = message;
    }
    show(overlay);
}

function hideLoading() {
    hide('#loading-overlay');
}

// Toast 通知
function showToast(message, type = 'info', duration = 3000) {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // 自动移除
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, duration);
}

// 表单验证
function validateForm(formId) {
    const form = $(formId);
    if (!form) return false;
    
    const inputs = form.querySelectorAll('input[required], textarea[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('error');
            isValid = false;
        } else {
            input.classList.remove('error');
        }
    });
    
    return isValid;
}

// 清空表单
function clearForm(formId) {
    const form = $(formId);
    if (form) {
        form.reset();
        // 移除错误样式
        form.querySelectorAll('.error').forEach(el => {
            el.classList.remove('error');
        });
    }
}

// 复制到剪贴板
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('复制成功', 'success');
        return true;
    } catch (err) {
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('复制成功', 'success');
            return true;
        } catch (err) {
            showToast('复制失败', 'error');
            return false;
        } finally {
            document.body.removeChild(textArea);
        }
    }
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 解析卡密内容
function parseCards(input, format = 'text') {
    if (!input || !input.trim()) return [];
    
    try {
        switch (format) {
            case 'json':
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed)) {
                    return parsed.map(item => 
                        typeof item === 'string' ? item : JSON.stringify(item)
                    );
                }
                return [JSON.stringify(parsed)];
            
            case 'csv':
                return input.split(/[,，]/).map(card => card.trim()).filter(card => card);
            
            case 'text':
            default:
                return input.split('\n').map(card => card.trim()).filter(card => card);
        }
    } catch (error) {
        // 降级到文本格式
        return input.split('\n').map(card => card.trim()).filter(card => card);
    }
}

// 去重
function removeDuplicates(array) {
    return [...new Set(array)];
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// 获取URL参数
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

// 设置URL参数
function setUrlParams(params) {
    const url = new URL(window.location);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
            url.searchParams.set(key, params[key]);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.replaceState({}, '', url);
}

// 本地存储工具
const storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Storage set error:', e);
        }
    },
    
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('Storage get error:', e);
            return defaultValue;
        }
    },
    
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Storage remove error:', e);
        }
    },
    
    clear() {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('Storage clear error:', e);
        }
    }
};

// 错误处理
function handleError(error, userMessage = '操作失败，请重试') {
    console.error('Error:', error);
    showToast(userMessage, 'error');
}

// 确认对话框
function confirmAction(message, callback) {
    if (window.confirm(message)) {
        callback();
    }
}

// 数字格式化
function formatNumber(num) {
    return num.toLocaleString('zh-CN');
}

// 文件大小格式化
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
