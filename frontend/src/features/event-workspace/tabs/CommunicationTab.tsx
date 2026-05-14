import { MessageSquare } from 'lucide-react'

export function CommunicationTab() {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-[#007AFF]" /> Communicatie</h2>
      <p className="text-xs text-gray-400 mt-1">Placeholder — later komt hier een timeline van mails, templates, herinneringen en klantacties.</p>
      <div className="mt-4 space-y-2">
        <div className="flex gap-3 text-sm text-gray-400"><span>●</span><span>Timeline wordt in een volgende stap gevuld.</span></div>
      </div>
    </div>
  )
}
