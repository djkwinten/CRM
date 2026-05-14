import { useNavigate, useLocation } from 'react-router-dom'
import { Calendar, Music2, Bell, Building2, FileText } from 'lucide-react'

export function BottomTabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const tabs = [
    { label: 'Agenda', icon: <Calendar size={21} strokeWidth={1.8} />, path: '/agenda' },
    { label: 'Boekingen', icon: <Music2 size={21} strokeWidth={1.8} />, path: '/' },
    { label: 'Zalen', icon: <Building2 size={21} strokeWidth={1.8} />, path: '/zalen' },
    { label: 'Herinneringen', icon: <Bell size={21} strokeWidth={1.8} />, path: '/herinneringen' },
    { label: 'Templates', icon: <FileText size={21} strokeWidth={1.8} />, path: '/templates' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-gray-200/60">
      <div className="flex items-center justify-around px-2 py-2" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {tabs.map(tab => {
          const isActive = tab.path === '/' ? pathname === '/' : pathname === tab.path
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl transition-all min-w-[52px] ${
                isActive ? 'text-[#007AFF]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : 'scale-100'}`}>
                {tab.icon}
              </span>
              <span className={`text-[9px] font-medium leading-tight ${
                isActive ? 'text-[#007AFF]' : 'text-gray-400'
              }`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
