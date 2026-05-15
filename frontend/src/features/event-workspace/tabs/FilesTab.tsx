import { useEffect, useRef, useState } from 'react'
import { Download, FileText, FolderOpen, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Booking } from '../../../types/booking'
import { bookingFileDownloadUrl, BookingFile, deleteBookingFile, getBookingFiles, uploadBookingFile } from '../../../lib/api'

function formatSize(size?: number | null) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function FilesTab({ booking }: { booking: Booking }) {
  const [files, setFiles] = useState<BookingFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setFiles(await getBookingFiles(booking.id))
    setLoading(false)
  }

  useEffect(() => { load() }, [booking.id])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const res = await uploadBookingFile(booking.id, file)
    setUploading(false)
    if (!res.success) alert(res.error || 'Upload mislukt')
    await load()
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDelete = async (file: BookingFile) => {
    if (!confirm(`Bestand verwijderen van de klantenpagina?\n\n${file.name}`)) return
    await deleteBookingFile(file.id)
    await load()
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={18} className="text-[#007AFF]" /> Bestanden klantenpagina</h2>
          <p className="text-xs text-gray-400 mt-1">Upload hier bestanden die zichtbaar/downloadbaar zijn op de klantpagina.</p>
        </div>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><RefreshCw size={15} /></button>
      </div>

      <div className="border border-dashed border-gray-300 rounded-2xl p-4 bg-gray-50">
        <input ref={inputRef} type="file" onChange={handleUpload} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-50 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? 'Uploaden...' : 'Bestand toevoegen'}
        </button>
        <p className="text-[11px] text-gray-400 mt-2 text-center">Max. 5 MB per bestand. Voor grote fotomappen gebruiken we later R2/opslag.</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Bestanden laden...</div>
      ) : files.length === 0 ? (
        <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">Nog geen extra bestanden toegevoegd.</div>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
              <FileText size={18} className="text-[#007AFF]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{file.type || 'bestand'} {formatSize(file.size) && `· ${formatSize(file.size)}`}</p>
              </div>
              <a href={bookingFileDownloadUrl(file.id)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-blue-50 text-blue-600">
                <Download size={15} />
              </a>
              <button onClick={() => handleDelete(file)} className="p-2 rounded-xl hover:bg-red-50 text-red-500">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
