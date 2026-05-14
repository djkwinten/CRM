import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import logoUrl from '../assets/logo-dj-kwinten.jpg'
import handtekeningDJUrl from '../assets/handtekening-dj-kwinten.png'

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
  retro_booth: 'Photobooth met Prints',
  draadloze_speaker: 'Extra Luidspreker Receptie',
  karaoke: 'Karaoke',
}

function fmt(val?: string | null) {
  return val || '—'
}

function euroFmt(val?: number | null) {
  if (!val && val !== 0) return '—'
  return `€${val.toFixed(2).replace('.', ',')}`
}

/** Bereken totaal vanuit basisprijs + extra_prijzen JSON — zelfde logica als BookingDetail */
function berekenTotaal(b: Booking): { basisprijs: number; extras: { label: string; prijs: number }[]; korting: number; totaal: number } {
  const basisprijs = Number(b.basisprijs) || 0
  let extraPrijzen: Record<string, number> = {}
  try { extraPrijzen = JSON.parse(b.extra_prijzen || '{}') } catch {}

  const korting = Number(extraPrijzen['_korting']) || 0
  const extras: { label: string; prijs: number }[] = []

  for (const [key, label] of Object.entries(EXTRA_LABELS)) {
    const isGeselecteerd = !!(b as unknown as Record<string, unknown>)[key]
    if (isGeselecteerd) {
      const prijs = Number(extraPrijzen[key] ?? 0)
      extras.push({ label, prijs })
    }
  }

  const extrasTotal = extras.reduce((s, e) => s + e.prijs, 0)
  const totaal = Math.max(0, Number(basisprijs) + extrasTotal - korting)
  return { basisprijs, extras, korting, totaal }
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

  const { basisprijs, extras, korting, totaal } = berekenTotaal(booking)
  const restbedrag = Math.max(0, totaal - VOORSCHOT)

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
      ['Locatie', fmt(booking.locatie_naam), 'Thema', fmt(booking.thema)],
      ['Aantal Gasten', booking.aantal_gasten ? `${booking.aantal_gasten} personen` : '—', 'Adres Zaal', fmt(booking.locatie_adres)],
    ],
    alternateRowStyles: { fillColor: [245, 248, 255] },
  })

  y = (doc as any).lastAutoTable.finalY + 5

  // Planning
  const planningItems = [
    ['Ceremonie', fmt(booking.uur_ceremonie)],
    ['Receptie', fmt(booking.uur_receptie)],
    ['Diner', fmt(booking.uur_diner)],
    ['Dessert', fmt(booking.uur_dessert)],
    ['Dansfeest', fmt(booking.uur_dansfeest)],
    ['Midnight Snack', fmt(booking.uur_midnightsnack)],
    ['Einduur', fmt(booking.einduur)],
  ].filter(([, v]) => v !== '—')

  if (planningItems.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(80, 80, 80)
    doc.text('Planning', margin, y + 4)
    y += 6

    const half = Math.ceil(planningItems.length / 2)
    const left = planningItems.slice(0, half)
    const right = planningItems.slice(half)
    const rows = left.map((l, i) => [...l, ...(right[i] || ['', ''])])

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 35 },
        1: { fontStyle: 'bold', textColor: [0, 100, 200], cellWidth: 25 },
        2: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 35 },
        3: { fontStyle: 'bold', textColor: [0, 100, 200], cellWidth: 25 },
      },
      body: rows,
      alternateRowStyles: { fillColor: [245, 248, 255] },
    })
    y = (doc as any).lastAutoTable.finalY + 5
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
      'Basisprijs DJ Kwinten',
      { content: euroFmt(basisprijs), styles: { halign: 'right', textColor: [20, 20, 20] } }
    ])
  }

  for (const extra of extras) {
    prijsRows.push([
      `+ ${extra.label}`,
      { content: euroFmt(extra.prijs), styles: { halign: 'right', textColor: [20, 20, 20] } }
    ])
  }

  if (korting > 0) {
    prijsRows.push([
      { content: 'Korting', styles: { textColor: [34, 139, 34] } },
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
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 'auto' },
    },
    body: prijsRows,
    alternateRowStyles: { fillColor: [248, 250, 255] },
  })

  y = (doc as any).lastAutoTable.finalY + 3

  // Prijsvoorbehoud noot
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(
    'Bovenstaande prijs betreft de basisprijs. Naargelang bijkomende opties of wijzigingen kan de prijs worden aangepast in onderling overleg.',
    margin, y
  )
  y += 6

  // Betalingsinstructies box
  const instrText = 'Voor de bevestiging van uw boeking vragen wij een vast voorschot van €100,00. U krijgt hiervan binnenkort een Billit factuur via mail.'

  doc.setFillColor(235, 245, 255)
  doc.setDrawColor(0, 122, 255)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'FD')
  doc.setTextColor(0, 80, 180)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('Betaalinstructies:', margin + 3, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 80)
  const instrLines = doc.splitTextToSize(instrText, contentW - 6)
  doc.text(instrLines[0] || instrText, margin + 3, y + 10)
  y += 19

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
    ['1. Akkoord via Betaling & Handtekening',
      'Door betaling van het voorschot van €100,00 én door digitale handtekening verklaart de opdrachtgever zich uitdrukkelijk akkoord met deze volledige overeenkomst.'],
    ['2. Annulering',
      'Als het feest door onvoorziene omstandigheden niet kan plaatsvinden, zal de organisator de DJ zo snel mogelijk op de hoogte brengen.\nKosteloos annuleren tot 21 dagen voor het feest. Het voorschot kan in overleg worden omgezet in een waardebon. Bij latere annulering geldt het voorschot als schadevergoeding (uitgezonderd overmacht).'],
    ['3. Auteursrechten',
      'De organisator is verantwoordelijk voor Sabam/Unisono (meestal gedekt door de zaal bij privéfeesten).'],
    ['4. Aansprakelijkheid',
      'De DJ is niet aansprakelijk voor schade, verlies of diefstal van persoonlijke bezittingen van gasten, noch voor schade aan het evenemententerrein veroorzaakt door derden.'],
    ['5. Verzekeringen, Schade & Veiligheid',
      'De organisator beschikt over een polis burgerlijke aansprakelijkheid. De DJ is verzekerd voor schade die hij zelf aan derden veroorzaakt.\n\nSchade of diefstal van apparatuur door derden (gasten, bezoekers, dieren…) valt niet onder de DJ-verzekering en kan integraal worden verhaald op de organisator of diens verzekering.\n\nOpzettelijke of nalatige schade: De organisator is volledig financieel verantwoordelijk voor schade aan DJ-apparatuur die opzettelijk of door grove nalatigheid wordt veroorzaakt (bijv. mic drops, beschadiging uplights, morsen van drank). Kosten voor herstel/vervanging worden bepaald door een erkend reparateur.'],
    ['6. Voorzieningen',
      'De klant/organisator draagt er zorg voor dat er voldoende tafels of voorzieningen aanwezig zijn waar drank en andere consumpties veilig kunnen worden geplaatst. Het is niet toegestaan om apparatuur van de DJ (waaronder luidsprekers, booth, mengpanelen en flightcases) als tafel of afzetruimte te gebruiken.'],
    ['7. Varia',
      'Consumpties voor de DJ dienen voorzien te worden op kosten van de organisator, alsook een warme maaltijd indien het aanvangsuur van de DJ voor 20u ligt.\n\nDe DJ-prestaties zijn ingevolge artikel 44§2,8° van het wetboek vrijgesteld van BTW.'],
    ['8. Beeldmateriaal',
      `De DJ heeft het recht om tijdens het evenement foto- en video-opnames te maken voor veiligheids- en bewijsdoeleinden. Deze worden niet openbaar gemaakt en enkel gebruikt indien noodzakelijk. De organisator erkent dat deze opnames kunnen dienen als bewijsmateriaal (bijv. bij schade door gasten).\n\nGebruik voor promotionele doeleinden (website, sociale media) enkel met voorafgaande toestemming.\n\nToestemming promotioneel gebruik: ${booking.toestemming_foto === 1 ? '✓ JA' : booking.toestemming_foto === 0 ? '✗ NEE' : '☐ JA     ☐ NEE'}`],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [60, 60, 60], cellWidth: 48 },
      1: { textColor: [40, 40, 40] },
    },
    body: voorwaarden,
    alternateRowStyles: { fillColor: [248, 248, 252] },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // ── ONDERTEKENINGSBLOK ────────────────────────────────────────────────────
  if (y > 245) {
    doc.addPage()
    y = 20
  }

  doc.setTextColor(0, 122, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('AKKOORD & BEVESTIGING', margin, y)
  doc.setDrawColor(0, 122, 255)
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(60, 60, 60)
  const akkoordTekst = 'Door betaling van het voorschot van €100,00 én door digitale handtekening bevestigt de opdrachtgever kennis te hebben genomen van en akkoord te gaan met alle bovenstaande voorwaarden. De opdrachtgever begrijpt dat de vermelde prijs een basisprijs is en dat de uiteindelijke prijs kan worden aangepast naargelang bijkomende opties of wijzigingen.'
  doc.text(doc.splitTextToSize(akkoordTekst, contentW), margin, y)
  y += 12

  const sigW = (contentW - 10) / 2
  const sig2X = margin + sigW + 10

  // DJ handtekening
  doc.setFillColor(248, 248, 252)
  doc.roundedRect(margin, y, sigW, 28, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  doc.text('DJ Kwinten', margin + 3, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(130, 130, 130)
  doc.text('Den Tandt Kwinten', margin + 3, y + 11)
  try {
    // Handtekening DJ — gebundeld als Vite asset
    doc.addImage(handtekeningDJUrl, 'PNG', margin + 3, y + 12, sigW - 6, 9)
  } catch { /* overslaan indien niet beschikbaar */ }
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(margin + 3, y + 22, margin + sigW - 3, y + 22)
  doc.setFontSize(6.5)
  doc.text('Handtekening / Datum', margin + 3, y + 26)

  // Opdrachtgever handtekening
  doc.setFillColor(248, 248, 252)
  doc.roundedRect(sig2X, y, sigW, 28, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  doc.text('Opdrachtgever', sig2X + 3, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(130, 130, 130)
  doc.text(fmt(booking.naam_organisator), sig2X + 3, y + 11)
  if (booking.handtekening_klant) {
    try {
      doc.addImage(`data:image/png;base64,${booking.handtekening_klant}`, 'PNG', sig2X + 3, y + 12, sigW - 6, 10)
    } catch {}
  }
  doc.setDrawColor(180, 180, 180)
  doc.line(sig2X + 3, y + 22, sig2X + sigW - 3, y + 22)
  doc.setFontSize(6.5)
  doc.text('Handtekening / Datum', sig2X + 3, y + 26)

  y += 36

  if (booking.billit_factuur_naam) {
    doc.setFillColor(235, 245, 255)
    doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(0, 80, 180)
    doc.text('Bijlage:', margin + 3, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 120)
    doc.text(`Billit Voorschotfactuur — ${booking.billit_factuur_naam}`, margin + 18, y + 4.5)
    doc.setFontSize(6.5)
    doc.setTextColor(100, 100, 150)
    doc.text('(Zie factuur voor QR-code betaling voorschot)', margin + 3, y + 8.5)
    y += 14
  }

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
