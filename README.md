# CDK - 在线卡密分发系统 v3.0

基于 Cloudflare 构建的在线卡密分发系统，集成 **LinuxDoConnect OAuth 认证**。

## ✨ 核心特性

- 🔐 **LinuxDoConnect 认证**: 全站强制登录，基于 Linux.do OAuth2 认证
- 🚀 **单Worker架构**: Cloudflare Workers + KV 单Worker部署
- 🔒 **安全可靠**: IP 哈希、会话管理、Rate Limiting
- 📊 **实时统计**: 领取记录、剩余数量实时更新
- 🎨 **现代界面**: 响应式设计，支持移动端
- ⚡ **极速部署**: 5分钟完成部署，零维护成本

## 🆕 v3.0 更新内容

### 🔐 LinuxDoConnect OAuth 认证集成

- ✅ 全站强制登录保护
- ✅ 基于 Linux.do 的 OAuth2 认证
- ✅ 安全的会话管理（KV 存储）
- ✅ 用户信息显示（头像、用户名）
- ✅ 自动登录状态检查
- ✅ 会话有效期管理（默认 7 天）

## 📋 快速部署

详见 [QUICK-DEPLOY.md](./QUICK-DEPLOY.md)

### 核心步骤

1. **申请 LinuxDo OAuth 应用** - 获取 Client ID 和 Client Secret
2. **创建 KV 存储** - 在 Cloudflare Dashboard 创建 CDK 命名空间
3. **部署 Worker** - 通过 Git 或命令行部署
4. **配置环境变量** - 设置 OAuth 凭证和回调地址
5. **绑定 KV** - 将 KV 存储绑定到 Worker
6. **验证部署** - 访问网站并完成登录

## 📝 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `LINUXDO_CLIENT_ID` | ✅ | LinuxDo OAuth Client ID |
| `LINUXDO_CLIENT_SECRET` | ✅ | LinuxDo OAuth Client Secret |
| `LINUXDO_REDIRECT_URI` | ✅ | OAuth 回调地址 |
| `TURNSTILE_ENABLED` | ❌ | 是否启用 Turnstile 验证 |
| `TURNSTILE_SITE_KEY` | ❌ | Turnstile 站点密钥 |
| `TURNSTILE_SECRET_KEY` | ❌ | Turnstile 服务端密钥 |

## 🔐 安全说明

- ✅ `Client Secret` 仅在后端使用，不暴露给前端
- ✅ 会话 ID 通过 HttpOnly Cookie 传输，防止 XSS
- ✅ 所有 API 请求需要有效会话
- ✅ IP 地址哈希存储，不保存原始 IP
- ✅ Rate Limiting 防止暴力破解

## 🎯 使用场景

- 软件激活码分发
- 游戏 CDK 发放
- 优惠券批量分发
- 邀请码管理
- 测试账号分发

## 📊 功能特性

### 项目管理

- ✅ 创建项目（需登录）
- ✅ 批量导入卡密
- ✅ 项目密码保护
- ✅ 管理密码独立验证
- ✅ 项目启用/禁用
- ✅ 实时统计信息

### 卡密领取

- ✅ 密码验证
- ✅ IP 限制（一个 IP 只能领取一次）
- ✅ Turnstile 人机验证（可选）
- ✅ 领取记录追踪
- ✅ 一键复制卡密

### 安全防护

- ✅ 全站登录保护
- ✅ OAuth2 认证
- ✅ 会话管理
- ✅ Rate Limiting
- ✅ IP 哈希存储
- ✅ Turnstile 验证（可选）

## 🚨 故障排除

### 登录相关

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

详见 [QUICK-DEPLOY.md](./QUICK-DEPLOY.md)

## 📄 许可证

MIT License

---

**注意**: 本项目需要配置 LinuxDoConnect OAuth 才能使用。请确保已正确配置所有必需的环境变量。
