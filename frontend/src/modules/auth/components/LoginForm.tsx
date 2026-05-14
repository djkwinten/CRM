"use client"

/**
 * OAuth Login Form using Nxcode SDK
 *
 * Provides Google and GitHub login buttons. Add your own styling.
 */

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

interface LoginFormProps {
  onSuccess?: () => void
  className?: string
}

export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const { login } = useAuth()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState<'google' | 'github' | null>(null)

  const handleLogin = async (provider: 'google' | 'github') => {
    setError('')
    setIsLoading(provider)

    try {
      await login(provider)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className={className}>
      <h2>Login</h2>

      {error && <div data-error>{error}</div>}

      <div data-login-buttons>
        <button
          onClick={() => handleLogin('google')}
          disabled={isLoading !== null}
          data-provider="google"
        >
          {isLoading === 'google' ? 'Signing in...' : 'Continue with Google'}
        </button>

        <button
          onClick={() => handleLogin('github')}
          disabled={isLoading !== null}
          data-provider="github"
        >
          {isLoading === 'github' ? 'Signing in...' : 'Continue with GitHub'}
        </button>
      </div>
    </div>
  )
}
