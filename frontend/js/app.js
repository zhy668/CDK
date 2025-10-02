/**
 * CDK 主应用逻辑 - 优化版本 v3.0
 * 集成 LinuxDoConnect 认证 + Turnstile 验证
 */

console.log('🚀 CDK App v3.0 已加载 - LinuxDoConnect 认证版本');

class CDKApp {
    constructor() {
        this.currentProject = null;
        this.currentEditProject = null;
        this.projects = [];
        this.importedCards = [];
        this.authRequired = true; // 全站需要认证
        this.init();
    }

    async init() {
        console.log('[APP] Initializing CDK App...');

        // 等待认证管理器初始化
        if (window.AuthManager) {
            const authenticated = await window.AuthManager.init();

            if (!authenticated) {
                console.log('[APP] User not authenticated');
                // 所有页面都需要登录
                if (this.authRequired) {
                    console.log('[APP] Redirecting to login...');
                    this.showLoginPage();
                    return;
                }
            } else {
                console.log('[APP] User authenticated:', window.AuthManager.getCurrentUser()?.username);
                // 用户已认证,继续初始化应用
            }
        }

        // 检查 Turnstile 配置（不加载脚本）
        await this.checkTurnstileConfig();

        this.bindEvents();
        this.setupCardImport();
        this.handleUrlParams();
        this.loadProjects();
    }

    // 显示登录页面
    showLoginPage() {
        console.log('[APP] Showing login page');
        showPage('#login-page');
        // 显示登录按钮
        if (window.AuthManager) {
            window.AuthManager.showLoginButton();
        }
    }

    // 检查 Turnstile 配置
    async checkTurnstileConfig() {
        try {
            console.log('[APP] 正在检查 Turnstile 配置... (优化版本 v2.0)');
            const success = await window.TurnstileManager.checkConfig();

            if (success) {
                console.log('[APP] Turnstile 配置检查完成');
            } else {
                console.log('[APP] Turnstile 配置检查失败');
            }
        } catch (error) {
            console.error('[APP] Turnstile 配置检查失败:', error);
        }
    }

    // 显示领取页面的 Turnstile 组件
    async showClaimTurnstileWidget() {
        if (!window.TurnstileManager.isEnabled) {
            console.log('[APP] Turnstile 未启用，跳过验证');
            return true;
        }

        const container = $('#claim-turnstile-container');
        if (container) {
            container.style.display = 'block';
            container.classList.add('show');

            try {
                // 按需加载并渲染 Turnstile 组件
                const widgetId = await window.TurnstileManager.render('#claim-turnstile-widget');
                return !!widgetId;
            } catch (error) {
                console.error('[APP] Turnstile 渲染失败:', error);
                return false;
            }
        }
        return false;
    }

    // 隐藏领取页面的 Turnstile 组件
    hideClaimTurnstileWidget() {
        const container = $('#claim-turnstile-container');
        if (container) {
            container.style.display = 'none';
            container.classList.remove('show');
        }

        // 移除 Turnstile 组件
        window.TurnstileManager.remove();
    }

    bindEvents() {
        // 导航事件
        $('#nav-home')?.addEventListener('click', () => this.showHomePage());
        $('#nav-admin')?.addEventListener('click', () => this.showAdminPage());

        // 首页按钮
        $('#btn-create-project')?.addEventListener('click', () => this.showCreatePage());
        $('#btn-manage-projects')?.addEventListener('click', () => this.showManagePage());

        // 返回首页按钮
        $('#btn-back-home')?.addEventListener('click', () => this.showHomePage());
        $('#btn-back-home-2')?.addEventListener('click', () => this.showHomePage());

        // 创建项目表单
        $('#create-form')?.addEventListener('submit', (e) => this.handleCreateProject(e));
        $('#btn-clear-form')?.addEventListener('click', () => this.clearCreateForm());

        // 卡密输入监听已移除，只在导入时更新计数

        // 格式切换标签
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFormatChange(e));
        });

        // 密码验证表单
        $('#verify-form')?.addEventListener('submit', (e) => this.handlePasswordVerify(e));

        // 领取相关按钮
        $('#btn-copy-card')?.addEventListener('click', () => this.copyClaimedCard());
        $('#btn-retry')?.addEventListener('click', () => this.showPasswordForm());

        // 空状态按钮
        $('#btn-create-first')?.addEventListener('click', () => this.showCreatePage());
    }

    handleUrlParams() {
        const params = getUrlParams();

        // 如果有项目ID参数，显示领取页面
        if (params.project) {
            this.showClaimPage(params.project);
        } else {
            // 没有参数，显示首页
            this.showHomePage();
        }
    }

    // 页面切换方法
    async showHomePage() {
        // 检查认证
        if (this.authRequired && !await this.checkAuth()) {
            return;
        }
        showPage('#home-page');
        setUrlParams({ project: null });
    }

    async showCreatePage() {
        // 检查认证
        if (this.authRequired && !await this.checkAuth()) {
            return;
        }
        showPage('#create-page');
        this.clearCreateForm();
    }

    async showManagePage() {
        // 检查认证
        if (this.authRequired && !await this.checkAuth()) {
            return;
        }
        showPage('#manage-page');
        this.loadProjects();
    }

    async showAdminPage() {
        // 检查认证和管理员权限
        if (this.authRequired && !await this.checkAuth()) {
            return;
        }

        if (!window.AuthManager || !window.AuthManager.checkIsAdmin()) {
            showToast('需要管理员权限', 'error');
            this.showHomePage();
            return;
        }

        showPage('#admin-page');
        await this.loadAdminData();
    }

    // 检查认证状态
    async checkAuth() {
        if (!window.AuthManager) {
            console.error('[APP] AuthManager not available');
            return false;
        }

        const authenticated = await window.AuthManager.checkAuth();

        if (!authenticated) {
            console.log('[APP] Not authenticated, redirecting to login');
            await window.AuthManager.redirectToLogin();
            return false;
        }

        return true;
    }

    async showClaimPage(projectId) {
        showPage('#claim-page');
        this.currentProject = projectId;
        this.showPasswordForm();
        setUrlParams({ project: projectId });

        // 显示 Turnstile 验证组件
        await this.showClaimTurnstileWidget();
    }

    // 创建项目相关方法
    clearCreateForm() {
        clearForm('#create-form');
        // 重置格式标签
        $$('.tab-btn').forEach(btn => btn.classList.remove('active'));
        $('.tab-btn[data-format="text"]')?.classList.add('active');
        this.updateCardsPlaceholder('text');
        // 清空导入的卡密列表
        this.importedCards = [];
        this.displayImportedCards();
        this.updateCardsCount();
    }

    handleFormatChange(e) {
        e.preventDefault();
        const format = e.target.dataset.format;

        // 更新标签状态
        $$('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        // 更新占位符
        this.updateCardsPlaceholder(format);

        // 更新卡密计数
        this.updateCardsCount();
    }

    updateCardsPlaceholder(format) {
        const textarea = $('#cards-input');
        if (!textarea) return;

        const placeholders = {
            text: '请输入卡密内容，每行一个卡密\n例如：\nABCD-1234-EFGH\nIJKL-5678-MNOP',
            csv: '请输入卡密内容，用逗号分隔\n例如：ABCD-1234-EFGH,IJKL-5678-MNOP,QRST-9012-UVWX',
            json: '请输入JSON格式的卡密内容\n例如：\n["ABCD-1234-EFGH", "IJKL-5678-MNOP"]\n或：\n[{"user":"test1","pass":"123"}, {"user":"test2","pass":"456"}]'
        };

        textarea.placeholder = placeholders[format] || placeholders.text;
    }

    async handleCreateProject(e) {
        e.preventDefault();

        if (!validateForm('#create-form')) {
            showToast('请填写所有必填字段', 'error');
            return;
        }

        try {
            const name = $('#project-name').value.trim();
            const password = $('#project-password').value;
            const adminPassword = $('#admin-password').value;
            const description = $('#project-description').value.trim();
            const cardsInput = $('#cards-input').value.trim();
            const removeDuplicatesChecked = $('#remove-duplicates').checked;

            // 获取当前选中的格式
            const activeTab = $('.tab-btn.active');
            const format = activeTab ? activeTab.dataset.format : 'text';

            // 只使用已导入列表的卡密数据
            let cards = [];

            // 只使用导入列表中的卡密
            if (this.importedCards && this.importedCards.length > 0) {
                cards = [...this.importedCards]; // 复制数组
            }

            if (cards.length === 0) {
                showToast('请先导入卡密数据', 'error');
                return;
            }

            // 去重处理
            if (removeDuplicatesChecked) {
                const originalCount = cards.length;
                cards = removeDuplicates(cards);
                if (cards.length < originalCount) {
                    showToast(`已去除 ${originalCount - cards.length} 个重复卡密`, 'info');
                }
            }

            // 获取领取限制设置
            const limitOnePerUser = $('#limit-one-per-user').checked;

            // 创建项目
            const projectData = {
                name,
                password,
                adminPassword,
                description: description || undefined,
                limitOnePerUser,
                cards
            };

            // 项目创建不需要 Turnstile 验证

            const result = await API.projects.create(projectData);
            
            if (result.success) {
                showToast('项目创建成功', 'success');
                this.clearCreateForm();
                this.showManagePage();
            }

        } catch (error) {
            // 错误已在 API 层处理
        }
    }

    // 项目管理相关方法
    async loadProjects() {
        try {
            show('#projects-loading');
            hide('#projects-list');
            hide('#projects-empty');

            const result = await API.projects.list();
            
            if (result.success) {
                this.projects = result.data || [];
                this.renderProjects();
            }

        } catch (error) {
            // 错误已在 API 层处理
            this.projects = [];
            this.renderProjects();
        } finally {
            hide('#projects-loading');
        }
    }

    renderProjects() {
        const container = $('#projects-list');
        const emptyState = $('#projects-empty');

        if (this.projects.length === 0) {
            hide(container);
            show(emptyState);
            return;
        }

        hide(emptyState);
        show(container);

        container.innerHTML = this.projects.map(project => this.renderProjectCard(project)).join('');

        // 绑定项目卡片事件
        this.bindProjectCardEvents();
    }

    renderProjectCard(project) {
        const remainingCards = project.totalCards - project.claimedCards;
        const progressPercent = project.totalCards > 0 ? 
            Math.round((project.claimedCards / project.totalCards) * 100) : 0;

        return `
            <div class="project-card" data-project-id="${project.id}">
                <div class="project-header">
                    <div>
                        <div class="project-title">${project.name}</div>
                        <div class="project-description">${project.description || '无描述'}</div>
                    </div>
                    <div class="project-status ${project.isActive ? 'status-active' : 'status-inactive'}">
                        ${project.isActive ? '启用' : '停用'}
                    </div>
                </div>
                
                <div class="project-stats">
                    <div class="stat-item">
                        <div class="stat-value">${formatNumber(project.totalCards)}</div>
                        <div class="stat-label">总卡密</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${formatNumber(project.claimedCards)}</div>
                        <div class="stat-label">已领取</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${formatNumber(remainingCards)}</div>
                        <div class="stat-label">剩余</div>
                    </div>
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>

                <div class="project-actions">
                    <button class="btn btn-primary btn-view-link" data-project-id="${project.id}">
                        查看链接
                    </button>
                    <button class="btn btn-secondary btn-view-stats" data-project-id="${project.id}">
                        查看统计
                    </button>
                    <button class="btn btn-secondary btn-edit-project" data-project-id="${project.id}">
                        编辑
                    </button>
                    <button class="btn btn-danger btn-delete-project" data-project-id="${project.id}">
                        删除
                    </button>
                </div>

                <div class="project-meta">
                    <small>创建时间: ${formatDate(project.createdAt)}</small>
                </div>
            </div>
        `;
    }

    bindProjectCardEvents() {
        // 查看链接按钮
        $$('.btn-view-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.projectId;
                this.showProjectLink(projectId);
            });
        });

        // 查看统计按钮
        $$('.btn-view-stats').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.projectId;
                this.showProjectStats(projectId);
            });
        });

        // 编辑项目按钮
        $$('.btn-edit-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.projectId;
                this.editProject(projectId);
            });
        });

        // 删除项目按钮
        $$('.btn-delete-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.projectId;
                this.deleteProject(projectId);
            });
        });
    }

    showProjectLink(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        const baseUrl = window.location.origin + window.location.pathname;
        const projectUrl = `${baseUrl}?project=${projectId}`;

        const message = `项目链接已复制到剪贴板：\n${projectUrl}`;
        copyToClipboard(projectUrl);
        alert(message);
    }

    async showProjectStats(projectId) {
        // 显示管理密码输入对话框
        this.showAdminPasswordModal(projectId, async (adminPassword) => {
            try {
                const result = await API.projects.getStats(projectId, adminPassword);
                if (result.success) {
                    this.displayStatsModal(result.data);
                }
            } catch (error) {
                // 错误已在 API 层处理
            }
        });
    }

    displayStatsModal(stats) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>项目统计</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="stats-summary">
                        <div class="stat-item">
                            <div class="stat-value">${formatNumber(stats.totalCards)}</div>
                            <div class="stat-label">总卡密数</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${formatNumber(stats.claimedCards)}</div>
                            <div class="stat-label">已领取</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${formatNumber(stats.remainingCards)}</div>
                            <div class="stat-label">剩余</div>
                        </div>
                    </div>
                    
                    <div class="claim-history">
                        <h4>领取记录</h4>
                        ${stats.claimHistory.length > 0 ?
                            stats.claimHistory.map(record => `
                                <div class="claim-record">
                                    <div class="claim-time">${formatDate(record.claimedAt)}</div>
                                    <div class="claim-user">${record.username || '未知用户'}</div>
                                    <div class="claim-card">${record.cardContent}</div>
                                </div>
                            `).join('') :
                            '<p>暂无领取记录</p>'
                        }
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭事件
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
            // 刷新项目列表以显示更新后的统计数据
            this.loadProjects();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                // 刷新项目列表以显示更新后的统计数据
                this.loadProjects();
            }
        });
    }

    showAdminPasswordModal(projectId, onSuccess) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>验证管理密码</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="admin-password-form">
                        <div class="form-group">
                            <label for="admin-password-input">管理密码</label>
                            <input type="password" id="admin-password-input" required
                                   placeholder="请输入管理密码" autocomplete="off">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary modal-cancel">取消</button>
                            <button type="submit" class="btn btn-primary">确认</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('#admin-password-form');
        const input = modal.querySelector('#admin-password-input');
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        // 绑定关闭事件
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // 绑定表单提交事件
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const adminPassword = input.value.trim();

            if (!adminPassword) {
                showToast('请输入管理密码', 'error');
                return;
            }

            closeModal();
            await onSuccess(adminPassword);
        });

        // 自动聚焦输入框
        setTimeout(() => input.focus(), 100);
    }

    async editProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        // 先验证管理密码
        const adminPassword = prompt(`请输入项目 "${project.name}" 的管理密码：`);
        if (!adminPassword) {
            return; // 用户取消
        }

        try {
            // 验证管理密码
            const verifyResult = await API.projects.verifyAdminPassword(projectId, adminPassword);
            if (!verifyResult.success || !verifyResult.data.valid) {
                showToast('管理密码错误', 'error');
                return;
            }

            // 密码正确，显示编辑模态框
            this.currentEditProject = { ...project, adminPassword };
            await this.showEditProjectModal(projectId, adminPassword);
        } catch (error) {
            showToast(error.message || '验证管理密码失败', 'error');
        }
    }

    async showEditProjectModal(projectId, adminPassword) {
        const modal = $('#edit-project-modal');
        const project = this.currentEditProject;

        // 设置项目状态开关
        const statusToggle = $('#project-status-toggle');
        const statusText = $('#project-status-text');
        statusToggle.checked = project.isActive;
        statusText.textContent = project.isActive ? '项目已启用' : '项目已禁用';

        // 设置项目描述
        const descriptionTextarea = $('#edit-project-description');
        descriptionTextarea.value = project.description || '';

        // 添加状态切换事件
        statusToggle.onchange = async () => {
            await this.toggleProjectStatus(projectId, statusToggle.checked, adminPassword);
        };

        // 加载项目统计和卡密列表
        await this.loadProjectCardsForEdit(projectId, adminPassword);

        // 显示模态框
        modal.style.display = 'flex';
    }

    async loadProjectCardsForEdit(projectId, adminPassword) {
        try {
            const statsResult = await API.projects.getStats(projectId, adminPassword);
            if (statsResult.success) {
                const stats = statsResult.data;

                // 更新统计信息
                $('#edit-total-cards').textContent = stats.totalCards;
                $('#edit-claimed-cards').textContent = stats.claimedCards;
                $('#edit-remaining-cards').textContent = stats.remainingCards;

                // 显示卡密列表
                this.displayEditCardsList(stats.claimHistory, projectId, adminPassword);
            }
        } catch (error) {
            showToast(error.message || '加载卡密列表失败', 'error');
        }
    }

    displayEditCardsList(claimHistory, projectId, adminPassword) {
        const listEl = $('#edit-cards-list');

        if (!claimHistory || claimHistory.length === 0) {
            listEl.innerHTML = '<p class="empty-state">暂无卡密</p>';
            return;
        }

        const html = claimHistory.map(record => {
            const isClaimed = !!record.claimedAt;
            const statusClass = isClaimed ? 'claimed' : 'available';
            const statusText = isClaimed ? '已领取' : '未领取';
            const deleteButton = isClaimed
                ? ''
                : `<button class="btn btn-danger btn-sm" onclick="app.deleteCard('${projectId}', '${record.id}', '${adminPassword}')">删除</button>`;

            return `
                <div class="card-item ${statusClass}">
                    <div class="card-content">${record.cardContent}</div>
                    <span class="card-status ${statusClass}">${statusText}</span>
                    <div class="card-actions">
                        ${deleteButton}
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    async addNewCards() {
        const textarea = $('#new-cards-input');
        const cardsText = textarea.value.trim();

        if (!cardsText) {
            showToast('请输入卡密', 'error');
            return;
        }

        const cards = cardsText.split('\n').map(c => c.trim()).filter(c => c);
        if (cards.length === 0) {
            showToast('请输入有效的卡密', 'error');
            return;
        }

        const { id: projectId, adminPassword } = this.currentEditProject;

        try {
            const result = await API.projects.addCards(projectId, {
                cards,
                adminPassword,
                removeDuplicates: true
            });

            if (result.success) {
                showToast(`成功添加 ${result.data.added} 个卡密`, 'success');
                textarea.value = '';
                // 重新加载卡密列表
                await this.loadProjectCardsForEdit(projectId, adminPassword);
                // 重新加载项目列表以更新统计
                await this.loadProjects();
            }
        } catch (error) {
            showToast(error.message || '添加卡密失败', 'error');
        }
    }

    async deleteCard(projectId, cardId, adminPassword) {
        if (!confirm('确定要删除这个卡密吗？')) {
            return;
        }

        try {
            const result = await API.projects.deleteCard(projectId, cardId, adminPassword);
            if (result.success) {
                showToast('卡密删除成功', 'success');
                // 重新加载卡密列表
                await this.loadProjectCardsForEdit(projectId, adminPassword);
                // 重新加载项目列表以更新统计
                await this.loadProjects();
            }
        } catch (error) {
            showToast(error.message || '删除卡密失败', 'error');
        }
    }

    async toggleProjectStatus(projectId, isActive, adminPassword) {
        try {
            const result = await API.projects.toggleStatus(projectId, isActive, adminPassword);
            if (result.success) {
                const statusText = $('#project-status-text');
                statusText.textContent = isActive ? '项目已启用' : '项目已禁用';
                showToast(result.data.message, 'success');
                // 更新当前编辑项目的状态
                this.currentEditProject.isActive = isActive;
                // 重新加载项目列表
                await this.loadProjects();
            }
        } catch (error) {
            // 恢复开关状态
            const statusToggle = $('#project-status-toggle');
            statusToggle.checked = !isActive;
            showToast(error.message || '更新项目状态失败', 'error');
        }
    }

    async updateProjectDescription() {
        if (!this.currentEditProject) return;

        const descriptionTextarea = $('#edit-project-description');
        const newDescription = descriptionTextarea.value.trim();
        const projectId = this.currentEditProject.id;
        const adminPassword = this.currentEditProject.adminPassword;

        try {
            const result = await API.projects.update(projectId, {
                adminPassword,
                description: newDescription
            });

            if (result.success) {
                showToast('项目描述更新成功', 'success');
                // 更新当前编辑项目的描述
                this.currentEditProject.description = newDescription;
                // 重新加载项目列表
                await this.loadProjects();
            }
        } catch (error) {
            showToast(error.message || '更新项目描述失败', 'error');
        }
    }

    closeEditProjectModal() {
        const modal = $('#edit-project-modal');
        modal.style.display = 'none';
        this.currentEditProject = null;
    }

    async deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        // 先询问管理密码
        const adminPassword = prompt(`请输入项目 "${project.name}" 的管理密码：`);
        if (!adminPassword) {
            return; // 用户取消
        }

        if (confirm(`确定要删除项目 "${project.name}" 吗？此操作不可恢复。`)) {
            try {
                const result = await API.projects.delete(projectId, { adminPassword });
                if (result.success) {
                    showToast('项目删除成功', 'success');
                    this.loadProjects();
                }
            } catch (error) {
                // 特殊处理管理密码错误
                if (error.message.includes('管理密码错误') || error.message.includes('401')) {
                    showToast('管理密码错误，请重新输入', 'error');
                } else {
                    showToast(error.message || '删除项目失败', 'error');
                }
            }
        }
    }

    // 卡密领取相关方法
    showPasswordForm() {
        hide('#claim-result');
        show('#password-form');
        $('#claim-password').value = '';
        $('#claim-password').focus();
    }

    async handlePasswordVerify(e) {
        e.preventDefault();

        const password = $('#claim-password').value;
        if (!password) {
            showToast('请输入密码', 'error');
            return;
        }

        try {
            const result = await API.claim.verifyPassword(this.currentProject, password);

            if (result.success && result.data.valid) {
                // 密码正确，尝试领取卡密
                await this.attemptClaimCard(password);
            } else {
                showToast('密码错误', 'error');
                $('#claim-password').value = '';
                $('#claim-password').focus();
            }

        } catch (error) {
            // 错误已在 API 层处理
        }
    }

    async attemptClaimCard(password) {
        try {
            // 检查 Turnstile 验证
            if (window.TurnstileManager.isEnabled && !window.TurnstileManager.isVerified()) {
                showToast('请完成安全验证', 'error');
                return;
            }

            // 准备请求数据
            const claimData = { password };

            // 添加 Turnstile 验证数据
            if (window.TurnstileManager.isEnabled) {
                const turnstileData = window.TurnstileManager.getVerificationData();
                Object.assign(claimData, turnstileData);
            }

            const result = await API.claim.claimCard(this.currentProject, claimData);

            if (result.success && result.data.success) {
                this.showClaimSuccess(result.data);
                // 隐藏 Turnstile 组件
                this.hideClaimTurnstileWidget();
            } else {
                this.showClaimError(result.data.message || '领取失败');
                // 重置 Turnstile
                window.TurnstileManager.reset();
            }

        } catch (error) {
            this.showClaimError('领取失败，请重试');
            // 重置 Turnstile
            window.TurnstileManager.reset();
        }
    }

    showClaimSuccess(claimData) {
        hide('#password-form');
        show('#claim-result');
        show('#claim-success');
        hide('#claim-error');

        const cardDisplay = $('#claimed-card');
        if (cardDisplay) {
            cardDisplay.textContent = claimData.card;
        }

        // 如果是重复领取，显示提示
        if (claimData.alreadyClaimed) {
            showToast('您之前已经领取过了', 'info');
        } else {
            showToast('领取成功！', 'success');
        }
    }

    showClaimError(message) {
        hide('#password-form');
        show('#claim-result');
        hide('#claim-success');
        show('#claim-error');

        const errorMessage = $('#error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }

    copyClaimedCard() {
        const cardDisplay = $('#claimed-card');
        if (cardDisplay && cardDisplay.textContent) {
            copyToClipboard(cardDisplay.textContent);
        }
    }

    // 设置卡密导入功能
    setupCardImport() {
        // 初始化计数
        this.updateCardsCount();
    }

    // 处理卡密导入（解析文本框内容）
    handleCardImport() {
        const cardsInput = $('#cards-input');
        if (!cardsInput) return;

        const content = cardsInput.value.trim();
        if (!content) {
            this.showMessage('请先输入卡密内容', 'warning');
            return;
        }

        // 根据当前格式解析内容
        const activeTab = $('.tab-btn.active');
        const format = activeTab?.dataset.format || 'text';

        let cards = [];
        let errorMessage = '';

        try {
            switch (format) {
                case 'text':
                    cards = content.split('\n')
                        .map(line => line.trim())
                        .filter(line => line);
                    break;

                case 'csv':
                    cards = content.split(/[,，]/)
                        .map(item => item.trim())
                        .filter(item => item);
                    break;

                case 'json':
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        cards = parsed;
                    } else {
                        cards = [parsed];
                    }
                    break;

                default:
                    cards = content.split('\n')
                        .map(line => line.trim())
                        .filter(line => line);
            }

            // 去重处理
            const removeDuplicates = $('#remove-duplicates')?.checked;
            if (removeDuplicates) {
                const originalCount = cards.length;
                cards = [...new Set(cards.map(card =>
                    typeof card === 'string' ? card : JSON.stringify(card)
                ))].map(card => {
                    try {
                        return JSON.parse(card);
                    } catch {
                        return card;
                    }
                });
                const duplicateCount = originalCount - cards.length;
                if (duplicateCount > 0) {
                    this.showMessage(`已去除 ${duplicateCount} 条重复卡密`, 'info');
                }
            }

            // 存储到内存（这里可以扩展为存储到变量或进行其他处理）
            this.importedCards = cards;

            this.showMessage(`成功导入 ${cards.length} 条卡密`, 'success');
            this.updateCardsCount();
            this.displayImportedCards();

        } catch (error) {
            errorMessage = `解析失败：${error.message}`;
            this.showMessage(errorMessage, 'error');
        }
    }

    // 显示导入的卡密列表
    displayImportedCards() {
        const listContainer = $('#imported-cards-list');
        const cardsContainer = $('#cards-container');
        const countSpan = $('#imported-count');

        if (!listContainer || !cardsContainer || !countSpan) return;

        if (!this.importedCards || this.importedCards.length === 0) {
            listContainer.style.display = 'none';
            return;
        }

        // 显示列表容器
        listContainer.style.display = 'block';

        // 更新计数
        countSpan.textContent = this.importedCards.length;

        // 清空现有内容
        cardsContainer.innerHTML = '';

        // 生成卡密项
        this.importedCards.forEach((card, index) => {
            const cardItem = document.createElement('div');
            cardItem.className = 'card-item';
            cardItem.innerHTML = `
                <div class="card-content">${this.escapeHtml(String(card))}</div>
                <button class="card-delete" onclick="window.app.deleteImportedCard(${index})">删除</button>
            `;
            cardsContainer.appendChild(cardItem);
        });
    }

    // 删除单个导入的卡密
    deleteImportedCard(index) {
        if (!this.importedCards || index < 0 || index >= this.importedCards.length) {
            return;
        }

        // 从数组中删除
        this.importedCards.splice(index, 1);

        // 重新显示列表
        this.displayImportedCards();

        // 更新计数
        this.updateCardsCount();

        this.showMessage('已删除卡密', 'info');
    }

    // 清空所有导入的卡密
    clearImportedCards() {
        if (!this.importedCards || this.importedCards.length === 0) {
            this.showMessage('没有可清空的卡密', 'warning');
            return;
        }

        if (confirm(`确定要清空所有 ${this.importedCards.length} 条导入的卡密吗？`)) {
            this.importedCards = [];
            this.displayImportedCards();
            this.updateCardsCount();
            this.showMessage('已清空所有导入的卡密', 'info');
        }
    }

    // HTML 转义函数
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 更新卡密计数
    updateCardsCount() {
        const countDisplay = $('#cardsCount');

        if (!countDisplay) return;

        // 只计算导入列表中的卡密数量
        const importedCount = this.importedCards ? this.importedCards.length : 0;

        if (importedCount === 0) {
            countDisplay.textContent = '0 条卡密';
        } else {
            countDisplay.textContent = `${importedCount} 条卡密 (已导入)`;
        }
    }

    // 显示消息提示
    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;

        // 添加样式
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideInRight 0.3s ease;
        `;

        // 根据类型设置颜色
        switch (type) {
            case 'success':
                messageEl.style.backgroundColor = '#10b981';
                break;
            case 'error':
                messageEl.style.backgroundColor = '#ef4444';
                break;
            case 'warning':
                messageEl.style.backgroundColor = '#f59e0b';
                break;
            default:
                messageEl.style.backgroundColor = '#3b82f6';
        }

        // 添加到页面
        document.body.appendChild(messageEl);

        // 3秒后自动移除
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => {
                    messageEl.remove();
                }, 300);
            }
        }, 3000);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CDKApp();
});

// 添加模态框样式
const modalStyles = `
<style>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background: white;
    border-radius: var(--border-radius);
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
    margin: 0;
    color: var(--dark-color);
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--secondary-color);
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-close:hover {
    color: var(--dark-color);
}

.modal-body {
    padding: 1.5rem;
}

.stats-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
    text-align: center;
}

.claim-history h4 {
    margin-bottom: 1rem;
    color: var(--dark-color);
}

.claim-record {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
}

.claim-time {
    color: var(--secondary-color);
}

.claim-user {
    font-weight: 500;
    color: var(--info-color);
}

.claim-card {
    font-family: monospace;
    word-break: break-all;
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: var(--light-color);
    border-radius: 4px;
    overflow: hidden;
    margin: 1rem 0;
}

.progress-fill {
    height: 100%;
    background: var(--primary-color);
    transition: width 0.3s ease;
}

.project-meta {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
    color: var(--secondary-color);
    font-size: 0.875rem;
}

@media (max-width: 768px) {
    .stats-summary {
        grid-template-columns: repeat(2, 1fr);
    }

    .claim-record {
        grid-template-columns: 1fr;
        gap: 0.5rem;
    }
}
</style>
`;

// 添加样式到页面
document.head.insertAdjacentHTML('beforeend', modalStyles);

// 全局函数
function importCards() {
    if (window.app) {
        window.app.handleCardImport();
    }
}

function clearCards() {
    const cardsInput = $('#cards-input');
    if (cardsInput) {
        if (cardsInput.value.trim() && !confirm('确定要清空所有卡密内容吗？')) {
            return;
        }
        cardsInput.value = '';
        if (window.app) {
            window.app.importedCards = [];
            window.app.updateCardsCount();
            window.app.showMessage('已清空卡密内容', 'info');
        }
    }
}

function clearImportedCards() {
    if (window.app) {
        window.app.clearImportedCards();
    }
}

// Add admin methods to CDKApp class
CDKApp.prototype.loadAdminData = async function() {
    try {
        // Load user statistics
        const statsResponse = await API.admin.getUserStats();
        if (statsResponse.success) {
            const stats = statsResponse.data;
            $('#admin-total-users').textContent = stats.totalUsers;
            $('#admin-active-users').textContent = stats.activeUsers;
            $('#admin-banned-users').textContent = stats.bannedUsers;
        }

        // Load users list
        const usersResponse = await API.admin.getUsers();
        if (usersResponse.success) {
            this.displayUsersList(usersResponse.data);
        }
    } catch (error) {
        console.error('Load admin data error:', error);
        showToast('加载管理员数据失败', 'error');
    }
};

CDKApp.prototype.displayUsersList = function(users) {
    const usersListEl = $('#users-list');
    const usersLoadingEl = $('#users-loading');

    if (!usersListEl) {
        return;
    }

    // Hide loading indicator
    if (usersLoadingEl) {
        usersLoadingEl.style.display = 'none';
    }

    if (users.length === 0) {
        usersListEl.innerHTML = '<p class="empty-state">暂无用户</p>';
        return;
    }

    const html = users.map(user => {
        const statusClass = user.isBanned ? 'banned' : 'active';
        const statusText = user.isBanned ? '已封禁' : '正常';
        const actionButton = user.isBanned
            ? `<button class="btn btn-success btn-sm" onclick="app.unbanUser('${user.userId}')">解除封禁</button>`
            : `<button class="btn btn-danger btn-sm" onclick="app.banUser('${user.userId}', '${user.username}')">封禁</button>`;

        const banReasonHtml = user.isBanned && user.banReason
            ? `<div class="ban-reason">封禁原因: ${user.banReason}</div>`
            : '';

        const avatarHtml = user.avatarUrl
            ? `<img src="${user.avatarUrl}" alt="${user.username}" class="user-avatar-admin">`
            : `<div class="user-avatar-placeholder">${user.username.charAt(0).toUpperCase()}</div>`;

        return `
            <div class="user-card ${user.isBanned ? 'banned' : ''}">
                ${avatarHtml}
                <div class="user-info-admin">
                    <div class="user-name-admin">${user.name || user.username}</div>
                    <div class="user-username-admin">@${user.username}</div>
                    <div class="user-meta">
                        <span>用户ID: ${user.userId}</span>
                        <span>最后登录: ${new Date(user.lastLoginAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <span class="user-status ${statusClass}">${statusText}</span>
                    ${banReasonHtml}
                </div>
                <div class="user-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    }).join('');
    usersListEl.innerHTML = html;
};

CDKApp.prototype.banUser = async function(userId, username) {
    const reason = prompt(`确定要封禁用户 ${username} 吗？\n请输入封禁原因(可选):`);

    if (reason === null) return; // User cancelled

    try {
        const response = await API.admin.banUser(userId, reason || undefined);
        if (response.success) {
            showToast(response.data.message || '封禁成功', 'success');
            await this.loadAdminData();
        } else {
            showToast(response.error || '封禁失败', 'error');
        }
    } catch (error) {
        console.error('Ban user error:', error);
        showToast('封禁用户失败', 'error');
    }
};

CDKApp.prototype.unbanUser = async function(userId) {
    if (!confirm('确定要解除封禁吗？')) return;

    try {
        const response = await API.admin.unbanUser(userId);
        if (response.success) {
            showToast(response.data.message || '解除封禁成功', 'success');
            await this.loadAdminData();
        } else {
            showToast(response.error || '解除封禁失败', 'error');
        }
    } catch (error) {
        console.error('Unban user error:', error);
        showToast('解除封禁失败', 'error');
    }
};
