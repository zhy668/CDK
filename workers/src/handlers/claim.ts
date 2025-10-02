/**
 * Card claim API handlers
 */

import { DatabaseService } from '../database';
import { ClaimRequest, VerifyPasswordRequest, ClaimResponse } from '../../shared/types';
import { getClientIP, hashIP } from '../../shared/utils';

export class ClaimHandler {
  constructor(private dbService: DatabaseService, private env: any) {}

  async verifyPassword(request: Request, data?: VerifyPasswordRequest): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      if (!data!.projectId || !data!.password) {
        return this.errorResponse('项目ID和密码不能为空', 400);
      }

      const project = await this.dbService.getProject(data!.projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      if (!project.isActive) {
        return this.errorResponse('项目已停用', 403);
      }

      const isValid = project.password === data!.password;

      return this.successResponse({
        valid: isValid,
        project: isValid ? {
          id: project.id,
          name: project.name,
          description: project.description,
          totalCards: project.totalCards,
          claimedCards: project.claimedCards
        } : undefined
      });

    } catch (error) {
      console.error('Verify password error:', error);
      return this.errorResponse('验证密码失败', 500);
    }
  }

  async claimCard(request: Request, data?: ClaimRequest, session?: any): Promise<Response> {
    try {
      // 如果没有预解析的数据，则从请求中读取
      if (!data) {
        data = await request.json();
      }

      if (!data!.projectId || !data!.password) {
        return this.errorResponse('项目ID和密码不能为空', 400);
      }

      // Turnstile 验证（如果启用）
      const turnstileEnabled = this.env.TURNSTILE_ENABLED === 'true';
      console.log('[CLAIM] Turnstile状态检查:', {
        TURNSTILE_ENABLED: this.env.TURNSTILE_ENABLED,
        turnstileEnabled,
        hasToken: !!(data!.turnstileToken || data!['cf-turnstile-response']),
        requestData: Object.keys(data!)
      });

      if (turnstileEnabled) {
        const turnstileToken = data!.turnstileToken || data!['cf-turnstile-response'];
        if (!turnstileToken) {
          console.log('[CLAIM] 缺少Turnstile token');
          return this.errorResponse('缺少安全验证', 400);
        }

        // 验证 Turnstile token
        const turnstileValid = await this.verifyTurnstileToken(turnstileToken, request);
        if (!turnstileValid) {
          return this.errorResponse('安全验证失败，请重试', 400);
        }
      }

      // Get client IP and hash it
      const clientIP = getClientIP(request);
      const ipHash = await hashIP(clientIP);

      // Get username from session
      const username = session?.username || 'unknown';

      // Verify project and password
      const project = await this.dbService.getProject(data!.projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      if (!project.isActive) {
        return this.errorResponse('项目已停用', 403);
      }

      if (project.password !== data!.password) {
        return this.errorResponse('密码错误', 401);
      }

      // Check if user has already claimed (only if limitOnePerUser is enabled)
      if (project.limitOnePerUser) {
        const existingClaim = await this.dbService.hasUserClaimed(data!.projectId, ipHash);
        if (existingClaim) {
          return this.successResponse({
            success: true,
            card: existingClaim.cardContent,
            message: '您已经领取过卡密了',
            alreadyClaimed: true
          });
        }
      }

      // Get random available card
      const availableCardId = await this.dbService.getRandomAvailableCard(data!.projectId);
      if (!availableCardId) {
        return this.errorResponse('卡密已全部领完', 410);
      }

      // Claim the card with username
      const claimedCard = await this.dbService.claimCard(data!.projectId, availableCardId, ipHash, username);
      if (!claimedCard) {
        return this.errorResponse('领取失败，请重试', 500);
      }

      return this.successResponse({
        success: true,
        card: claimedCard.content,
        message: '领取成功',
        claimedAt: claimedCard.claimedAt
      });

    } catch (error) {
      console.error('Claim card error:', error);
      return this.errorResponse('领取卡密失败', 500);
    }
  }

  async getClaimStatus(request: Request, projectId: string): Promise<Response> {
    try {
      const project = await this.dbService.getProject(projectId);
      if (!project) {
        return this.errorResponse('项目不存在', 404);
      }

      // Get client IP and hash it
      const clientIP = getClientIP(request);
      const ipHash = await hashIP(clientIP);

      // Check if user has claimed
      const existingClaim = await this.dbService.hasUserClaimed(projectId, ipHash);

      return this.successResponse({
        hasClaimed: !!existingClaim,
        claimRecord: existingClaim,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          totalCards: project.totalCards,
          claimedCards: project.claimedCards,
          remainingCards: project.totalCards - project.claimedCards
        }
      });

    } catch (error) {
      console.error('Get claim status error:', error);
      return this.errorResponse('获取领取状态失败', 500);
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

  /**
   * 验证 Turnstile token
   */
  private async verifyTurnstileToken(token: string, request: Request): Promise<boolean> {
    try {
      const secretKey = this.env.TURNSTILE_SECRET_KEY;
      if (!secretKey) {
        console.warn('Turnstile secret key not configured');
        return false;
      }

      const ip = request.headers.get('CF-Connecting-IP') ||
                 request.headers.get('X-Forwarded-For') ||
                 'unknown';

      const formData = new FormData();
      formData.append('secret', secretKey);
      formData.append('response', token);
      formData.append('remoteip', ip);

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json() as any;

      if (result.success) {
        console.log('Turnstile verification successful');
        return true;
      } else {
        console.warn('Turnstile verification failed:', result['error-codes']);
        return false;
      }
    } catch (error) {
      console.error('Turnstile verification error:', error);
      return false;
    }
  }
}
