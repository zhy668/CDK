/**
 * Shared type definitions for CDK system
 */

// Project related types
export interface Project {
  id: string;
  name: string;
  password: string;
  adminPassword: string; // 管理密码，用于编辑项目
  description?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  totalCards: number;
  claimedCards: number;
}

export interface CreateProjectRequest {
  name: string;
  password: string;
  adminPassword: string; // 管理密码
  description?: string;
  cards: string[];
}

export interface UpdateProjectRequest {
  name?: string;
  password?: string;
  adminPassword?: string; // 当前管理密码（用于验证）
  newAdminPassword?: string; // 新管理密码（可选）
  description?: string;
  isActive?: boolean;
}

export interface VerifyAdminPasswordRequest {
  projectId: string;
  adminPassword: string;
}

export interface TurnstileVerifyRequest {
  token: string;
  remoteip?: string;
}

export interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

// Card related types
export interface Card {
  id: string;
  projectId: string;
  content: string;
  isClaimed: boolean;
  claimedAt?: string;
  claimedBy?: string; // IP hash
}

export interface ClaimRequest {
  projectId: string;
  password: string;
  turnstileToken?: string;
  'cf-turnstile-response'?: string;
}

export interface VerifyPasswordRequest {
  projectId: string;
  password: string;
}

export interface ClaimResponse {
  success: boolean;
  card?: string;
  message: string;
}

// Statistics types
export interface ProjectStats {
  projectId: string;
  totalCards: number;
  claimedCards: number;
  remainingCards: number;
  claimHistory: ClaimRecord[];
}

export interface ClaimRecord {
  id: string;
  projectId: string;
  cardContent: string;
  claimedAt: string;
  ipHash: string;
  username?: string;  // 领取用户的用户名
}

// User Management types
export interface User {
  userId: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  isBanned: boolean;
  bannedAt?: string;
  bannedBy?: string;
  banReason?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// KV Storage keys structure
export const KV_KEYS = {
  PROJECT: (id: string) => `project:${id}`,
  CARD: (projectId: string, cardId: string) => `card:${projectId}:${cardId}`,
  CLAIM: (projectId: string, ipHash: string) => `claim:${projectId}:${ipHash}`,
  PROJECT_CARDS: (projectId: string) => `cards:${projectId}`,
  PROJECT_STATS: (projectId: string) => `stats:${projectId}`,
  PROJECT_LIST: 'projects:list',
  USER: (userId: string) => `user:${userId}`,
  USER_LIST: 'users:list'
} as const;

// Validation constants
export const VALIDATION = {
  PROJECT_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 50
  },
  PROJECT_PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 20
  },
  PROJECT_DESCRIPTION: {
    MAX_LENGTH: 200
  },
  MAX_CARDS_PER_PROJECT: 10000
} as const;
