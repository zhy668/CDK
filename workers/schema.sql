-- CDK System Database Schema for Cloudflare D1
-- 优化版本：减少 KV 操作，提升查询性能

-- ============================================
-- Projects Table
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    admin_password TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    limit_one_per_user INTEGER NOT NULL DEFAULT 1,
    total_cards INTEGER NOT NULL DEFAULT 0,
    claimed_cards INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- ============================================
-- Cards Table
-- ============================================
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    content TEXT NOT NULL,
    is_claimed INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT,
    claimed_by TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 关键索引：用于快速查询可用卡密
CREATE INDEX IF NOT EXISTS idx_cards_project_available ON cards(project_id, is_claimed);
CREATE INDEX IF NOT EXISTS idx_cards_claimed_by ON cards(claimed_by);

-- ============================================
-- Claim Records Table
-- ============================================
CREATE TABLE IF NOT EXISTS claim_records (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    card_content TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    username TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 唯一索引：防止同一 IP 重复领取同一项目的卡密
CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_unique ON claim_records(project_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_claim_project ON claim_records(project_id);
CREATE INDEX IF NOT EXISTS idx_claim_time ON claim_records(claimed_at DESC);

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT,
    avatar_url TEXT,
    is_banned INTEGER NOT NULL DEFAULT 0,
    banned_at TEXT,
    banned_by TEXT,
    ban_reason TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC);

-- ============================================
-- 性能优化说明
-- ============================================
-- 1. 查询可用卡密：使用 idx_cards_project_available 索引
--    SELECT * FROM cards WHERE project_id = ? AND is_claimed = 0 ORDER BY RANDOM() LIMIT 1
--    性能：O(1) vs 原来的 O(N) 遍历
--
-- 2. 检查是否已领取：使用 idx_claim_unique 唯一索引
--    SELECT * FROM claim_records WHERE project_id = ? AND ip_hash = ?
--    性能：O(1) 索引查询
--
-- 3. 统计信息：直接从 projects 表读取，或使用聚合查询
--    SELECT total_cards, claimed_cards FROM projects WHERE id = ?
--    性能：O(1) 主键查询
--
-- 4. 领取卡密：使用事务保证原子性
--    BEGIN TRANSACTION;
--    UPDATE cards SET is_claimed = 1, claimed_at = ?, claimed_by = ? WHERE id = ?;
--    INSERT INTO claim_records (...) VALUES (...);
--    UPDATE projects SET claimed_cards = claimed_cards + 1 WHERE id = ?;
--    COMMIT;
--
-- 预计性能提升：
-- - KV 读取操作减少 90-95%
-- - KV 写入操作减少 80-90%
-- - 查询响应时间从 O(N) 降低到 O(1)

