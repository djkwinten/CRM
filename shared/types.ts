/**
 * Shared type definitions between frontend and backend
 * Import with: import { ... } from '@shared/types'
 */

// ===== API Response Types =====

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface HealthResponse {
  status: 'ok' | 'error'
  message: string
  timestamp: number
  environment: string
}

// ===== Common Types =====

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ===== API Routes =====

export const API_ROUTES = {
  health: '/api/health',
} as const
