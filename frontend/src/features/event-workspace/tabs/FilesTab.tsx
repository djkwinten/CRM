import { FileText, FolderOpen } from 'lucide-react'

export function FilesTab() {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={18} className="text-[#007AFF]" /> Bestanden</h2>
      <p className="text-xs text-gray-400 mt-1">Placeholder — later komen hier contract PDF, voorschotfactuur, zaal foto's en andere documenten.</p>
      <div className="mt-4 border border-dashed border-gray-200 rounded-xl p-4 text-sm text-gray-400 flex items-center gap-2">
        <FileText size={16} /> Nog geen aparte bestandenlijst actief.
      </div>
    </div>
  )
}
