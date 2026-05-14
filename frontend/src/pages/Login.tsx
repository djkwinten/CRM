import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music2 } from 'lucide-react'
import { useAuth } from '../modules/auth/hooks/useAuth'

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
  }, [isAuthenticated, navigate])

  const handleLogin = async () => {
    try {
      await login('google')
    } catch (e) {
      console.error(e)
    }
  }

  if (isLoading) return null

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Login card */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)]">
          {/* Gradient top */}
          <div className="bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE] px-8 pt-10 pb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
              <Music2 size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">DJ Manager</h1>
            <p className="text-white/70 text-sm mt-1">Boekingsbeheer & Klantenformulieren</p>
          </div>

          {/* Form section */}
          <div className="p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Inloggen</h2>
            <p className="text-gray-500 text-sm mb-8">
              Log in om toegang te krijgen tot je DJ dashboard en alle boekingen te beheren.
            </p>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 border border-gray-200 shadow-sm hover:shadow-md"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M19.6 10.23c0-.68-.06-1.36-.17-2H10v3.79h5.38a4.6 4.6 0 01-2 3.02v2.51h3.22C18.32 15.9 19.6 13.27 19.6 10.23z" fill="#4285F4"/>
                <path d="M10 20c2.7 0 4.96-.9 6.62-2.42l-3.22-2.5a5.98 5.98 0 01-3.4.94 5.97 5.97 0 01-5.62-4.12H1.05v2.6A10 10 0 0010 20z" fill="#34A853"/>
                <path d="M4.38 11.9A5.97 5.97 0 014.08 10c0-.66.11-1.3.3-1.9V5.5H1.05A10 10 0 000 10c0 1.61.38 3.13 1.05 4.5l3.33-2.6z" fill="#FBBC05"/>
                <path d="M10 3.98a5.42 5.42 0 013.83 1.5L16.7 2.6A9.62 9.62 0 0010 0a10 10 0 00-8.95 5.5l3.33 2.6A5.97 5.97 0 0110 3.98z" fill="#EA4335"/>
              </svg>
              Inloggen met Google
            </button>

            <p className="text-center text-gray-400 text-xs mt-6">
              Alleen voor geautoriseerde DJ's
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
