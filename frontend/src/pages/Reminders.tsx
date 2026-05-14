import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Mail, RefreshCw, Bell, CheckCircle2, XCircle,
  Clock, Send, AlertTriangle, Wifi, WifiOff, Play,
  Plus, Trash2, Square, CheckSquare
} from 'lucide-react'
import {
  getReminderStatuses, runReminderCheck, sendReminder, testSmtp,
  ReminderStatus
} from '../lib/api'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { BottomTabBar } from '../components/BottomTabBar'

// ── To-do types & storage ─────────────────────────────────────────────────────

interface Todo {
  id: number
  text: string
  done: boolean
}

function loadTodos(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem('dj_todos') || '[]')
  } catch {
    return []
  }
}

function saveTodos(todos: Todo[]) {
  localStorage.setItem('dj_todos', JSON.stringify(todos))
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ needs, sent, done }: { needs: boolean; sent: string | null; done: boolean }) {
  if (done) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200">
      <CheckCircle2 size={11} /> Ingevuld
    </span>
  )
  if (sent) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
      <Mail size={11} /> Herinnering verstuurd
    </span>
  )
  if (needs) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-500 border border-orange-200">
      <AlertTriangle size={11} /> Herinnering nodig
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
      <Clock size={11} /> Wacht
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Reminders() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<ReminderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<{ sent: number; checked: number } | null>(null)
  const [smtp, setSmtp] = useState<{ connected: boolean; message: string } | null>(null)
  const [testingSmtp, setTestingSmtp] = useState(false)

  // To-do state
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [newTodo, setNewTodo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getReminderStatuses()
    setStatuses(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // To-do handlers
  const handleAddTodo = () => {
    const text = newTodo.trim()
    if (!text) return
    const updated = [...todos, { id: Date.now(), text, done: false }]
    setTodos(updated)
    saveTodos(updated)
    setNewTodo('')
  }

  const handleToggleTodo = (id: number) => {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(updated)
    saveTodos(updated)
  }

  const handleDeleteTodo = (id: number) => {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    saveTodos(updated)
  }

  // Reminder handlers
  const handleRunCheck = async () => {
    setRunning(true)
    try {
      const result = await runReminderCheck()
      setLastResult({ sent: result.sent, checked: result.checked })
      await load()
    } catch (e) {
      alert('Fout bij uitvoeren van check. Controleer je SMTP-instellingen.')
    }
    setRunning(false)
  }

  const handleSendOne = async (id: number, naam: string) => {
    if (!confirm(`Herinnering sturen naar ${naam}?`)) return
    setSendingId(id)
    const result = await sendReminder(id)
    if (result.success) {
      await load()
    } else {
      alert(`Fout: ${result.error}\n\nControleer je SMTP-instellingen in backend/.env`)
    }
    setSendingId(null)
  }

  const handleSmtpTest = async () => {
    setTestingSmtp(true)
    const result = await testSmtp()
    setSmtp(result)
    setTestingSmtp(false)
  }

  const boekingen = statuses.filter(s => !s.is_aanvraag)
  const needsReminder = boekingen.filter(s => s.needs_reminder)
  const alreadySent = boekingen.filter(s => s.reminder_sent_at && !s.status_vragenlijst)
  const done = boekingen.filter(s => s.status_vragenlijst)
  const pendingTodos = todos.filter(t => !t.done).length

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400 px-4 sm:px-6 pb-4 safe-top">
          <div className="max-w-4xl mx-auto flex items-center gap-4 pt-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Bell size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">Herinneringen</h1>
                <p className="text-xs text-white/70">To-do's & vragenlijst herinneringen</p>
              </div>
            </div>
            <button onClick={load} className="p-2 hover:bg-white/20 rounded-xl text-white/70 hover:text-white transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 md:pb-6">

        {/* ── To-do sectie ── */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CheckSquare size={16} className="text-[#007AFF]" />
            To-do's
            {pendingTodos > 0 && (
              <span className="ml-1 text-xs font-medium bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full">{pendingTodos}</span>
            )}
          </h2>

          {/* Invoer */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nieuwe taak..."
              value={newTodo}
              onChange={e => setNewTodo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
              className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
            />
            <button onClick={handleAddTodo}
              className="flex items-center gap-1.5 bg-[#007AFF] hover:bg-[#0066CC] text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors">
              <Plus size={15} />
            </button>
          </div>

          {/* Lijst */}
          {todos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Geen to-do's — voeg er een toe!</p>
          ) : (
            <ul className="space-y-1.5">
              {todos.map(t => (
                <li key={t.id} className="flex items-center gap-2 group">
                  <button onClick={() => handleToggleTodo(t.id)} className="flex-shrink-0 text-gray-400 hover:text-[#007AFF] transition-colors">
                    {t.done ? <CheckSquare size={18} className="text-[#34C759]" /> : <Square size={18} />}
                  </button>
                  <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {t.text}
                  </span>
                  <button onClick={() => handleDeleteTodo(t.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{needsReminder.length}</div>
            <div className="text-xs text-gray-400 mt-1">Herinnering nodig</div>
          </div>
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 text-center">
            <div className="text-2xl font-bold text-[#007AFF]">{alreadySent.length}</div>
            <div className="text-xs text-gray-400 mt-1">Al verstuurd</div>
          </div>
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 text-center">
            <div className="text-2xl font-bold text-[#34C759]">{done.length}</div>
            <div className="text-xs text-gray-400 mt-1">Vragenlijst OK</div>
          </div>
        </div>

        {/* ── Acties (compact) ── */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mr-1">
              <Play size={13} className="text-[#007AFF]" /> E-mail acties
            </span>
            <button onClick={handleRunCheck} disabled={running}
              className="flex items-center gap-1.5 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors">
              {running
                ? <><RefreshCw size={13} className="animate-spin" /> Bezig...</>
                : <><Send size={13} /> Automatische check</>}
            </button>
            <button onClick={handleSmtpTest} disabled={testingSmtp}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium text-xs transition-colors">
              {testingSmtp
                ? <><RefreshCw size={13} className="animate-spin" /> Testen...</>
                : <><Wifi size={13} /> SMTP testen</>}
            </button>
          </div>

          {smtp && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
              smtp.connected
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-500'
            }`}>
              {smtp.connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {smtp.message}
            </div>
          )}

          {lastResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600">
              ✅ Check klaar — <strong>{lastResult.checked}</strong> gecontroleerd, <strong className="text-[#007AFF]">{lastResult.sent}</strong> herinnering{lastResult.sent !== 1 ? 'en' : ''} verstuurd
            </div>
          )}
        </div>

        {/* ── Booking list ── */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-500 text-sm uppercase tracking-wider">
            Bevestigde Boekingen ({boekingen.length})
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-400 animate-pulse">Laden...</div>
          ) : boekingen.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Geen bevestigde boekingen gevonden</div>
          ) : (
            boekingen.map(s => {
              const isSending = sendingId === s.id
              const dateStr = s.feest_datum
                ? format(parseISO(s.feest_datum), 'd MMM yyyy', { locale: nl })
                : '—'

              return (
                <div key={s.id}
                  className={`bg-white rounded-2xl p-4 transition-all ${
                    s.needs_reminder
                      ? 'shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] ring-1 ring-orange-200'
                      : 'shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)]'
                  }`}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-gray-900 text-sm">{s.naam || '—'}</span>
                        <StatusPill needs={s.needs_reminder} sent={s.reminder_sent_at} done={!!s.status_vragenlijst} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={11} /> {dateStr}
                          {s.days_until > 0
                            ? <span className={`ml-1 font-medium ${s.days_until <= 30 ? 'text-orange-500' : 'text-gray-400'}`}>
                                ({s.days_until} dagen)
                              </span>
                            : <span className="ml-1 text-red-400">(voorbij)</span>}
                        </span>
                        {s.email && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Mail size={11} /> {s.email}
                          </span>
                        )}
                        {s.reminder_sent_at && (
                          <span className="text-xs text-gray-400">
                            Verstuurd: {format(parseISO(s.reminder_sent_at), 'd MMM HH:mm', { locale: nl })}
                          </span>
                        )}
                      </div>
                    </div>

                    {!s.status_vragenlijst && s.email && (
                      <button onClick={() => handleSendOne(s.id, s.naam)} disabled={isSending}
                        title={s.reminder_sent_at ? 'Opnieuw sturen' : 'Herinnering sturen'}
                        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-50 border ${
                          s.needs_reminder
                            ? 'bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                        }`}>
                        {isSending
                          ? <RefreshCw size={13} className="animate-spin" />
                          : <Send size={13} />}
                        {s.reminder_sent_at ? 'Opnieuw' : 'Stuur'}
                      </button>
                    )}
                    {!s.status_vragenlijst && !s.email && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <XCircle size={12} /> Geen e-mail
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      <BottomTabBar />
    </div>
  )
}
