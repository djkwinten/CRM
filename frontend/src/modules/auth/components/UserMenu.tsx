"use client"

/**
 * User Menu Component
 *
 * Displays current user info with logout button. Add your own styling.
 */

import { useAuth } from '../hooks/useAuth'

interface UserMenuProps {
  className?: string
}

export function UserMenu({ className }: UserMenuProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuth()

  if (isLoading) {
    return <div className={className}>Loading...</div>
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className={className} data-user-menu>
      {user?.avatar && (
        <img src={user.avatar} alt={user.name || user.email} data-avatar />
      )}
      <span data-user-name>{user?.name || user?.email}</span>
      <button onClick={logout} data-logout-button>
        Logout
      </button>
    </div>
  )
}
