# 🚀 CDK 快速部署指南（D1 数据库版）

## 🎯 v3.1 更新

✅ **迁移到 D1 数据库，大幅降低 KV 操作次数**
✅ **性能提升 90%+，免费额度更充裕**
✅ **支持更大规模的卡密分发**

## 📋 部署步骤

### 1. 创建 D1 数据库

**方式一：命令行创建（推荐）**
```bash
cd workers

# 1. 创建 D1 数据库
wrangler d1 create cdk-database

# 2. 记录输出的 database_id，稍后需要配置

# 3. 初始化数据库表结构
wrangler d1 execute cdk-database --file=./schema.sql

# 4. 验证数据库创建成功
wrangler d1 execute cdk-database --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**方式二：Dashboard 创建**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **D1**
3. 点击 **Create database**
4. 名称：`cdk-database`
5. 点击 **Create**
6. 进入数据库详情页，点击 **Console**
7. 复制 `workers/schema.sql` 的内容并执行

### 2. 创建 KV 存储（用于 Session）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **KV**
3. 点击 **Create a namespace**
4. 名称：`CDK_KV`
5. 点击 **Add**

### 3. 部署 Worker

**方式一：界面部署（推荐）**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **Create application** → **Workers** → **Connect to Git**
3. 选择您的 CDK 仓库
4. 配置设置：
   - **Project name**: `cdk`
   - **Root directory**: `workers` ⚠️ **重要：必须设置为 workers**
   - **Build command**: 留空
   - **Build output directory**: 留空
5. 点击 **Save and Deploy**

**方式二：命令行部署**
```bash
cd workers
npm install
npm run deploy
```

### 4. 绑定 D1 数据库和 KV 存储

部署后：

**4.1 绑定 D1 数据库**
1. 进入 Worker 设置页面
2. **Settings** → **Variables** → **D1 Database Bindings**
3. 点击 **Add binding**：
   - **Variable name**: `CDK_DB`
   - **D1 database**: 选择 `cdk-database`
4. 点击 **Save**

**4.2 绑定 KV 存储**
1. 在同一页面，找到 **KV Namespace Bindings**
2. 点击 **Add binding**：
   - **Variable name**: `CDK_KV`
   - **KV namespace**: 选择 `CDK_KV`
3. 点击 **Save and deploy**

### 5. 🔐 配置 LinuxDoConnect OAuth 认证（必需）

⚠️ **重要：v3.0+ 版本已集成 LinuxDoConnect 认证，必须配置才能使用**

#### 5.1 申请 LinuxDo OAuth 应用

1. 访问 [Linux.do](https://linux.do) 并登录
2. 进入开发者设置（具体路径请参考 Linux.do 文档）
3. 创建新的 OAuth 应用
4. 填写应用信息：
   - **应用名称**: CDK 卡密分发系统
   - **回调地址**: `https://your-worker-domain.workers.dev/api/auth/callback`
     - 替换 `your-worker-domain` 为你的实际 Worker 域名
     - 例如: `https://cdk.your-account.workers.dev/api/auth/callback`
5. 保存后获取 `Client ID` 和 `Client Secret`

#### 4.2 配置环境变量

在 Worker 设置中添加 OAuth 环境变量：
1. **Settings** → **Variables** → **Environment Variables**
2. 添加以下变量（注意：不要加引号）：
   ```bash
   LINUXDO_CLIENT_ID = your-client-id
   LINUXDO_CLIENT_SECRET = your-client-secret
   LINUXDO_REDIRECT_URI = https://your-worker-domain.workers.dev/api/auth/callback
   ```
3. ⚠️ **重要**：
   - `LINUXDO_CLIENT_SECRET` 是敏感信息，请妥善保管
   - `LINUXDO_REDIRECT_URI` 必须与 OAuth 应用中配置的回调地址完全一致
   - 使用 **Quick edit** 重新部署，避免删除环境变量

### 5. 可选：配置 Turnstile 安全验证

在 Worker 设置中添加环境变量（防止机器人攻击）：
1. 在 Cloudflare Dashboard → Turnstile 中创建站点，获取密钥
2. **Settings** → **Variables** → **Environment Variables**
3. 添加变量（注意：不要加引号）：
   ```bash
   TURNSTILE_ENABLED = true
   TURNSTILE_SITE_KEY = your-site-key
   TURNSTILE_SECRET_KEY = your-secret-key
   ```
4. ⚠️ **重要**：使用 **Quick edit** 重新部署，避免删除环境变量

### 6. 验证部署

1. 访问您的 Worker 域名（如：`https://cdk.your-account.workers.dev`）
2. 应该会看到登录页面，提示使用 Linux.do 登录
3. 点击登录按钮，跳转到 Linux.do 授权页面
4. 授权后会自动跳转回 CDK 系统，显示用户信息
5. 现在可以正常使用创建项目、管理项目等功能

## ✅ 验证部署

### 1. 访问首页
```
https://your-worker-domain.workers.dev/
```

### 2. 检查健康状态
```
https://your-worker-domain.workers.dev/api/health
```

访问您的 Worker 域名即可使用！

## 🔐 认证系统说明

### 功能特性

- **全站强制登录**: 所有页面访问前必须通过 LinuxDo 登录
- **会话管理**: 基于 Cloudflare KV 的安全会话存储
- **自动跳转**: 未登录用户自动跳转到登录页面
- **用户信息显示**: 导航栏显示用户头像、用户名
- **会话有效期**: 默认 7 天，可在后端配置

