import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Bell,
  Send, Wifi, WifiOff, Play,
  Plus, Trash2, Square, CheckSquare
} from 'lucide-react'
import {
  getReminderStatuses, runReminderCheck, testSmtp,
  ReminderStatus
} from '../lib/api'
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

// ── Main component ────────────────────────────────────────────────────────────

export function Reminders() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<ReminderStatus[]>([])
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<{ sent: number; checked: number } | null>(null)
  const [smtp, setSmtp] = useState<{ connected: boolean; message: string } | null>(null)
  const [testingSmtp, setTestingSmtp] = useState(false)

  // To-do state
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [newTodo, setNewTodo] = useState('')

  const load = useCallback(async () => {
    const data = await getReminderStatuses()
    setStatuses(data)
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

        {/* De lijst met bevestigde boekingen is bewust verborgen op deze tab. */}
      </main>

      <BottomTabBar />
    </div>
  )
}
