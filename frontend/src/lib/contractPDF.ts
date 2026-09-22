import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import logoUrl from '../assets/logo-dj-kwinten.jpg'
import { DISCOUNT_NOTE_EXTRA_KEY, getExpandedWeddingFormulaIncludes, getWeddingFormulaFromExtraPrices, isWeddingBooking, parseExtraPrices, WeddingFormula } from '../config/weddingFormulas'

const DJ_INFO = {
  naam: 'Den Tandt Kwinten (DJ Kwinten)',
  adres: 'Loskaai 26, 9800 Grammene',
  telefoon: '0498/21 64 48',
  email: 'DJKWINTEN@gmail.com',
  btw: 'BTW BE 0726.773.488 (Vrijgesteld van BTW volgens Art. 44)',
}

const VOORSCHOT = 100

const EXTRA_LABELS: Record<string, string> = {
  ceremonie_set: 'Ceremonie Set',
  digital_booth: 'Digitale Photobooth',
  retro_booth: 'Luxe Photobooth met prints',
  draadloze_speaker: 'Extra Luidspreker Receptie',
  karaoke: 'Karaoke',
}

const VOORZIENING_LABELS: Record<string, string> = {
  speakers_aanwezig: 'Geluidsinstallatie',
  licht_aanwezig: 'Lichtinstallatie',
  micro_aanwezig: 'Microfoon',
  dj_booth_aanwezig: 'DJ-booth / DJ-tafel',
  uplights_aanwezig: 'Uplights',
}

function fmt(val?: string | null) {
  return val || '—'
}

function euroFmt(val?: number | null) {
  if (!val && val !== 0) return '—'
  return `€ ${val.toFixed(2).replace('.', ',')}`
}

/** Bereken totaal vanuit basisprijs + extra_prijzen JSON — zelfde logica als BookingDetail */
function berekenTotaal(b: Booking): { basisprijs: number; extras: { label: string; prijs: number }[]; korting: number; kortingUitleg?: string; totaal: number; kmInfo?: string; formule?: WeddingFormula | null } {
  const basisprijs = Number(b.basisprijs) || 0
  const extraPrijzen = parseExtraPrices(b.extra_prijzen)

  const korting = Number(extraPrijzen['_korting']) || 0
  const kortingUitleg = String(extraPrijzen[DISCOUNT_NOTE_EXTRA_KEY] || '').trim() || undefined
  const formule = isWeddingBooking(b) ? getWeddingFormulaFromExtraPrices(b.extra_prijzen) : null
  const extras: { label: string; prijs: number }[] = []

  for (const [key, label] of Object.entries(EXTRA_LABELS)) {
    const isGeselecteerd = !!(b as unknown as Record<string, unknown>)[key]
    const isHistorischeCeremonie = key === 'ceremonie_set' && !!formule
    if (isGeselecteerd && !isHistorischeCeremonie) {
      const prijs = Number(extraPrijzen[key] ?? 0)
      extras.push({ label, prijs })
    }
  }

  const kmVergoeding = Number(extraPrijzen['_km_vergoeding']) || 0
  const kmAfstand = Number(extraPrijzen['_km_afstand']) || 0
  const kmGratis = Number(extraPrijzen['_km_gratis'] ?? 20)
  const kmRitten = Number(extraPrijzen['_km_ritten'] ?? 2)
  const kmPrijs = Number(extraPrijzen['_km_prijs']) || 0
  let kmInfo: string | undefined
  if (kmVergoeding > 0) {
    extras.push({ label: 'Kilometervergoeding', prijs: kmVergoeding })
    kmInfo = `${Math.max(0, kmAfstand - kmGratis).toFixed(1).replace('.', ',')} betalende km x ${kmRitten} ritten x € ${kmPrijs.toFixed(2).replace('.', ',')}/km (eerste ${kmGratis} km gratis)`
  }

  const extrasTotal = extras.reduce((s, e) => s + e.prijs, 0)
  const totaal = Math.max(0, Number(basisprijs) + extrasTotal - korting)
  return { basisprijs, extras, korting, kortingUitleg, totaal, kmInfo, formule }
}

/** Gebruik de unwrapped jsPDF output functie — omzeilt de SAFE wrapper die errors slikt */
function rawOutput(doc: jsPDF, type: string): unknown {
  // doc.output is de SAFE wrapper; .bar is de originele unwrapped functie
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrapped = (doc.output as any).bar as ((type: string) => unknown) | undefined
  if (unwrapped) {
    return unwrapped.call(doc, type)
  }
  // Fallback: gewone output call
  return doc.output(type as Parameters<typeof doc.output>[0])
}

export function generateContractPDFBase64(booking: Booking): string {
  const doc = _buildContractPDF(booking)
  const dataUri = rawOutput(doc, 'datauristring') as string
  if (!dataUri || typeof dataUri !== 'string') {
    throw new Error('PDF generatie mislukt: geen output van jsPDF')
  }
  // "data:application/pdf;filename=...;base64,<BASE64>"
  const base64 = dataUri.split(';base64,')[1]
  if (!base64) {
    throw new Error('PDF generatie mislukt: ongeldige data URI')
  }
  return base64
}

export function generateContractPDF(booking: Booking) {
  const base64 = generateContractPDFBase64(booking)
  const naam = (booking.naam_organisator || 'boeking').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const datum = booking.feest_datum || 'datum'
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contract-djkwinten-${naam}-${datum}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function _buildContractPDF(booking: Booking): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 14
  const contentW = pageW - margin * 2
  const datumStr = booking.feest_datum
    ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl })
    : '—'
  const gegeneerdOp = format(new Date(), 'd MMMM yyyy', { locale: nl })

  const { basisprijs, extras, korting, kortingUitleg, totaal, kmInfo, formule } = berekenTotaal(booking)
  const restbedrag = Math.max(0, totaal - VOORSCHOT)
  const voorzieningen = Object.entries(VOORZIENING_LABELS)
    .filter(([key]) => !!(booking as unknown as Record<string, unknown>)[key])
    .map(([, label]) => label)

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(0, 122, 255)
  doc.rect(0, 0, pageW, 38, 'F')
  doc.setFillColor(88, 86, 214)
  doc.rect(0, 36, pageW, 2, 'F')

  // Logo links in header (gebundeld via Vite import — geen fetch nodig)
  try {
    doc.addImage(logoUrl, 'JPEG', margin, 4, 28, 28)
  } catch { /* logo niet beschikbaar, overslaan */ }

  // Titel rechts in header
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('GEAUTOMATISEERDE OVEREENKOMST', pageW - margin, 14, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('DJ KWINTEN', pageW - margin, 21, { align: 'right' })
  doc.setFontSize(7.5)
  doc.setTextColor(220, 235, 255)
  doc.text(`Gegenereerd: ${gegeneerdOp}`, pageW - margin, 28, { align: 'right' })

  let y = 48

  // ── SECTIE 1: PARTIJEN ────────────────────────────────────────────────────
  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('1. PARTIJEN', margin, y)
  doc.setDrawColor(0, 122, 255)
  doc.setLineWidth(0.3)
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5)
  y += 7

  const colW = (contentW - 6) / 2
  const col2X = margin + colW + 6

  // DJ kolom
  doc.setFillColor(240, 247, 255)
  doc.roundedRect(margin, y, colW, 38, 2, 2, 'F')
  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('DJ', margin + 3, y + 6)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(DJ_INFO.naam, margin + 3, y + 12)
  doc.text(DJ_INFO.adres, margin + 3, y + 18)
  doc.text(DJ_INFO.telefoon, margin + 3, y + 24)
  doc.text(DJ_INFO.email, margin + 3, y + 30)
  doc.setFontSize(6.5)
  doc.setTextColor(100, 100, 100)
  doc.text(DJ_INFO.btw, margin + 3, y + 36)

  // Opdrachtgever kolom
  doc.setFillColor(248, 248, 252)
  doc.roundedRect(col2X, y, colW, 38, 2, 2, 'F')
  doc.setTextColor(88, 86, 214)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('OPDRACHTGEVER', col2X + 3, y + 6)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(fmt(booking.naam_organisator), col2X + 3, y + 12)
  doc.text(fmt(booking.adres_organisator), col2X + 3, y + 18)
  doc.text(fmt(booking.telefoon), col2X + 3, y + 24)
  doc.text(fmt(booking.email), col2X + 3, y + 30)
  y += 45

  // ── SECTIE 2: FEESTGEGEVENS ───────────────────────────────────────────────
  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('2. FEESTGEGEVENS', margin, y)
  doc.setDrawColor(0, 122, 255)
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5)
  y += 7

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 45 },
      1: { textColor: [20, 20, 20] },
      2: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 40 },
      3: { textColor: [20, 20, 20] },
    },
    body: [
      ['Datum', datumStr, 'Type Feest', fmt(booking.type_feest)],
      ['Locatie', fmt(booking.locatie_naam), 'Adres Zaal', fmt(booking.locatie_adres)],
      ['Aantal Gasten', booking.aantal_gasten ? `${booking.aantal_gasten} personen` : '—', 'Gewenste start dansfeest', fmt(booking.uur_dansfeest)],
    ],
    alternateRowStyles: { fillColor: [245, 248, 255] },
  })

  y = (doc as any).lastAutoTable.finalY + 5

  // Tijdschema bewust niet opnemen in het contract.
  // Het contract bevat enkel de basis eventgegevens, financiële afspraken en voorwaarden.

  // Formule en voorzieningen compact samenvatten.
  const formuleInbegrepen = formule ? getExpandedWeddingFormulaIncludes(formule) : []
  const voorzieningenRows = [
    ...(formule ? [
      ['Trouwformule', formule.label],
      ['Aanwezigheid DJ', formule.arrivalMoment],
    ] : []),
    ['Voorzieningen', voorzieningen.length ? voorzieningen.join(', ') : '—'],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 7.6, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 40 },
      1: { textColor: [20, 20, 20] },
    },
    body: voorzieningenRows,
    alternateRowStyles: { fillColor: [248, 250, 255] },
  })
  y = (doc as any).lastAutoTable.finalY + 2

  if (formuleInbegrepen.length) {
    const aantalKolommen = 3
    const inbegrepenRows = []
    for (let index = 0; index < formuleInbegrepen.length; index += aantalKolommen) {
      inbegrepenRows.push(Array.from({ length: aantalKolommen }, (_, offset) => {
        const item = formuleInbegrepen[index + offset]
        return item ? `• ${item}` : ''
      }))
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [[{ content: 'INBEGREPEN IN DE TROUWFORMULE', colSpan: aantalKolommen }]],
      body: inbegrepenRows,
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.1, bottom: 1.1, left: 2.5, right: 2.5 },
        overflow: 'linebreak',
        lineColor: [225, 232, 242],
        lineWidth: 0.15,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [235, 245, 255],
        textColor: [0, 80, 180],
        fontStyle: 'bold',
        fontSize: 7.3,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: contentW / aantalKolommen },
        1: { cellWidth: contentW / aantalKolommen },
        2: { cellWidth: contentW / aantalKolommen },
      },
      alternateRowStyles: { fillColor: [249, 251, 255] },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  } else {
    y += 3
  }

  // ── SECTIE 3: FINANCIËLE AFSPRAKEN ───────────────────────────────────────
  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('3. FINANCIËLE AFSPRAKEN', margin, y)
  doc.setDrawColor(0, 122, 255)
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5)
  y += 7

  // Prijsdetail tabel: basisprijs + extra's per lijn + korting + totaal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prijsRows: any[] = []

  if (basisprijs > 0) {
    prijsRows.push([
      formule ? `Trouwformule: ${formule.label}` : 'Basisprijs DJ Kwinten',
      { content: euroFmt(basisprijs), styles: { halign: 'right', textColor: [20, 20, 20] } }
    ])
  }

  for (const extra of extras) {
    prijsRows.push([
      `+ ${extra.label}`,
      { content: euroFmt(extra.prijs), styles: { halign: 'right', textColor: [20, 20, 20] } }
    ])
  }

  if (kmInfo) {
    prijsRows.push([
      { content: `  ${kmInfo}`, styles: { fontSize: 7, textColor: [120, 90, 20] } },
      { content: '', styles: { halign: 'right' } }
    ])
  }

  if (korting > 0) {
    prijsRows.push([
      { content: kortingUitleg ? `Korting\n${kortingUitleg}` : 'Korting', styles: { textColor: [34, 139, 34] } },
      { content: `- ${euroFmt(korting)}`, styles: { halign: 'right', textColor: [34, 139, 34] } }
    ])
  }

  prijsRows.push([
    { content: 'TOTAALBEDRAG', styles: { fontStyle: 'bold', textColor: [0, 80, 180], fillColor: [235, 245, 255] } },
    { content: euroFmt(totaal), styles: { fontStyle: 'bold', fontSize: 11, halign: 'right', textColor: [0, 122, 255], fillColor: [235, 245, 255] } }
  ])

  prijsRows.push([
    { content: 'Voorschot (te betalen via Billit)', styles: { textColor: [80, 80, 80] } },
    { content: `- ${euroFmt(VOORSCHOT)}`, styles: { halign: 'right', textColor: [80, 80, 80] } }
  ])

  prijsRows.push([
    { content: 'Restbedrag (cash op dag / binnen 14 dagen na event)', styles: { fontStyle: 'bold', textColor: [34, 139, 34] } },
    { content: euroFmt(restbedrag), styles: { fontStyle: 'bold', fontSize: 10, halign: 'right', textColor: [34, 139, 34] } }
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 } },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 'auto' },
    },
    body: prijsRows,
    alternateRowStyles: { fillColor: [248, 250, 255] },
  })

  y = (doc as any).lastAutoTable.finalY + 4

  // Betalingsinstructies box
  const instrText = 'Voor de bevestiging van uw boeking vragen wij een vast voorschot van € 100,00. U krijgt hiervan binnenkort een Billit factuur via mail.'

  doc.setFillColor(235, 245, 255)
  doc.setDrawColor(0, 122, 255)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentW, 11, 2, 2, 'FD')
  doc.setTextColor(0, 80, 180)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Betaalinstructies:', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 80)
  const instrLines = doc.splitTextToSize(instrText, contentW - 6)
  doc.text(instrLines[0] || instrText, margin + 3, y + 8)
  y += 14

  // ── SECTIE 4: ALGEMENE VOORWAARDEN — altijd op nieuwe pagina ─────────────
  doc.addPage()
  y = 20

  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('4. ALGEMENE VOORWAARDEN & JURIDISCHE PUNTEN', margin, y)
  doc.setDrawColor(0, 122, 255)
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5)
  y += 7

  const voorwaarden = [
    ['1. Akkoord via Betaling',
      'Door betaling van het voorschot van € 100,00 verklaart de opdrachtgever zich akkoord met deze volledige overeenkomst.'],
    ['2. Annulering',
      'Als het feest door onvoorziene omstandigheden niet kan plaatsvinden, zal de organisator de DJ zo snel mogelijk op de hoogte brengen.\nKosteloos annuleren tot 21 dagen voor het feest. Het voorschot kan in overleg worden omgezet in een waardebon. Bij latere annulering geldt het voorschot als schadevergoeding (uitgezonderd overmacht).'],
    ['3. Auteursrechten',
      'De organisator is verantwoordelijk voor Sabam/Unisono (meestal gedekt door de zaal bij privéfeesten).'],
    ['4. Aansprakelijkheid',
      'De DJ is niet aansprakelijk voor schade, verlies of diefstal van persoonlijke bezittingen van gasten, noch voor schade aan het evenemententerrein veroorzaakt door derden.'],
    ['5. Verzekeringen, Schade & Veiligheid',
      'De organisator beschikt over een polis burgerlijke aansprakelijkheid. De DJ is verzekerd voor schade die hij zelf aan derden veroorzaakt.\nSchade of diefstal van apparatuur door derden (gasten, bezoekers, dieren…) valt niet onder de DJ-verzekering en kan integraal worden verhaald op de organisator of diens verzekering.\nOpzettelijke of nalatige schade: De organisator is volledig financieel verantwoordelijk voor schade aan DJ-apparatuur die opzettelijk of door grove nalatigheid wordt veroorzaakt (bijv. mic drops, beschadiging uplights, morsen van drank). Kosten voor herstel/vervanging worden bepaald door een erkend reparateur.'],
    ['6. Voorzieningen',
      'De klant/organisator draagt er zorg voor dat er voldoende tafels of voorzieningen aanwezig zijn waar drank en andere consumpties veilig kunnen worden geplaatst. Het is niet toegestaan om apparatuur van de DJ (waaronder luidsprekers, booth, mengpanelen en flightcases) als tafel of afzetruimte te gebruiken.'],
    ['7. Varia',
      'Consumpties voor de DJ dienen voorzien te worden op kosten van de organisator, alsook een warme maaltijd indien het aanvangsuur van de DJ voor 20u ligt.\nDe DJ-prestaties zijn ingevolge artikel 44§2,8° van het wetboek vrijgesteld van BTW.'],
    ['8. Beeldmateriaal',
      'De DJ heeft het recht om tijdens het evenement foto- en video-opnames te maken voor veiligheids- en bewijsdoeleinden. Deze worden niet openbaar gemaakt en enkel gebruikt indien noodzakelijk. De organisator erkent dat deze opnames kunnen dienen als bewijsmateriaal (bijv. bij schade door gasten).\nGebruik voor promotionele doeleinden (website, sociale media) gebeurt enkel met voorafgaande toestemming.'],
    ['Akkoord & bevestiging',
      'Door betaling van het voorschot van € 100,00 bevestigt de opdrachtgever kennis te hebben genomen van en akkoord te gaan met alle bovenstaande voorwaarden.'],
    ...(booking.billit_factuur_naam ? [[
      'Bijlage',
      `Billit voorschotfactuur — ${booking.billit_factuur_naam} (zie factuur voor QR-code betaling voorschot)`,
    ]] : []),
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 14 },
    theme: 'grid',
    styles: {
      fontSize: 8.25,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3.5, right: 3.5 },
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [226, 229, 236],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [45, 55, 70], cellWidth: 47, fillColor: [244, 248, 255] },
      1: { textColor: [35, 35, 40] },
    },
    rowPageBreak: 'avoid',
    body: voorwaarden,
    alternateRowStyles: { fillColor: [250, 250, 252] },
  })

  // ── FOOTER op elke pagina ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = 287
    doc.setFillColor(0, 122, 255)
    doc.rect(0, footerY, pageW, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('DJ Kwinten · Loskaai 26, 9800 Grammene · 0498/21 64 48 · DJKWINTEN@gmail.com · BTW BE 0726.773.488', pageW / 2, footerY + 4, { align: 'center' })
    doc.text(`Pagina ${p} / ${totalPages}`, pageW / 2, footerY + 8, { align: 'center' })
  }

  return doc
}
