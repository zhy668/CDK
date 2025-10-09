# CDK - 在线卡密分发系统 v3.1

基于 Cloudflare 构建的在线卡密分发系统，集成 **LinuxDoConnect OAuth 认证** 和 **D1 数据库**。

## ✨ 核心特性

- 🔐 **LinuxDoConnect 认证**: 全站强制登录，基于 Linux.do OAuth2 认证
- 🚀 **D1 数据库**: 高性能 SQL 数据库，大幅降低操作次数
- 🔒 **安全可靠**: IP 哈希、会话管理、OAuth2 认证
- 📊 **实时统计**: 领取记录、剩余数量实时更新
- 🎨 **现代界面**: 响应式设计，支持移动端
- ⚡ **极速部署**: 10分钟完成部署，零维护成本
- 📈 **高性能**: 性能提升 90%+，支持更大规模使用

## 🆕 v3.1 更新内容

### 🚀 迁移到 D1 数据库

- ✅ 使用 Cloudflare D1 (SQLite) 替代 KV 存储
- ✅ 性能提升 90%+，操作次数大幅减少
- ✅ 免费额度更充裕（每天 500 万次读取 vs 10 万次）
- ✅ 支持 1000-2000+ 张卡密的大规模分发
- ✅ 查询速度从 O(N) 优化到 O(1)
- ✅ 提供数据迁移脚本（从旧版 KV 迁移）

### 🔐 LinuxDoConnect OAuth 认证（v3.0）

- ✅ 全站强制登录保护
- ✅ 基于 Linux.do 的 OAuth2 认证
- ✅ 安全的会话管理（KV 存储，30天有效期）
- ✅ 用户信息显示（头像、用户名）
- ✅ 自动登录状态检查
- ✅ 优化KV写入，降低资源消耗

## 📋 快速部署

详见 [QUICK-DEPLOY.md](./QUICK-DEPLOY.md)

### 核心步骤

1. **创建 D1 数据库** - 使用 wrangler 或 Dashboard 创建并初始化
2. **创建 KV 存储** - 用于 Session 管理
3. **申请 LinuxDo OAuth 应用** - 获取 Client ID 和 Client Secret
4. **部署 Worker** - 通过 Git 或命令行部署
5. **绑定资源** - 绑定 D1 数据库和 KV 存储
6. **配置环境变量** - 设置 OAuth 凭证和回调地址
7. **验证部署** - 访问网站并完成登录

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
- ✅ Session固定30天有效期，优化KV资源使用

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
- ✅ 会话管理（30天有效期）
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
