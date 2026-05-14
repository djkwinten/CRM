import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar, CheckCircle2, ClipboardList, FileText, FolderOpen, MessageSquare, ExternalLink, Download, X } from 'lucide-react'
import { getBooking, getContractInfo, getBookingPDF } from '../lib/api'
import { Booking } from '../types/booking'
import { BookingContractInfo } from '../features/event-workspace/types'
import { ContractInfoForm } from '../features/event-workspace/components/ContractInfoForm'

export function EventPortal() {
  const { slug } = useParams<{ slug: string }>()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [contractInfo, setContractInfo] = useState<BookingContractInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState<'contract' | 'factuur' | null>(null)
  const [activeSection, setActiveSection] = useState<'contract' | 'vragenlijst' | 'bestanden' | 'communicatie' | null>(null)
  const [showFirstContractPopup, setShowFirstContractPopup] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    getBooking(slug).then(async b => {
      setBooking(b)
      if (b) {
        setContractInfo(await getContractInfo(b.id))
        const seenKey = `event-portal-contract-popup-seen-${b.slug || b.id}`
        if (!localStorage.getItem(seenKey)) setShowFirstContractPopup(true)
      }
      setLoading(false)
    })
  }, [slug])

  if (loading) return <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center text-gray-400 animate-pulse">Eventpagina laden...</div>
  if (!booking) return <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center text-gray-500">Eventpagina niet gevonden</div>

  const title = booking.portal_title || booking.naam_organisator || 'Jullie eventpagina'
  const questionnairePath = booking.slug ? `/vragenlijst/${booking.slug}?direct=1` : `/formulier/${booking.id}?direct=1`
  const hasContract = !!(booking.contract_pdf || booking.has_contract_pdf)
  const hasFactuur = !!(booking.billit_factuur_pdf || booking.has_billit_factuur_pdf)
  const contractInfoComplete = !!(
    contractInfo?.naam?.trim() &&
    contractInfo?.email?.trim() &&
    contractInfo?.gsm?.trim() &&
    contractInfo?.klant_adres?.trim() &&
    contractInfo?.event_type?.trim() &&
    contractInfo?.event_datum?.trim() &&
    contractInfo?.locatie_naam?.trim() &&
    contractInfo?.locatie_adres?.trim()
  )
  const contractLocked = !!(booking.status_contract || booking.has_contract_pdf)

  const openBase64PDF = (base64: string) => {
    const byteStr = atob(base64)
    const bytes = new Uint8Array(byteStr.length).map((_, i) => byteStr.charCodeAt(i))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const openPDF = async (type: 'contract' | 'factuur') => {
    setPdfLoading(type)
    try {
      const direct = type === 'contract' ? booking.contract_pdf : booking.billit_factuur_pdf
      if (direct) openBase64PDF(direct)
      else {
        const pdf = await getBookingPDF(String(booking.id), type)
        if (pdf) openBase64PDF(pdf)
        else alert('Document nog niet beschikbaar.')
      }
    } finally {
      setPdfLoading(null)
    }
  }

  const closeFirstContractPopup = () => {
    const seenKey = `event-portal-contract-popup-seen-${booking.slug || booking.id}`
    localStorage.setItem(seenKey, '1')
    setShowFirstContractPopup(false)
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <header className="bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE] px-4 sm:px-6 pb-8 pt-6 text-white">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-wider text-white/60 font-semibold">DJ Kwinten · Eventpagina</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-2">{title}</h1>
          <p className="text-sm text-white/75 mt-1 flex items-center gap-2">
            <Calendar size={14} /> {booking.feest_datum || 'Datum nog aan te vullen'} · {booking.type_feest}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 -mt-4 space-y-5 pb-12">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle2 size={18} className="text-green-600" /> Welkom</h2>
          <p className="text-sm text-gray-500 mt-2">Hier verzamelen we alle info voor jullie feest. Gebruik de knoppen hieronder om snel naar het juiste onderdeel te gaan.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setActiveSection(activeSection === 'contract' ? null : 'contract')} className="text-left bg-white rounded-2xl p-4 shadow-sm border border-transparent hover:border-[#007AFF] transition-colors">
            <FileText size={20} className="text-[#007AFF] mb-2" />
            <p className="font-bold text-gray-900 text-sm">Contract Info</p>
            <p className="text-xs text-gray-400 mt-0.5">Korte basisinfo</p>
          </button>
          {contractInfoComplete ? (
            <button onClick={() => setActiveSection(activeSection === 'vragenlijst' ? null : 'vragenlijst')} className="text-left bg-white rounded-2xl p-4 shadow-sm border border-transparent hover:border-[#007AFF] transition-colors">
              <ClipboardList size={20} className="text-[#007AFF] mb-2" />
              <p className="font-bold text-gray-900 text-sm">Vragenlijst</p>
              <p className="text-xs text-gray-400 mt-0.5">Planning & muziek</p>
            </button>
          ) : (
            <div className="bg-gray-100 rounded-2xl p-4 shadow-sm opacity-70">
              <ClipboardList size={20} className="text-gray-400 mb-2" />
              <p className="font-bold text-gray-500 text-sm">Vragenlijst</p>
              <p className="text-xs text-gray-400 mt-0.5">Eerst Contract Info invullen</p>
            </div>
          )}
          <button onClick={() => setActiveSection(activeSection === 'bestanden' ? null : 'bestanden')} className="text-left bg-white rounded-2xl p-4 shadow-sm border border-transparent hover:border-[#007AFF] transition-colors">
            <FolderOpen size={20} className="text-[#007AFF] mb-2" />
            <p className="font-bold text-gray-900 text-sm">Bestanden</p>
            <p className="text-xs text-gray-400 mt-0.5">Contract & factuur</p>
          </button>
          <button onClick={() => setActiveSection(activeSection === 'communicatie' ? null : 'communicatie')} className="text-left bg-white rounded-2xl p-4 shadow-sm border border-transparent hover:border-[#007AFF] transition-colors">
            <MessageSquare size={20} className="text-[#007AFF] mb-2" />
            <p className="font-bold text-gray-900 text-sm">Communicatie</p>
            <p className="text-xs text-gray-400 mt-0.5">Later beschikbaar</p>
          </button>
        </div>

        {activeSection === 'contract' && (
        <section id="contract-info">
          <div className="flex items-center gap-2 mb-2 px-1">
            <FileText size={16} className="text-[#007AFF]" />
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Contract Info</h2>
          </div>
          {contractInfo ? <ContractInfoForm bookingId={booking.id} initial={contractInfo} showFinancial={false} readOnly={contractLocked} onChange={setContractInfo} /> : <div className="text-gray-400">Contract info laden...</div>}
          {!contractInfoComplete && (
            <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 text-sm">
              Vul eerst alle verplichte Contract Info velden in. Daarna wordt de vragenlijst beschikbaar.
            </div>
          )}
        </section>
        )}

        {activeSection === 'vragenlijst' && (
        <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={18} className="text-[#007AFF]" /> Uitgebreide vragenlijst</h2>
          <p className="text-sm text-gray-500">De info uit Contract Info wordt automatisch overgenomen in de vragenlijst. Vul daarna de uitgebreide planning en muziekdetails aan.</p>
          {contractInfoComplete ? (
            <a href={questionnairePath} className="inline-flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
              <ExternalLink size={15} /> Open vragenlijst
            </a>
          ) : (
            <button disabled className="inline-flex items-center gap-2 bg-gray-200 text-gray-400 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed">
              <ExternalLink size={15} /> Eerst Contract Info invullen
            </button>
          )}
        </section>
        )}

        {activeSection === 'bestanden' && (
        <section id="bestanden" className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={18} className="text-[#007AFF]" /> Bestanden</h2>
          <p className="text-sm text-gray-400 mt-2">Hier komen documenten zoals overeenkomst en voorschotfactuur terecht.</p>
          <div className="space-y-2 mt-4">
            {hasContract ? (
              <button onClick={() => openPDF('contract')} disabled={pdfLoading === 'contract'} className="w-full flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left disabled:opacity-60">
                <FileText size={18} className="text-blue-600" />
                <div className="flex-1"><p className="text-sm font-semibold text-blue-700">Overeenkomst</p><p className="text-xs text-blue-500">{pdfLoading === 'contract' ? 'Laden...' : 'Openen/downloaden'}</p></div>
                <Download size={15} className="text-blue-500" />
              </button>
            ) : <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">Overeenkomst nog niet beschikbaar.</div>}
            {hasFactuur ? (
              <button onClick={() => openPDF('factuur')} disabled={pdfLoading === 'factuur'} className="w-full flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 transition-colors text-left disabled:opacity-60">
                <FileText size={18} className="text-green-600" />
                <div className="flex-1"><p className="text-sm font-semibold text-green-700">Voorschotfactuur</p><p className="text-xs text-green-500">{pdfLoading === 'factuur' ? 'Laden...' : 'Openen/downloaden'}</p></div>
                <Download size={15} className="text-green-500" />
              </button>
            ) : <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">Voorschotfactuur nog niet beschikbaar.</div>}
          </div>
        </section>
        )}

        {activeSection === 'communicatie' && (
        <section id="communicatie" className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-[#007AFF]" /> Communicatie</h2>
          <p className="text-sm text-gray-400 mt-2">Binnenkort verschijnt hier een eenvoudige communicatie-timeline.</p>
        </section>
        )}

        {!activeSection && (
          <div className="text-center text-xs text-gray-400 py-4">Kies hierboven een onderdeel om de inhoud te openen.</div>
        )}
      </main>

      {showFirstContractPopup && contractInfo && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-6">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900">Eerst even Contract Info controleren</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Dit verschijnt alleen bij het eerste bezoek aan deze klantpagina.</p>
                </div>
                <button onClick={closeFirstContractPopup} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <ContractInfoForm bookingId={booking.id} initial={contractInfo} showFinancial={false} readOnly={contractLocked} onChange={setContractInfo} />
                <button onClick={closeFirstContractPopup} className="mt-4 w-full bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors">
                  Klaar / later verdergaan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
