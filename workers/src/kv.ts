/**
 * KV data access layer for CDK system
 */

import { Project, Card, ClaimRecord, ProjectStats, User, UserStats, KV_KEYS } from '../shared/types';
import { generateId } from '../shared/utils';

export class KVService {
  constructor(private kv: KVNamespace) {}

  // Project operations
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

    await this.kv.put(KV_KEYS.PROJECT(id), JSON.stringify(newProject));
    
    // Add to project list
    const projectList = await this.getProjectList();
    projectList.push(id);
    await this.kv.put(KV_KEYS.PROJECT_LIST, JSON.stringify(projectList));

    return newProject;
  }

  async getProject(id: string): Promise<Project | null> {
    const data = await this.kv.get(KV_KEYS.PROJECT(id));
    return data ? JSON.parse(data) : null;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const project = await this.getProject(id);
    if (!project) return null;

    const updatedProject = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.kv.put(KV_KEYS.PROJECT(id), JSON.stringify(updatedProject));
    return updatedProject;
  }

  async deleteProject(id: string): Promise<boolean> {
    const project = await this.getProject(id);
    if (!project) return false;

    // Delete project
    await this.kv.delete(KV_KEYS.PROJECT(id));
    
    // Remove from project list
    const projectList = await this.getProjectList();
    const updatedList = projectList.filter(pid => pid !== id);
    await this.kv.put(KV_KEYS.PROJECT_LIST, JSON.stringify(updatedList));

    // Delete related data
    await this.kv.delete(KV_KEYS.PROJECT_CARDS(id));
    await this.kv.delete(KV_KEYS.PROJECT_STATS(id));

    return true;
  }

  async getProjects(): Promise<Project[]> {
    const projectList = await this.getProjectList();
    const projects: Project[] = [];

    for (const id of projectList) {
      const project = await this.getProject(id);
      if (project) {
        projects.push(project);
      }
    }

    return projects;
  }

  private async getProjectList(): Promise<string[]> {
    const data = await this.kv.get(KV_KEYS.PROJECT_LIST);
    return data ? JSON.parse(data) : [];
  }

  // Card operations
  async addCards(projectId: string, cards: string[]): Promise<number> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const existingCards = await this.getProjectCards(projectId);
    const cardIds: string[] = [];

    for (const content of cards) {
      const cardId = generateId();
      const card: Card = {
        id: cardId,
        projectId,
        content,
        isClaimed: false
      };

      cardIds.push(cardId);
      await this.kv.put(KV_KEYS.CARD(projectId, cardId), JSON.stringify(card));
    }

    // Update project cards list
    const allCardIds = [...existingCards, ...cardIds];
    await this.kv.put(KV_KEYS.PROJECT_CARDS(projectId), JSON.stringify(allCardIds));

    // Update project total cards count
    await this.updateProject(projectId, { 
      totalCards: allCardIds.length 
    });

    return cards.length;
  }

  async getProjectCards(projectId: string): Promise<string[]> {
    const data = await this.kv.get(KV_KEYS.PROJECT_CARDS(projectId));
    return data ? JSON.parse(data) : [];
  }

  async getCard(projectId: string, cardId: string): Promise<Card | null> {
    const data = await this.kv.get(KV_KEYS.CARD(projectId, cardId));
    return data ? JSON.parse(data) : null;
  }

  async deleteCard(projectId: string, cardId: string): Promise<boolean> {
    const card = await this.getCard(projectId, cardId);
    if (!card) return false;

    // 只能删除未领取的卡密
    if (card.isClaimed) return false;

    // 删除卡密
    await this.kv.delete(KV_KEYS.CARD(projectId, cardId));

    // 从项目卡密列表中移除
    const cardIds = await this.getProjectCards(projectId);
    const updatedCardIds = cardIds.filter(id => id !== cardId);
    await this.kv.put(KV_KEYS.PROJECT_CARDS(projectId), JSON.stringify(updatedCardIds));

    // 更新项目总卡密数
    const project = await this.getProject(projectId);
    if (project) {
      await this.updateProject(projectId, {
        totalCards: updatedCardIds.length
      });
    }

    return true;
  }

  async claimCard(projectId: string, cardId: string, ipHash: string, username?: string): Promise<Card | null> {
    const card = await this.getCard(projectId, cardId);
    if (!card || card.isClaimed) return null;

    const claimedCard: Card = {
      ...card,
      isClaimed: true,
      claimedAt: new Date().toISOString(),
      claimedBy: ipHash
    };

    await this.kv.put(KV_KEYS.CARD(projectId, cardId), JSON.stringify(claimedCard));

    // Record claim
    const claimRecord: ClaimRecord = {
      id: generateId(),
      projectId,
      cardContent: card.content,
      claimedAt: claimedCard.claimedAt!,
      ipHash,
      username
    };

    await this.kv.put(KV_KEYS.CLAIM(projectId, ipHash), JSON.stringify(claimRecord));

    // Update project claimed count
    const project = await this.getProject(projectId);
    if (project) {
      await this.updateProject(projectId, {
        claimedCards: project.claimedCards + 1
      });
    }

    return claimedCard;
  }

  async getRandomAvailableCard(projectId: string): Promise<string | null> {
    const cardIds = await this.getProjectCards(projectId);
    const availableCards: string[] = [];

    for (const cardId of cardIds) {
      const card = await this.getCard(projectId, cardId);
      if (card && !card.isClaimed) {
        availableCards.push(cardId);
      }
    }

    if (availableCards.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * availableCards.length);
    return availableCards[randomIndex];
  }

  // Claim operations
  async hasUserClaimed(projectId: string, ipHash: string): Promise<ClaimRecord | null> {
    const data = await this.kv.get(KV_KEYS.CLAIM(projectId, ipHash));
    return data ? JSON.parse(data) : null;
  }

  // Statistics
  async getProjectStats(projectId: string): Promise<ProjectStats | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const cardIds = await this.getProjectCards(projectId);
    let claimedCount = 0;
    const claimHistory: ClaimRecord[] = [];

    for (const cardId of cardIds) {
      const card = await this.getCard(projectId, cardId);
      if (card && card.isClaimed && card.claimedBy) {
        claimedCount++;
        const claimRecord = await this.hasUserClaimed(projectId, card.claimedBy);
        if (claimRecord) {
          claimHistory.push(claimRecord);
        }
      }
    }

    // Sync project claimed count if it's different
    if (project.claimedCards !== claimedCount) {
      await this.updateProject(projectId, {
        claimedCards: claimedCount
      });
    }

    return {
      projectId,
      totalCards: cardIds.length,
      claimedCards: claimedCount,
      remainingCards: cardIds.length - claimedCount,
      claimHistory
    };
  }

  // User Management operations
  async createOrUpdateUser(userData: Partial<User> & { userId: string; username: string }): Promise<User> {
    const existingUser = await this.getUser(userData.userId);
    const now = new Date().toISOString();

    const user: User = {
      userId: userData.userId,
      username: userData.username,
      name: userData.name,
      avatarUrl: userData.avatarUrl,
      isBanned: existingUser?.isBanned || false,
      bannedAt: existingUser?.bannedAt,
      bannedBy: existingUser?.bannedBy,
      banReason: existingUser?.banReason,
      createdAt: existingUser?.createdAt || now,
      lastLoginAt: now
    };

    await this.kv.put(KV_KEYS.USER(user.userId), JSON.stringify(user));

    // Add to user list if new
    if (!existingUser) {
      const userList = await this.getUserList();
      if (!userList.includes(user.userId)) {
        userList.push(user.userId);
        await this.kv.put(KV_KEYS.USER_LIST, JSON.stringify(userList));
      }
    }

    return user;
  }

  async getUser(userId: string): Promise<User | null> {
    const data = await this.kv.get(KV_KEYS.USER(userId));
    return data ? JSON.parse(data) : null;
  }

  async getUserList(): Promise<string[]> {
    const data = await this.kv.get(KV_KEYS.USER_LIST);
    return data ? JSON.parse(data) : [];
  }

  async getAllUsers(): Promise<User[]> {
    const userIds = await this.getUserList();
    const users: User[] = [];

    for (const userId of userIds) {
      const user = await this.getUser(userId);
      if (user) {
        users.push(user);
      }
    }

    return users;
  }

  async banUser(userId: string, bannedBy: string, reason?: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.isBanned = true;
    user.bannedAt = new Date().toISOString();
    user.bannedBy = bannedBy;
    user.banReason = reason;

    await this.kv.put(KV_KEYS.USER(userId), JSON.stringify(user));
    return true;
  }

  async unbanUser(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.isBanned = false;
    user.bannedAt = undefined;
    user.bannedBy = undefined;
    user.banReason = undefined;

    await this.kv.put(KV_KEYS.USER(userId), JSON.stringify(user));
    return true;
  }

  async getUserStats(): Promise<UserStats> {
    const users = await this.getAllUsers();
    const bannedUsers = users.filter(u => u.isBanned).length;

    return {
      totalUsers: users.length,
      activeUsers: users.length - bannedUsers,
      bannedUsers
    };
  }
}
