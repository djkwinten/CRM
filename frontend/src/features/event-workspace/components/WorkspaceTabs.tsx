import { FileText, FolderOpen, MessageSquare, ClipboardList, LayoutDashboard } from 'lucide-react'
import { WorkspaceTab } from '../types'

const tabs: { key: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overzicht', label: 'Overzicht', icon: <LayoutDashboard size={15} /> },
  { key: 'contract', label: 'Contract Info', icon: <FileText size={15} /> },
  { key: 'vragenlijst', label: 'Vragenlijst', icon: <ClipboardList size={15} /> },
  { key: 'bestanden', label: 'Bestanden', icon: <FolderOpen size={15} /> },
  { key: 'communicatie', label: 'Communicatie', icon: <MessageSquare size={15} /> },
]

export function WorkspaceTabs({ active, onChange }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-1.5 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              active === t.key
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
