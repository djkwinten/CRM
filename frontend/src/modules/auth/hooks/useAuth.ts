"use client"

/**
 * Auth hook wrapping Nxcode SDK
 *
 * Usage:
 *   const { user, isAuthenticated, login, logout } = useAuth()
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react'

// Nxcode SDK types (SDK loaded via script tag as global)
export interface NxcodeUser {
  id: string
  email: string
  name?: string
  avatar?: string
}

interface NxcodeSDK {
  auth: {
    login(provider?: 'google' | 'github'): Promise<NxcodeUser>
    logout(): Promise<void>
    getUser(): NxcodeUser | null
    getToken(): string | null
    isLoggedIn(): boolean
    onAuthStateChange(callback: (user: NxcodeUser | null) => void): () => void
  }
  ready(): Promise<void>
  isReady(): boolean
}

declare const Nxcode: NxcodeSDK

// ==================== Context ====================

interface AuthContextType {
  user: NxcodeUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (provider?: 'google' | 'github') => Promise<NxcodeUser>
  logout: () => Promise<void>
  getToken: () => string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// ==================== Provider Hook ====================

export function useAuthProvider(): AuthContextType {
  const [user, setUser] = useState<NxcodeUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    const init = async () => {
      try {
        await Nxcode.ready()
        unsubscribe = Nxcode.auth.onAuthStateChange((user) => {
          setUser(user)
          setIsLoading(false)
        })
      } catch (error) {
        console.error('Failed to initialize Nxcode SDK:', error)
        setIsLoading(false)
      }
    }

    init()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const login = useCallback(async (provider: 'google' | 'github' = 'google') => {
    await Nxcode.ready()
    const user = await Nxcode.auth.login(provider)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    await Nxcode.ready()
    await Nxcode.auth.logout()
    setUser(null)
  }, [])

  const getToken = useCallback(() => {
    return Nxcode.auth.getToken()
  }, [])

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    getToken
  }
}

export { AuthContext }
