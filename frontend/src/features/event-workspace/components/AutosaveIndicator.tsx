import { CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react'

export function AutosaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  const cfg = {
    saving: { icon: <RefreshCw size={13} className="animate-spin" />, text: 'Opslaan...', cls: 'text-blue-600 bg-blue-50 border-blue-100' },
    saved: { icon: <CheckCircle2 size={13} />, text: 'Opgeslagen', cls: 'text-green-700 bg-green-50 border-green-100' },
    error: { icon: <AlertTriangle size={13} />, text: 'Niet opgeslagen', cls: 'text-red-600 bg-red-50 border-red-100' },
  }[status]
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.cls}`}>{cfg.icon}{cfg.text}</span>
}
