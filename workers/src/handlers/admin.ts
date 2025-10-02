/**
 * Admin Management Handler
 * Handles super admin operations like user management
 */

import { DatabaseService } from '../database';

export class AdminHandler {
  constructor(private dbService: DatabaseService) {}

  /**
   * Get all users
   */
  async getUsers(request: Request): Promise<Response> {
    try {
      const users = await this.dbService.getAllUsers();

      // Sort by last login time (most recent first)
      users.sort((a, b) => {
        return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
      });

      return this.successResponse(users);
    } catch (error) {
      console.error('Get users error:', error);
      return this.errorResponse('获取用户列表失败', 500);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(request: Request): Promise<Response> {
    try {
      const stats = await this.dbService.getUserStats();
      return this.successResponse(stats);
    } catch (error) {
      console.error('Get user stats error:', error);
      return this.errorResponse('获取用户统计失败', 500);
    }
  }

  /**
   * Ban a user
   */
  async banUser(request: Request, data: { userId: string; reason?: string }, adminUsername: string): Promise<Response> {
    try {
      if (!data.userId) {
        return this.errorResponse('用户ID不能为空', 400);
      }

      const user = await this.dbService.getUser(data.userId);
      if (!user) {
        return this.errorResponse('用户不存在', 404);
      }

      const success = await this.dbService.banUser(data.userId, adminUsername, data.reason);
      
      if (success) {
        return this.successResponse({
          message: `用户 ${user.username} 已被封禁`
        });
      } else {
        return this.errorResponse('封禁用户失败', 500);
      }
    } catch (error) {
      console.error('Ban user error:', error);
      return this.errorResponse('封禁用户失败', 500);
    }
  }

  /**
   * Unban a user
   */
  async unbanUser(request: Request, data: { userId: string }): Promise<Response> {
    try {
      if (!data.userId) {
        return this.errorResponse('用户ID不能为空', 400);
      }

      const user = await this.dbService.getUser(data.userId);
      if (!user) {
        return this.errorResponse('用户不存在', 404);
      }

      const success = await this.dbService.unbanUser(data.userId);
      
      if (success) {
        return this.successResponse({
          message: `用户 ${user.username} 已解除封禁`
        });
      } else {
        return this.errorResponse('解除封禁失败', 500);
      }
    } catch (error) {
      console.error('Unban user error:', error);
      return this.errorResponse('解除封禁失败', 500);
    }
  }

  private successResponse(data: any): Response {
    return new Response(JSON.stringify({
      success: true,
      data
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private errorResponse(error: string, status: number = 400): Response {
    return new Response(JSON.stringify({
      success: false,
      error
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

