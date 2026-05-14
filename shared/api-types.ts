/**
 * Shared API type definitions
 *
 * This file defines the contract between frontend and backend.
 * Both frontend and backend should import from this file.
 */

// =============================================================================
// HTTP Method Types
// =============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// =============================================================================
// API Endpoint Registry
// =============================================================================

/**
 * Register all API endpoints here with their methods and types.
 * This ensures frontend and backend stay in sync.
 */
export interface ApiEndpoints {
  // Health check
  'GET /api/health': {
    response: HealthResponse
  }

  // Example: User endpoints (uncomment when needed)
  // 'GET /api/users': {
  //   response: User[]
  // }
  // 'POST /api/users': {
  //   request: CreateUserRequest
  //   response: User
  // }
  // 'GET /api/users/:id': {
  //   params: { id: string }
  //   response: User
  // }
  // 'PUT /api/users/:id': {
  //   params: { id: string }
  //   request: UpdateUserRequest
  //   response: User
  // }
  // 'DELETE /api/users/:id': {
  //   params: { id: string }
  //   response: { success: boolean }
  // }
}

// =============================================================================
// Response Types
// =============================================================================

export interface HealthResponse {
  status: 'ok' | 'error'
  message: string
  timestamp: number
  environment: string
}

// =============================================================================
// Common Types
// =============================================================================

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ApiErrorResponse {
  error: string
  message: string
  details?: unknown
}

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Extract the HTTP method from an endpoint key
 * e.g., 'GET /api/users' -> 'GET'
 */
export type ExtractMethod<T extends string> = T extends `${infer M} ${string}` ? M : never

/**
 * Extract the path from an endpoint key
 * e.g., 'GET /api/users' -> '/api/users'
 */
export type ExtractPath<T extends string> = T extends `${string} ${infer P}` ? P : never

/**
 * Get request type for an endpoint
 */
export type RequestOf<K extends keyof ApiEndpoints> =
  ApiEndpoints[K] extends { request: infer R } ? R : never

/**
 * Get response type for an endpoint
 */
export type ResponseOf<K extends keyof ApiEndpoints> =
  ApiEndpoints[K] extends { response: infer R } ? R : never
