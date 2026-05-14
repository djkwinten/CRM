import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Save, RefreshCw } from 'lucide-react'
import { BottomTabBar } from '../components/BottomTabBar'
import { EmailTemplate, getEmailTemplates, updateEmailTemplate } from '../lib/api'

export function Templates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selected, setSelected] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const data = await getEmailTemplates()
    setTemplates(data)
    if (!selected && data[0]) {
      setSelected(data[0]); setSubject(data[0].subject); setBody(data[0].body)
    }
  }

  useEffect(() => { load() }, [])

  const choose = (t: EmailTemplate) => {
    setSelected(t); setSubject(t.subject); setBody(t.body)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    await updateEmailTemplate(selected.key, { name: selected.name, subject, body })
    await load()
    setSaving(false)
  }

  return <div className="min-h-screen bg-[#F2F2F7]">
    <header className="sticky top-0 z-40">
      <div className="bg-gradient-to-r from-slate-800 to-slate-600 px-4 sm:px-6 pb-4 safe-top">
        <div className="max-w-5xl mx-auto flex items-center gap-4 pt-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-white/20 rounded-xl text-white/80 hover:text-white"><ArrowLeft size={20} /></button>
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><FileText size={18} className="text-white" /></div>
          <div className="flex-1"><h1 className="font-bold text-white">E-mail templates</h1><p className="text-xs text-white/70">Pas de teksten aan die bij de boekingen gebruikt worden</p></div>
          <button onClick={load} className="p-2 hover:bg-white/20 rounded-xl text-white/80"><RefreshCw size={16} /></button>
        </div>
      </div>
    </header>

    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 grid md:grid-cols-[280px_1fr] gap-5">
      <aside className="space-y-2">
        {templates.map(t => <button key={t.key} onClick={() => choose(t)} className={`w-full text-left bg-white rounded-2xl p-4 shadow-sm border ${selected?.key === t.key ? 'border-[#007AFF] ring-2 ring-[#007AFF]/10' : 'border-transparent'}`}>
          <div className="font-semibold text-sm text-gray-900">{t.name}</div>
          <div className="text-xs text-gray-400 mt-1 truncate">{t.subject}</div>
        </button>)}
      </aside>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        {selected ? <>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-400">Onderwerp</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF]" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-400">Tekst</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={16} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#007AFF]" />
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
            Variabelen: {'{{naam}}'}, {'{{feest_datum}}'}, {'{{type_feest}}'}, {'{{locatie}}'}, {'{{vragenlijst_link}}'}, {'{{review_link}}'}, {'{{dagen_tot_feest}}'}, {'{{afgewezen_reden}}'}
          </div>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-[#007AFF] text-white px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} Opslaan
          </button>
        </> : <div className="text-gray-400">Laden...</div>}
      </section>
    </main>
    <BottomTabBar />
  </div>
}
