# 🚀 CDK 快速部署指南（单Worker版）

## 🎯 解决问题

✅ **修复了 "Missing API key" 错误**  
✅ **添加了详细日志功能**  
✅ **简化了部署流程**  

## 📋 部署步骤

### 1. 创建 KV 存储

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **KV**
3. 点击 **Create a namespace**
4. 名称：`CDK`
5. 点击 **Add**

### 2. 部署 Worker

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
⚠️ 需要先配置 KV namespace ID
```bash
cd workers
npm install
# 编辑 wrangler.toml，填入实际的 KV namespace ID
npm run deploy
```

### 3. 绑定 KV 存储

部署后：
1. 进入 Worker 设置页面
2. **Settings** → **Variables** → **KV Namespace Bindings**
3. 点击 **Add binding**：
   - **Variable name**: `CDK`
   - **KV namespace**: 选择 `CDK`
4. 点击 **Save and deploy**

### 4. 🔐 配置 LinuxDoConnect OAuth 认证（必需）

⚠️ **重要：v3.0 版本已集成 LinuxDoConnect 认证，必须配置才能使用**

#### 4.1 申请 LinuxDo OAuth 应用

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

### 7. 开启日志功能

1. 在 Worker 页面点击 **Logs** 标签
2. 点击 **Begin log stream**
3. 现在可以实时查看详细日志

## 🔍 日志功能

现在系统会记录详细日志：

```
[2024-01-01T12:00:00.000Z] GET /api/projects
[STATIC] 请求静态文件: /styles/main.css
[API] 初始化服务，处理API请求: /api/projects
```

包含信息：
- 请求时间和方法
- 请求路径
- 用户IP和国家
- 静态文件处理
- API 请求处理

## ✅ 验证部署

### 1. 访问首页
```
https://your-worker-domain.workers.dev/
```

### 2. 检查健康状态
```
https://your-worker-domain.workers.dev/api/health
```

### 3. 查看日志
在 Cloudflare Dashboard 的 Worker Logs 中查看实时日志

## 🔧 已修复的问题

### ❌ 之前的错误
```json
{
  "error": "Missing API key",
  "message": "缺少 API 密钥"
}
```

### ✅ 现在的状态
- **API 密钥验证已禁用**（简化小项目）
- **详细日志记录**
- **单Worker架构**
- **零配置部署**

## 🎯 架构优势

| 特性 | 状态 |
|------|------|
| 部署复杂度 | ✅ 极简 |
| API 密钥 | ✅ 已禁用 |
| CORS 配置 | ✅ 无需配置 |
| 日志功能 | ✅ 详细记录 |
| 域名数量 | ✅ 只需1个 |
| 维护成本 | ✅ 极低 |

## 🚨 故障排除

### 问题 1: 界面部署失败 - "Missing entry-point"
**原因**: Root directory 设置错误
**解决**:
- 确保 Root directory 设置为 `workers`
- 不要设置为根目录 `/` 或 `frontend`
- 单Worker架构需要从 workers 目录开始构建

### 问题 2: Worker 部署失败
**解决**: 检查 `wrangler.toml` 和网络连接

### 问题 3: KV 绑定错误
**解决**: 确保 KV 命名空间名称为 `CDK`

### 问题 4: 静态文件 404
**解决**: 运行 `npm run build:all` 重新构建

### 问题 5: 看不到日志
**解决**: 在 Worker 页面点击 "Begin log stream"

## 🔄 可选功能

当前版本为简化部署已禁用API密钥验证。如需启用高级安全功能，请参考代码中的注释说明。

## 🎉 完成！

现在您的 CDK 系统：
- ✅ 单Worker架构，极简部署
- ✅ LinuxDoConnect OAuth 认证
- ✅ 详细日志功能
- ✅ 全站登录保护
- ✅ 完整功能支持

访问您的 Worker 域名即可使用！

## 🔐 认证系统说明

### 功能特性

- **全站强制登录**: 所有页面访问前必须通过 LinuxDo 登录
- **会话管理**: 基于 Cloudflare KV 的安全会话存储
- **自动跳转**: 未登录用户自动跳转到登录页面
- **用户信息显示**: 导航栏显示用户头像、用户名
- **会话有效期**: 默认 7 天，可在后端配置

### 认证流程

1. 用户访问网站 → 检测未登录 → 显示登录页面
2. 点击"使用 Linux.do 登录" → 跳转到 Linux.do 授权页面
3. 用户授权 → 回调到 `/api/auth/callback`
4. 后端获取用户信息 → 创建会话 → 设置 Cookie
5. 跳转回首页 → 显示用户信息 → 可正常使用

### API 端点

- `GET /api/auth/login` - 获取登录 URL
- `GET /api/auth/callback` - OAuth 回调处理
- `GET /api/auth/userinfo` - 获取当前用户信息
- `POST /api/auth/logout` - 登出

### 安全说明

- ✅ `Client Secret` 仅在后端使用，不暴露给前端
- ✅ 会话 ID 通过 HttpOnly Cookie 传输，防止 XSS
- ✅ 所有 API 请求需要有效会话
- ✅ 会话自动过期，需重新登录

### 故障排除

**问题: 登录后跳转到 404**
- 检查 `LINUXDO_REDIRECT_URI` 是否正确
- 确保回调地址与 OAuth 应用配置一致

**问题: 一直提示未登录**
- 检查浏览器是否禁用 Cookie
- 查看 Worker 日志确认会话创建成功
- 确认 KV 存储已正确绑定

**问题: 授权后显示错误**
- 检查 `LINUXDO_CLIENT_ID` 和 `LINUXDO_CLIENT_SECRET` 是否正确
- 查看 Worker 日志获取详细错误信息
