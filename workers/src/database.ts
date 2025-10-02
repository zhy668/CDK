/**
 * D1 Database Service for CDK System
 * 替代 KVService，大幅减少操作次数，提升性能
 */

import { Project, Card, ClaimRecord, ProjectStats, User, UserStats } from '../shared/types';
import { generateId } from '../shared/utils';

export class DatabaseService {
  constructor(private db: D1Database) {}

  // ============================================
  // Project Operations
  // ============================================

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = generateId();
    const now = new Date().toISOString();

    const newProject: Project = {
      ...project,
      id,
      createdAt: now,
      updatedAt: now,
      totalCards: 0,
      claimedCards: 0
    };

    await this.db.prepare(`
      INSERT INTO projects (id, name, password, admin_password, description, is_active, limit_one_per_user, total_cards, claimed_cards, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newProject.id,
      newProject.name,
      newProject.password,
      newProject.adminPassword,
      newProject.description || null,
      newProject.isActive ? 1 : 0,
      newProject.limitOnePerUser ? 1 : 0,
      newProject.totalCards,
      newProject.claimedCards,
      newProject.createdAt,
      newProject.updatedAt
    ).run();

    return newProject;
  }

  async getProject(id: string): Promise<Project | null> {
    const result = await this.db.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(id).first();

    if (!result) return null;

    return this.mapToProject(result);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const project = await this.getProject(id);
    if (!project) return null;

    const updatedProject = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.db.prepare(`
      UPDATE projects
      SET name = ?, password = ?, admin_password = ?, description = ?,
          is_active = ?, limit_one_per_user = ?, total_cards = ?, claimed_cards = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      updatedProject.name,
      updatedProject.password,
      updatedProject.adminPassword,
      updatedProject.description || null,
      updatedProject.isActive ? 1 : 0,
      updatedProject.limitOnePerUser ? 1 : 0,
      updatedProject.totalCards,
      updatedProject.claimedCards,
      updatedProject.updatedAt,
      id
    ).run();

    return updatedProject;
  }

  async deleteProject(id: string): Promise<boolean> {
    const project = await this.getProject(id);
    if (!project) return false;

    // D1 会自动级联删除相关的 cards 和 claim_records（因为有 FOREIGN KEY ON DELETE CASCADE）
    await this.db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();

    return true;
  }

  async getAllProjects(): Promise<Project[]> {
    const result = await this.db.prepare(`
      SELECT * FROM projects ORDER BY created_at DESC
    `).all();

    return result.results.map(row => this.mapToProject(row));
  }

  async getProjectList(): Promise<string[]> {
    const result = await this.db.prepare(`
      SELECT id FROM projects ORDER BY created_at DESC
    `).all();

    return result.results.map(row => row.id as string);
  }

  // ============================================
  // Card Operations
  // ============================================

  async addCards(projectId: string, cards: string[]): Promise<number> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    // 批量插入卡密 - 使用事务提高性能
    const statements = cards.map(content => {
      const cardId = generateId();
      return this.db.prepare(`
        INSERT INTO cards (id, project_id, content, is_claimed)
        VALUES (?, ?, ?, 0)
      `).bind(cardId, projectId, content);
    });

    // 执行批量插入
    await this.db.batch(statements);

    // 更新项目总卡密数
    const newTotal = project.totalCards + cards.length;
    await this.updateProject(projectId, { totalCards: newTotal });

    return cards.length;
  }

  async getProjectCards(projectId: string): Promise<string[]> {
    const result = await this.db.prepare(`
      SELECT id FROM cards WHERE project_id = ?
    `).bind(projectId).all();

    return result.results.map(row => row.id as string);
  }

  async getCard(projectId: string, cardId: string): Promise<Card | null> {
    const result = await this.db.prepare(`
      SELECT * FROM cards WHERE project_id = ? AND id = ?
    `).bind(projectId, cardId).first();

    if (!result) return null;

    return this.mapToCard(result);
  }

  async deleteCard(projectId: string, cardId: string): Promise<boolean> {
    const card = await this.getCard(projectId, cardId);
    if (!card || card.isClaimed) return false;

    await this.db.prepare(`DELETE FROM cards WHERE id = ?`).bind(cardId).run();

    // 更新项目总卡密数
    const project = await this.getProject(projectId);
    if (project) {
      await this.updateProject(projectId, {
        totalCards: project.totalCards - 1
      });
    }

    return true;
  }

  /**
   * 随机获取可用卡密 - 性能优化版本
   * 从 O(N) 遍历优化到 O(1) 索引查询
   */
  async getRandomAvailableCard(projectId: string): Promise<string | null> {
    const result = await this.db.prepare(`
      SELECT id FROM cards 
      WHERE project_id = ? AND is_claimed = 0 
      ORDER BY RANDOM() 
      LIMIT 1
    `).bind(projectId).first();

    return result ? (result.id as string) : null;
  }

  /**
   * 领取卡密 - 使用事务保证原子性
   */
  async claimCard(projectId: string, cardId: string, ipHash: string, username?: string): Promise<Card | null> {
    const card = await this.getCard(projectId, cardId);
    if (!card || card.isClaimed) return null;

    const now = new Date().toISOString();
    const claimRecordId = generateId();

    // 使用批量操作模拟事务
    await this.db.batch([
      // 更新卡密状态
      this.db.prepare(`
        UPDATE cards 
        SET is_claimed = 1, claimed_at = ?, claimed_by = ?
        WHERE id = ? AND is_claimed = 0
      `).bind(now, ipHash, cardId),
      
      // 插入领取记录
      this.db.prepare(`
        INSERT INTO claim_records (id, project_id, card_content, claimed_at, ip_hash, username)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(claimRecordId, projectId, card.content, now, ipHash, username || null),
      
      // 更新项目已领取数量
      this.db.prepare(`
        UPDATE projects 
        SET claimed_cards = claimed_cards + 1
        WHERE id = ?
      `).bind(projectId)
    ]);

    return {
      ...card,
      isClaimed: true,
      claimedAt: now,
      claimedBy: ipHash
    };
  }

  // ============================================
  // Claim Operations
  // ============================================

  /**
   * 检查用户是否已领取 - 性能优化版本
   * 使用唯一索引，从 O(N) 优化到 O(1)
   */
  async hasUserClaimed(projectId: string, ipHash: string): Promise<ClaimRecord | null> {
    const result = await this.db.prepare(`
      SELECT * FROM claim_records 
      WHERE project_id = ? AND ip_hash = ?
    `).bind(projectId, ipHash).first();

    if (!result) return null;

    return this.mapToClaimRecord(result);
  }

  /**
   * 获取项目统计信息 - 性能优化版本
   * 直接从 projects 表读取，避免遍历所有卡密
   */
  async getProjectStats(projectId: string): Promise<ProjectStats | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    // 获取领取历史（限制数量避免过大）
    const claimHistory = await this.db.prepare(`
      SELECT * FROM claim_records 
      WHERE project_id = ? 
      ORDER BY claimed_at DESC 
      LIMIT 100
    `).bind(projectId).all();

    return {
      projectId,
      totalCards: project.totalCards,
      claimedCards: project.claimedCards,
      remainingCards: project.totalCards - project.claimedCards,
      claimHistory: claimHistory.results.map(row => this.mapToClaimRecord(row))
    };
  }

  // ============================================
  // User Management Operations
  // ============================================

  async createOrUpdateUser(userData: Partial<User> & { userId: string; username: string }): Promise<User> {
    const existingUser = await this.getUser(userData.userId);
    const now = new Date().toISOString();

    const user: User = {
      userId: userData.userId,
      username: userData.username,
      name: userData.name || undefined,
      avatarUrl: userData.avatarUrl || undefined,
      isBanned: existingUser?.isBanned || false,
      bannedAt: existingUser?.bannedAt,
      bannedBy: existingUser?.bannedBy,
      banReason: existingUser?.banReason,
      createdAt: existingUser?.createdAt || now,
      lastLoginAt: now
    };

    if (existingUser) {
      // 更新现有用户
      await this.db.prepare(`
        UPDATE users 
        SET username = ?, name = ?, avatar_url = ?, last_login_at = ?
        WHERE user_id = ?
      `).bind(user.username, user.name, user.avatarUrl, user.lastLoginAt, user.userId).run();
    } else {
      // 创建新用户
      await this.db.prepare(`
        INSERT INTO users (user_id, username, name, avatar_url, is_banned, created_at, last_login_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).bind(user.userId, user.username, user.name, user.avatarUrl, user.createdAt, user.lastLoginAt).run();
    }

    return user;
  }

  async getUser(userId: string): Promise<User | null> {
    const result = await this.db.prepare(`
      SELECT * FROM users WHERE user_id = ?
    `).bind(userId).first();

    if (!result) return null;

    return this.mapToUser(result);
  }

  async getUserList(): Promise<string[]> {
    const result = await this.db.prepare(`
      SELECT user_id FROM users ORDER BY created_at DESC
    `).all();

    return result.results.map(row => row.user_id as string);
  }

  async getAllUsers(): Promise<User[]> {
    const result = await this.db.prepare(`
      SELECT * FROM users ORDER BY created_at DESC
    `).all();

    return result.results.map(row => this.mapToUser(row));
  }

  async banUser(userId: string, bannedBy: string, reason?: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    const now = new Date().toISOString();

    await this.db.prepare(`
      UPDATE users
      SET is_banned = 1, banned_at = ?, banned_by = ?, ban_reason = ?
      WHERE user_id = ?
    `).bind(now, bannedBy, reason || null, userId).run();

    return true;
  }

  async unbanUser(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    await this.db.prepare(`
      UPDATE users
      SET is_banned = 0, banned_at = NULL, banned_by = NULL, ban_reason = NULL
      WHERE user_id = ?
    `).bind(userId).run();

    return true;
  }

  async getUserStats(): Promise<UserStats> {
    const result = await this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_banned = 0 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as banned
      FROM users
    `).first();

    return {
      totalUsers: (result?.total as number) || 0,
      activeUsers: (result?.active as number) || 0,
      bannedUsers: (result?.banned as number) || 0
    };
  }

  // ============================================
  // Helper Methods - 数据映射
  // ============================================

  private mapToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      password: row.password,
      adminPassword: row.admin_password,
      description: row.description,
      isActive: row.is_active === 1,
      limitOnePerUser: row.limit_one_per_user === 1,
      totalCards: row.total_cards,
      claimedCards: row.claimed_cards,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToCard(row: any): Card {
    return {
      id: row.id,
      projectId: row.project_id,
      content: row.content,
      isClaimed: row.is_claimed === 1,
      claimedAt: row.claimed_at,
      claimedBy: row.claimed_by
    };
  }

  private mapToClaimRecord(row: any): ClaimRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      cardContent: row.card_content,
      claimedAt: row.claimed_at,
      ipHash: row.ip_hash,
      username: row.username
    };
  }

  private mapToUser(row: any): User {
    return {
      userId: row.user_id,
      username: row.username,
      name: row.name,
      avatarUrl: row.avatar_url,
      isBanned: row.is_banned === 1,
      bannedAt: row.banned_at,
      bannedBy: row.banned_by,
      banReason: row.ban_reason,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    };
  }
}

