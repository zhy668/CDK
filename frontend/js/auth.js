/**
 * LinuxDoConnect Authentication Manager
 * Handles user authentication, session management, and login state
 */

console.log('🔐 Auth Manager loaded');

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.checkingAuth = false;
        this.isAdmin = false;
    }

    /**
     * Initialize authentication
     * Check if user is already logged in
     */
    async init() {
        console.log('[AUTH] Initializing authentication...');

        try {
            // Check URL for OAuth callback
            const urlParams = new URLSearchParams(window.location.search);
            const error = urlParams.get('error');

            if (error) {
                this.showError(`登录失败: ${decodeURIComponent(error)}`);
                return false;
            }

            // Check if user is already authenticated
            const authenticated = await this.checkAuth();

            if (authenticated) {
                console.log('[AUTH] User is authenticated:', this.currentUser?.username);
                // If authenticated, remove login=required parameter
                if (urlParams.has('login')) {
                    urlParams.delete('login');
                    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
                    window.history.replaceState({}, '', newUrl);
                }
                return true;
            } else {
                console.log('[AUTH] User is not authenticated');
                return false;
            }
        } catch (error) {
            console.error('[AUTH] Init error:', error);
            return false;
        }
    }

    /**
     * Check if user is authenticated
     */
    async checkAuth() {
        // If already checking, wait for the current check to complete
        if (this.checkingAuth) {
            console.log('[AUTH] Already checking auth, waiting...');
            // Wait for the current check to complete
            while (this.checkingAuth) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.isAuthenticated;
        }

        this.checkingAuth = true;

        try {
            const response = await fetch('/api/auth/userinfo', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    this.currentUser = result.data;
                    this.isAuthenticated = true;
                    this.isAdmin = result.data.isAdmin || false;
                    this.updateUI();
                    return true;
                }
            }

            this.isAuthenticated = false;
            this.currentUser = null;
            return false;
        } catch (error) {
            console.error('[AUTH] Check auth error:', error);
            this.isAuthenticated = false;
            this.currentUser = null;
            return false;
        } finally {
            this.checkingAuth = false;
        }
    }

    /**
     * Redirect to login
     */
    async redirectToLogin(returnTo) {
        try {
            const currentPath = returnTo || window.location.pathname + window.location.search;
            const encodedReturnTo = encodeURIComponent(currentPath);
            
            console.log('[AUTH] Getting login URL, return to:', currentPath);
            
            const response = await fetch(`/api/auth/login?return_to=${encodedReturnTo}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data.authUrl) {
                    console.log('[AUTH] Redirecting to LinuxDo login...');
                    window.location.href = result.data.authUrl;
                    return;
                }
            }

            throw new Error('Failed to get login URL');
        } catch (error) {
            console.error('[AUTH] Redirect to login error:', error);
            this.showError('无法跳转到登录页面,请刷新重试');
        }
    }

    /**
     * Logout
     */
    async logout() {
        try {
            console.log('[AUTH] Logging out...');
            
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            this.isAuthenticated = false;
            this.currentUser = null;
            
            // Redirect to home with login required
            window.location.href = '/?login=required';
        } catch (error) {
            console.error('[AUTH] Logout error:', error);
            this.showError('登出失败,请刷新重试');
        }
    }

    /**
     * Require authentication
     * If not authenticated, redirect to login
     */
    async requireAuth() {
        const authenticated = await this.checkAuth();

        if (!authenticated) {
            console.log('[AUTH] Authentication required, redirecting to login...');
            await this.redirectToLogin();
            return false;
        }

        return true;
    }

    /**
     * Check if current user is admin
     * Admin status is determined by backend API
     */
    checkIsAdmin() {
        return this.isAdmin;
    }

    /**
     * Update UI with user information
     */
    updateUI() {
        if (!this.isAuthenticated || !this.currentUser) {
            this.showLoginButton();
            this.hideNavButtons();
            return;
        }

        this.showUserInfo();
        this.showNavButtons();
    }

    /**
     * Show navigation buttons (home)
     */
    showNavButtons() {
        const navHome = document.getElementById('nav-home');
        if (navHome) navHome.style.display = '';
    }

    /**
     * Hide navigation buttons (home)
     */
    hideNavButtons() {
        const navHome = document.getElementById('nav-home');
        if (navHome) navHome.style.display = 'none';
    }

    /**
     * Show login button
     */
    showLoginButton() {
        // Update navigation bar
        const navUserInfoEl = document.getElementById('nav-user-info');
        if (navUserInfoEl) {
            navUserInfoEl.innerHTML = '';
        }

        // Update login page
        const loginUserInfoEl = document.getElementById('login-user-info');
        if (loginUserInfoEl) {
            loginUserInfoEl.innerHTML = `
                <button id="btn-login" class="btn btn-primary">
                    <span>使用 Linux.do 登录</span>
                </button>
            `;

            const loginBtn = document.getElementById('btn-login');
            if (loginBtn) {
                loginBtn.addEventListener('click', () => this.redirectToLogin());
            }
        }
    }

    /**
     * Show user information
     */
    showUserInfo() {
        const navUserInfoEl = document.getElementById('nav-user-info');
        if (navUserInfoEl && this.currentUser) {
            const avatarHtml = this.currentUser.avatarUrl
                ? `<img src="${this.currentUser.avatarUrl}" alt="${this.currentUser.username}" class="user-avatar">`
                : `<div class="user-avatar-placeholder">${this.currentUser.username.charAt(0).toUpperCase()}</div>`;

            navUserInfoEl.innerHTML = `
                <div class="user-info-container">
                    ${avatarHtml}
                    <div class="user-details">
                        <span class="user-name">${this.currentUser.name || this.currentUser.username}</span>
                        <span class="user-username">@${this.currentUser.username}</span>
                    </div>
                    <button id="btn-logout" class="btn btn-secondary btn-sm">登出</button>
                </div>
            `;

            const logoutBtn = document.getElementById('btn-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.logout());
            }
        }

        // Show/hide admin button based on admin status
        const adminBtn = document.getElementById('nav-admin');
        if (adminBtn) {
            if (this.checkIsAdmin()) {
                adminBtn.style.display = 'inline-block';
            } else {
                adminBtn.style.display = 'none';
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('[AUTH] Error:', message);
        
        // Try to show in UI if available
        const errorEl = document.getElementById('auth-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        } else {
            alert(message);
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Check if authenticated
     */
    isLoggedIn() {
        return this.isAuthenticated;
    }
}

// Create global instance
window.AuthManager = new AuthManager();

// Note: Initialization is handled by app.js to avoid race conditions
// Do not auto-initialize here

