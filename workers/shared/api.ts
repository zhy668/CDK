/**
 * API endpoint definitions and interfaces
 */

import { Project, CreateProjectRequest, UpdateProjectRequest, ClaimRequest, ClaimResponse, ProjectStats, ApiResponse } from './types';

// API Base URL (will be set based on environment)
export const API_BASE_URL = '/api';

// API Endpoints
export const API_ENDPOINTS = {
  // Project management
  PROJECTS: '/api/projects',
  PROJECT_BY_ID: (id: string) => `/api/projects/${id}`,
  PROJECT_STATS: (id: string) => `/api/projects/${id}/stats`,
  
  // Card management
  PROJECT_CARDS: (id: string) => `/api/projects/${id}/cards`,
  ADD_CARDS: (id: string) => `/api/projects/${id}/cards`,
  
  // User claim
  CLAIM_CARD: '/api/claim',
  VERIFY_PASSWORD: '/api/verify',
  
  // Health check
  HEALTH: '/api/health'
} as const;

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// API Request/Response interfaces

// Project APIs
export interface CreateProjectResponse extends ApiResponse<Project> {}
export interface GetProjectResponse extends ApiResponse<Project> {}
export interface GetProjectsResponse extends ApiResponse<Project[]> {}
export interface UpdateProjectResponse extends ApiResponse<Project> {}
export interface DeleteProjectResponse extends ApiResponse<void> {}

// Card APIs
export interface AddCardsRequest {
  cards: string[];
  format?: 'text' | 'csv' | 'json';
  removeDuplicates?: boolean;
}
export interface AddCardsResponse extends ApiResponse<{ added: number; duplicates: number }> {}

// Claim APIs
export interface VerifyPasswordRequest {
  projectId: string;
  password: string;
}
export interface VerifyPasswordResponse extends ApiResponse<{ valid: boolean; project?: Project }> {}

// Stats APIs
export interface GetProjectStatsResponse extends ApiResponse<ProjectStats> {}

// Error response structure
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

// Rate limiting response
export interface RateLimitResponse extends ErrorResponse {
  retryAfter?: number;
}

// API Client helper functions
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string, 
    method: HttpMethod = 'GET', 
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Project methods
  async createProject(data: CreateProjectRequest): Promise<CreateProjectResponse> {
    return this.request(API_ENDPOINTS.PROJECTS, 'POST', data);
  }

  async getProjects(): Promise<GetProjectsResponse> {
    return this.request(API_ENDPOINTS.PROJECTS);
  }

  async getProject(id: string): Promise<GetProjectResponse> {
    return this.request(API_ENDPOINTS.PROJECT_BY_ID(id));
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    return this.request(API_ENDPOINTS.PROJECT_BY_ID(id), 'PUT', data);
  }

  async deleteProject(id: string): Promise<DeleteProjectResponse> {
    return this.request(API_ENDPOINTS.PROJECT_BY_ID(id), 'DELETE');
  }

  // Card methods
  async addCards(projectId: string, data: AddCardsRequest): Promise<AddCardsResponse> {
    return this.request(API_ENDPOINTS.ADD_CARDS(projectId), 'POST', data);
  }

  // Claim methods
  async verifyPassword(data: VerifyPasswordRequest): Promise<VerifyPasswordResponse> {
    return this.request(API_ENDPOINTS.VERIFY_PASSWORD, 'POST', data);
  }

  async claimCard(data: ClaimRequest): Promise<ClaimResponse> {
    return this.request(API_ENDPOINTS.CLAIM_CARD, 'POST', data);
  }

  // Stats methods
  async getProjectStats(id: string): Promise<GetProjectStatsResponse> {
    return this.request(API_ENDPOINTS.PROJECT_STATS(id));
  }
}
