/**
 * Project management API handlers
 */

import { KVService } from '../kv';
import { CreateProjectRequest, UpdateProjectRequest, AddCardsRequest, DeleteCardRequest, ToggleProjectStatusRequest, ApiResponse, VALIDATION } from '../../shared/types';
import { validateProjectName, validateProjectPassword, validateProjectDescription, parseCards, removeDuplicateCards } from '../../shared/utils';

export class ProjectHandler {
  constructor(private kvService: KVService) {}

  async createProject(request: Request, data?: CreateProjectRequest): Promise<Response> {
    try {
      console.log('[PROJECT] 开始创建项目');

      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      console.log('[PROJECT] 接收到数据:', {
        name: data!.name,
        hasPassword: !!data!.password,
        cardsCount: data!.cards?.length || 0
      });

      // Validate input
      const validation = this.validateCreateProjectRequest(data!);
      if (!validation.valid) {
        console.log('[PROJECT] 验证失败:', validation.error);
        return this.errorResponse(validation.error!, 400);
      }

      // Process cards
      let cards = data!.cards || [];
      console.log('[PROJECT] 原始卡密数量:', cards.length);

      if (cards.length === 0) {
        console.log('[PROJECT] 卡密数量为0，返回错误');
        return this.errorResponse('至少需要添加一个卡密', 400);
      }

      // Remove duplicates if needed
      cards = removeDuplicateCards(cards);
      console.log('[PROJECT] 去重后卡密数量:', cards.length);

      if (cards.length > VALIDATION.MAX_CARDS_PER_PROJECT) {
        console.log('[PROJECT] 卡密数量超限:', cards.length);
        return this.errorResponse(`卡密数量不能超过 ${VALIDATION.MAX_CARDS_PER_PROJECT} 个`, 400);
      }

      // Create project
      console.log('[PROJECT] 开始创建项目对象');
      const project = await this.kvService.createProject({
        name: data!.name.trim(),
        password: data!.password,
        adminPassword: data!.adminPassword,
        description: data!.description?.trim(),
        isActive: true,
        totalCards: 0,
        claimedCards: 0
      });
      console.log('[PROJECT] 项目创建成功，ID:', project.id);

      // Add cards to project
      if (cards.length > 0) {
        console.log('[PROJECT] 开始添加卡密到项目');
        await this.kvService.addCards(project.id, cards);
        project.totalCards = cards.length;
        console.log('[PROJECT] 卡密添加完成');
      }

      console.log('[PROJECT] 项目创建完成，返回成功响应');
      return this.successResponse({
        project,
        cardsAdded: cards.length
      });

    } catch (error) {
      console.error('[PROJECT] 创建项目错误:', error);
      console.error('[PROJECT] 错误堆栈:', error instanceof Error ? error.stack : 'No stack');
      return this.errorResponse('创建项目失败', 500);
    }
  }

  async getProjects(request: Request): Promise<Response> {
    try {
      const projects = await this.kvService.getProjects();
      return this.successResponse(projects);
    } catch (error) {
      console.error('Get projects error:', error);
      return this.errorResponse('获取项目列表失败', 500);
    }
  }

  async getProject(request: Request, projectId: string): Promise<Response> {
    try {
      const project = await this.kvService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      return this.successResponse(project);
    } catch (error) {
      console.error('Get project error:', error);
      return this.errorResponse('获取项目信息失败', 500);
    }
  }

  async updateProject(request: Request, projectId: string, data?: UpdateProjectRequest): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      // Validate input
      if (data!.name && !validateProjectName(data!.name)) {
        return this.errorResponse('项目名称长度必须在1-50字符之间', 400);
      }

      if (data!.password && !validateProjectPassword(data!.password)) {
        return this.errorResponse('项目密码长度必须在6-20字符之间', 400);
      }

      if (data!.description && !validateProjectDescription(data!.description)) {
        return this.errorResponse('项目描述长度不能超过200字符', 400);
      }

      // 验证管理密码
      if (!data!.adminPassword) {
        return this.errorResponse('需要提供管理密码', 400);
      }

      const existingProject = await this.kvService.getProject(projectId);
      if (!existingProject) {
        return this.errorResponse('项目不存在', 404);
      }

      if (existingProject.adminPassword !== data!.adminPassword) {
        return this.errorResponse('管理密码错误', 401);
      }

      const project = await this.kvService.updateProject(projectId, data!);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      return this.successResponse(project);
    } catch (error) {
      console.error('Update project error:', error);
      return this.errorResponse('更新项目失败', 500);
    }
  }

  async deleteProject(request: Request, projectId: string, data?: any): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      // 验证管理密码
      if (!data!.adminPassword) {
        return this.errorResponse('需要提供管理密码', 400);
      }

      const existingProject = await this.kvService.getProject(projectId);
      if (!existingProject) {
        return this.errorResponse('项目不存在', 404);
      }

      if (existingProject.adminPassword !== data!.adminPassword) {
        return this.errorResponse('管理密码错误', 401);
      }

      const success = await this.kvService.deleteProject(projectId);
      if (!success) {
        return this.errorResponse('删除项目失败', 500);
      }

      return this.successResponse({ message: '项目删除成功' });
    } catch (error) {
      console.error('Delete project error:', error);
      return this.errorResponse('删除项目失败', 500);
    }
  }

  async verifyAdminPassword(request: Request, data?: any): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      if (!data!.projectId || !data!.adminPassword) {
        return this.errorResponse('项目ID和管理密码不能为空', 400);
      }

      const project = await this.kvService.getProject(data!.projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      const isValid = project.adminPassword === data!.adminPassword;

      return this.successResponse({
        valid: isValid,
        message: isValid ? '管理密码验证成功' : '管理密码错误'
      });
    } catch (error) {
      console.error('Verify admin password error:', error);
      return this.errorResponse('验证管理密码失败', 500);
    }
  }

  async addCards(request: Request, projectId: string, data?: AddCardsRequest): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      // 验证管理密码
      if (!data!.adminPassword) {
        return this.errorResponse('需要提供管理密码', 400);
      }

      const project = await this.kvService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      if (project.adminPassword !== data!.adminPassword) {
        return this.errorResponse('管理密码错误', 401);
      }

      const { cards, removeDuplicates = true } = data!;

      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return this.errorResponse('请提供有效的卡密列表', 400);
      }

      // Process cards
      let processedCards = cards;
      if (removeDuplicates) {
        processedCards = removeDuplicateCards(cards);
      }

      const addedCount = await this.kvService.addCards(projectId, processedCards);

      return this.successResponse({
        added: addedCount,
        duplicates: cards.length - processedCards.length
      });

    } catch (error) {
      console.error('Add cards error:', error);
      return this.errorResponse('添加卡密失败', 500);
    }
  }

  async deleteCard(request: Request, projectId: string, data?: DeleteCardRequest): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      // 验证管理密码
      if (!data!.adminPassword) {
        return this.errorResponse('需要提供管理密码', 400);
      }

      if (!data!.cardId) {
        return this.errorResponse('卡密ID不能为空', 400);
      }

      const project = await this.kvService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      if (project.adminPassword !== data!.adminPassword) {
        return this.errorResponse('管理密码错误', 401);
      }

      // 检查卡密是否已被领取
      const card = await this.kvService.getCard(projectId, data!.cardId);
      if (!card) {
        return this.errorResponse('卡密不存在', 404);
      }

      if (card.isClaimed) {
        return this.errorResponse('已领取的卡密不能删除', 400);
      }

      // 删除卡密
      const success = await this.kvService.deleteCard(projectId, data!.cardId);
      if (!success) {
        return this.errorResponse('删除卡密失败', 500);
      }

      return this.successResponse({ message: '卡密删除成功' });

    } catch (error) {
      console.error('Delete card error:', error);
      return this.errorResponse('删除卡密失败', 500);
    }
  }

  async toggleProjectStatus(request: Request, projectId: string, data?: ToggleProjectStatusRequest): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      // 验证管理密码
      if (!data!.adminPassword) {
        return this.errorResponse('需要提供管理密码', 400);
      }

      if (typeof data!.isActive !== 'boolean') {
        return this.errorResponse('isActive必须是布尔值', 400);
      }

      const project = await this.kvService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      if (project.adminPassword !== data!.adminPassword) {
        return this.errorResponse('管理密码错误', 401);
      }

      // 更新项目状态
      const updatedProject = await this.kvService.updateProject(projectId, {
        isActive: data!.isActive,
        adminPassword: data!.adminPassword
      });

      if (!updatedProject) {
        return this.errorResponse('更新项目状态失败', 500);
      }

      return this.successResponse({
        project: updatedProject,
        message: data!.isActive ? '项目已启用' : '项目已禁用'
      });

    } catch (error) {
      console.error('Toggle project status error:', error);
      return this.errorResponse('更新项目状态失败', 500);
    }
  }

  async getProjectStats(request: Request, projectId: string): Promise<Response> {
    try {
      // 获取请求体中的管理密码
      const data = await request.json() as { adminPassword?: string };
      if (!data.adminPassword) {
        return this.errorResponse('管理密码不能为空', 400);
      }

      // 验证项目是否存在
      const project = await this.kvService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      // 验证管理密码
      if (project.adminPassword !== data.adminPassword) {
        return this.errorResponse('管理密码错误', 403);
      }

      // 获取统计信息
      const stats = await this.kvService.getProjectStats(projectId);
      if (!stats) {
        return this.errorResponse('获取统计信息失败', 500);
      }

      return this.successResponse(stats);
    } catch (error) {
      console.error('Get project stats error:', error);
      return this.errorResponse('获取项目统计失败', 500);
    }
  }

  private validateCreateProjectRequest(data: CreateProjectRequest): { valid: boolean; error?: string } {
    if (!data.name || !validateProjectName(data.name)) {
      return { valid: false, error: '项目名称长度必须在1-50字符之间' };
    }

    if (!data.password || !validateProjectPassword(data.password)) {
      return { valid: false, error: '项目密码长度必须在6-20字符之间' };
    }

    if (data.description && !validateProjectDescription(data.description)) {
      return { valid: false, error: '项目描述长度不能超过200字符' };
    }

    return { valid: true };
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
