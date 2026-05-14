import { useState } from 'react'
import { downloadBlankForm } from '../lib/blankFormPDF'
import { FileDown } from 'lucide-react'

export function BlankForm() {
  const [loadingTrouw, setLoadingTrouw] = useState(false)
  const [loadingAlgemeen, setLoadingAlgemeen] = useState(false)

  const handleDownload = async (isTrouw: boolean) => {
    if (isTrouw) setLoadingTrouw(true)
    else setLoadingAlgemeen(true)
    try {
      await downloadBlankForm(isTrouw)
    } finally {
      if (isTrouw) setLoadingTrouw(false)
      else setLoadingAlgemeen(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#007AFF]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FileDown size={28} className="text-[#007AFF]" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Invulbaar Formulier</h1>
          <p className="text-sm text-gray-500 mt-1">Download een PDF die je digitaal kunt invullen op iPad, iPhone of computer.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleDownload(true)}
            disabled={loadingTrouw}
            className="w-full flex items-center gap-4 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-left px-4 py-3.5 rounded-2xl transition-colors disabled:opacity-50"
          >
            <span className="text-2xl">💍</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Trouwfeest</p>
              <p className="text-xs text-gray-500">Met intredes, koppelnamen, ceremonie...</p>
            </div>
            {loadingTrouw
              ? <span className="text-xs text-pink-500 font-medium">Genereren...</span>
              : <FileDown size={16} className="text-pink-400 flex-shrink-0" />
            }
          </button>

          <button
            onClick={() => handleDownload(false)}
            disabled={loadingAlgemeen}
            className="w-full flex items-center gap-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-left px-4 py-3.5 rounded-2xl transition-colors disabled:opacity-50"
          >
            <span className="text-2xl">🎉</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Algemeen Feest</p>
              <p className="text-xs text-gray-500">Verjaardag, bedrijfsfeest, jubileum...</p>
            </div>
            {loadingAlgemeen
              ? <span className="text-xs text-blue-500 font-medium">Genereren...</span>
              : <FileDown size={16} className="text-blue-400 flex-shrink-0" />
            }
          </button>
        </div>

        <div className="mt-5 bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 text-center">
            Het PDF-bestand bevat invulbare tekstvelden en checkboxes.<br />
            Openen in <span className="font-medium">Adobe Acrobat, Preview (Mac) of Bestanden (iPad)</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
