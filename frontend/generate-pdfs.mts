import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFForm } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'fs'

const BLAUW = rgb(0, 0.478, 1)
const DONKER = rgb(0.11, 0.11, 0.13)
const GRIJS_LT = rgb(0.95, 0.95, 0.96)
const GRIJS_RND = rgb(0.6, 0.6, 0.63)
const WIT = rgb(1, 1, 1)
const ROZE = rgb(0.95, 0.2, 0.5)

const A4_W = 595.28
const A4_H = 841.89
const MARGE = 40
const COL_W = (A4_W - MARGE * 2 - 10) / 2
const LIJN_H = 22
const VELD_H = 18

function addPage(doc: PDFDocument): { page: PDFPage; y: number } {
  const page = doc.addPage([A4_W, A4_H])
  return { page, y: A4_H - MARGE }
}

function sectieHeader(page: PDFPage, boldFont: PDFFont, titel: string, x: number, y: number, breedte: number): number {
  page.drawRectangle({ x, y: y - 14, width: breedte, height: 16, color: DONKER, borderColor: DONKER, borderWidth: 0 })
  page.drawText(titel.toUpperCase(), { x: x + 6, y: y - 10, size: 7.5, font: boldFont, color: WIT })
  return y - 20
}

function veldLabel(page: PDFPage, font: PDFFont, label: string, x: number, y: number) {
  page.drawText(label, { x, y, size: 7, font, color: GRIJS_RND })
}

function tekstVeld(form: PDFForm, page: PDFPage, naam: string, x: number, y: number, breedte: number, hoogte = VELD_H, multiline = false) {
  const field = form.createTextField(naam)
  field.addToPage(page, {
    x, y: y - hoogte, width: breedte, height: hoogte,
    borderColor: rgb(0.8, 0.8, 0.82),
    borderWidth: 0.8,
    backgroundColor: GRIJS_LT,
  })
  if (multiline) field.enableMultiline()
  field.setFontSize(9)
}

function checkVeld(form: PDFForm, page: PDFPage, naam: string, x: number, y: number, label: string, font: PDFFont) {
  const cb = form.createCheckBox(naam)
  cb.addToPage(page, {
    x, y: y - 10, width: 10, height: 10,
    borderColor: rgb(0.7, 0.7, 0.72),
    borderWidth: 0.8,
    backgroundColor: WIT,
  })
  page.drawText(label, { x: x + 14, y: y - 8, size: 8, font, color: DONKER })
}

function tijdVeld(form: PDFForm, page: PDFPage, font: PDFFont, label: string, naam: string, x: number, y: number): number {
  page.drawText(label, { x: x + 4, y: y - 8, size: 8.5, font, color: DONKER })
  const tijdX = x + 260
  tekstVeld(form, page, naam, tijdX, y, 60, 14)
  page.drawText('u', { x: tijdX + 65, y: y - 10, size: 8, font, color: GRIJS_RND })
  page.drawLine({ start: { x, y: y - 16 }, end: { x: x + 340, y: y - 16 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.90) })
  return y - 18
}

function nummerveld(form: PDFForm, page: PDFPage, font: PDFFont, label: string, naam: string, x: number, y: number, breedte = 340): number {
  page.drawText(label, { x: x + 4, y: y - 8, size: 8, font, color: GRIJS_RND })
  tekstVeld(form, page, naam, x + 130, y, breedte - 130, 14)
  page.drawLine({ start: { x, y: y - 16 }, end: { x: x + breedte, y: y - 16 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.90) })
  return y - 18
}

async function generatePDF(isTrouw: boolean): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const form = doc.getForm()

  const typeLabel = isTrouw ? 'Trouwfeest' : 'Algemeen Feest'
  let counter = 0
  const uid = (prefix: string) => `${prefix}_${counter++}`

  // PAGINA 1
  let { page, y } = addPage(doc)

  page.drawRectangle({ x: 0, y: A4_H - 52, width: A4_W, height: 52, color: DONKER })
  page.drawText('DJ KWINTEN', { x: MARGE, y: A4_H - 22, size: 14, font: bold, color: WIT })
  page.drawText('Den Tandt Kwinten  -  0498/21 64 48  -  DJKWINTEN@gmail.com  -  BTW BE 0726.773.488', {
    x: MARGE, y: A4_H - 36, size: 7.5, font, color: rgb(0.7, 0.7, 0.73),
  })
  const typeW = bold.widthOfTextAtSize(typeLabel, 13)
  page.drawText(typeLabel, { x: A4_W - MARGE - typeW, y: A4_H - 22, size: 13, font: bold, color: isTrouw ? ROZE : BLAUW })
  page.drawText('VRAGENLIJST', { x: A4_W - MARGE - bold.widthOfTextAtSize('VRAGENLIJST', 8), y: A4_H - 36, size: 8, font: bold, color: WIT })

  y = A4_H - 62
  veldLabel(page, font, 'Datum ingevuld', A4_W - MARGE - 110, y - 2)
  tekstVeld(form, page, uid('datum_ingevuld'), A4_W - MARGE - 110, y - 10, 110)
  y -= 12

  // SECTIE 1 — CONTACTGEGEVENS
  y = sectieHeader(page, bold, '1. Contactgegevens', MARGE, y - 4, A4_W - MARGE * 2)

  if (isTrouw) {
    const pinkBox = rgb(1, 0.95, 0.97)
    page.drawRectangle({ x: MARGE, y: y - 32, width: A4_W - MARGE * 2, height: 34, color: pinkBox, borderColor: ROZE, borderWidth: 0.5 })
    page.drawText('Namen van het koppel', { x: MARGE + 6, y: y - 10, size: 8, font: bold, color: ROZE })
    veldLabel(page, font, 'Partner 1', MARGE + 6, y - 18)
    tekstVeld(form, page, uid('naam_partner1'), MARGE + 6, y - 20, COL_W - 8)
    veldLabel(page, font, 'Partner 2', MARGE + COL_W + 14, y - 18)
    tekstVeld(form, page, uid('naam_partner2'), MARGE + COL_W + 14, y - 20, COL_W - 8)
    y -= 38
  }

  const grid2 = (labels: [string, string][], startY: number): number => {
    let gy = startY
    for (const [l1, l2] of labels) {
      veldLabel(page, font, l1, MARGE, gy - 2)
      tekstVeld(form, page, uid(l1.toLowerCase().replace(/\W+/g, '_')), MARGE, gy - 4, COL_W)
      if (l2) {
        veldLabel(page, font, l2, MARGE + COL_W + 10, gy - 2)
        tekstVeld(form, page, uid(l2.toLowerCase().replace(/\W+/g, '_')), MARGE + COL_W + 10, gy - 4, COL_W)
      }
      gy -= LIJN_H
    }
    return gy
  }

  const contactVelden: [string, string][] = isTrouw
    ? [
        ['E-mailadres *', 'Telefoonnummer *'],
        ['Adres organisator', 'Datum feest *'],
        ['Aantal gasten (schatting)', 'Thema / Dress Code'],
      ]
    : [
        ['Naam organisator *', 'Bedrijfsnaam'],
        ['E-mailadres *', 'Telefoonnummer *'],
        ['Adres organisator', 'Datum feest *'],
        ['Aantal gasten (schatting)', 'Thema / Dress Code'],
        ['Type feest', ''],
      ]

  y = grid2(contactVelden, y - 6)
  y -= 4
  page.drawText('Back-up contact op de avond (ceremoniemeester of contactpersoon)', { x: MARGE, y: y - 2, size: 7.5, font: bold, color: DONKER })
  y -= 6
  veldLabel(page, font, 'Naam', MARGE, y - 2)
  tekstVeld(form, page, uid('backup_naam'), MARGE, y - 4, COL_W)
  veldLabel(page, font, 'Telefoonnummer', MARGE + COL_W + 10, y - 2)
  tekstVeld(form, page, uid('backup_tel'), MARGE + COL_W + 10, y - 4, COL_W)
  y -= LIJN_H + 4

  // SECTIE 2 — LOCATIE
  y = sectieHeader(page, bold, '2. Locatie & Logistiek', MARGE, y, A4_W - MARGE * 2)
  y = grid2([
    ['Naam feestzaal / locatie', 'Adres zaal'],
    ['Zaal contact (naam + tel)', 'Wifi-code'],
    ['Geluidsbeperking / decibellimiet', 'Parkeerinformatie'],
  ], y - 6)
  y -= 4
  checkVeld(form, page, uid('gelijkvloers'), MARGE, y, 'Gelijkvloers toegankelijk (geen trappen of lift)', font)
  y -= 16

  // SECTIE 3 — PLANNING
  y = sectieHeader(page, bold, '3. Planning & Tijdstippen', MARGE, y, A4_W - MARGE * 2)
  y -= 4

  if (isTrouw) y = tijdVeld(form, page, font, 'Ceremonie', uid('uur_ceremonie'), MARGE, y)
  y = tijdVeld(form, page, font, 'Receptie - start', uid('uur_receptie'), MARGE, y)
  y = tijdVeld(form, page, font, 'Receptie - einde', uid('uur_receptie_einde'), MARGE, y)
  if (isTrouw) {
    y = tijdVeld(form, page, font, '2e Receptie - start (optioneel)', uid('uur_receptie2'), MARGE, y)
    y = tijdVeld(form, page, font, '2e Receptie - einde (optioneel)', uid('uur_receptie2_einde'), MARGE, y)
  }
  y = tijdVeld(form, page, font, 'Diner', uid('uur_diner'), MARGE, y)
  y = tijdVeld(form, page, font, 'Dessert', uid('uur_dessert'), MARGE, y)
  y = tijdVeld(form, page, font, 'Dansfeest', uid('uur_dansfeest'), MARGE, y)
  y = tijdVeld(form, page, font, 'Midnight Snack', uid('uur_midnightsnack'), MARGE, y)
  y = tijdVeld(form, page, font, 'Einduur', uid('einduur'), MARGE, y)

  y -= 4
  page.drawText('Andere momenten (speeches, verrassingen, ...)', { x: MARGE, y: y - 2, size: 7.5, font: bold, color: DONKER })
  y -= 6
  for (let i = 1; i <= 3; i++) {
    veldLabel(page, font, `Moment ${i}`, MARGE, y - 2)
    tekstVeld(form, page, uid(`moment_${i}`), MARGE + 50, y - 4, 200)
    veldLabel(page, font, 'Uur', MARGE + 258, y - 2)
    tekstVeld(form, page, uid(`moment_${i}_uur`), MARGE + 270, y - 4, 60)
    y -= LIJN_H
  }

  // PAGINA 2
  let p2 = addPage(doc)
  page = p2.page
  y = p2.y

  page.drawRectangle({ x: 0, y: A4_H - 24, width: A4_W, height: 24, color: DONKER })
  page.drawText('DJ KWINTEN - Vragenlijst (vervolg)', { x: MARGE, y: A4_H - 15, size: 9, font: bold, color: WIT })
  page.drawText(typeLabel, { x: A4_W - MARGE - bold.widthOfTextAtSize(typeLabel, 9), y: A4_H - 15, size: 9, font: bold, color: isTrouw ? ROZE : BLAUW })
  y = A4_H - 34

  // SECTIE 4 — MUZIEK
  y = sectieHeader(page, bold, '4. Muziekwensen', MARGE, y, A4_W - MARGE * 2)
  y -= 6

  const muziekVelden: [string, number][] = [
    ['Favoriete genres / Top genres', 28],
    ['Genres die NIET mogen', 28],
    ['Must-play nummers', 28],
    ['Do Not Play nummers', 28],
    ['Muziek tijdens receptie (sfeer/stijl)', 18],
    ['Muziek tijdens diner', 18],
    ['Spotify playlist link (optioneel)', 18],
  ]

  for (const [label, h] of muziekVelden) {
    veldLabel(page, font, label, MARGE, y - 2)
    tekstVeld(form, page, uid(label.replace(/\W+/g, '_').toLowerCase().slice(0, 20)), MARGE, y - 4, A4_W - MARGE * 2, h, h > 20)
    y -= h + 8
  }

  // SECTIE 5 — SPECIALE NUMMERS (enkel trouw)
  if (isTrouw) {
    y = sectieHeader(page, bold, '5. Speciale Nummers', MARGE, y - 4, A4_W - MARGE * 2)
    y -= 4
    const intredes: [string][] = [
      ['Intrede gasten in de zaal'],
      ['Intrede eretafel'],
      ['Intrede bruidsmeisjes'],
      ['Intrede groomsmen'],
      ['Intrede koppel'],
      ['Intrede taart / aansnijden'],
      ['Openingsdans'],
      ['Na openingsdans (tweede dans / start feest)'],
      ['Boeketwerpen'],
    ]
    const half = Math.ceil(intredes.length / 2)
    const links = intredes.slice(0, half)
    const rechts = intredes.slice(half)
    const maxRijen = Math.max(links.length, rechts.length)
    for (let i = 0; i < maxRijen; i++) {
      if (links[i]) y = nummerveld(form, page, font, links[i][0], uid(`intrede_${i}_l`), MARGE, y, COL_W - 4)
      if (rechts[i]) nummerveld(form, page, font, rechts[i][0], uid(`intrede_${i}_r`), MARGE + COL_W + 10, y + 18, COL_W - 4)
    }
    y -= 4
  }

  const sectieNr = isTrouw ? 6 : 5

  // SECTIE — ZAAL & TECHNIEK
  y = sectieHeader(page, bold, `${sectieNr}. Zaal & Techniek`, MARGE, y - 4, A4_W - MARGE * 2)
  y -= 6
  page.drawText('Wat voorziet de zaal? (ook aanwezig bij DJ)', { x: MARGE, y: y - 2, size: 7.5, font, color: GRIJS_RND })
  y -= 6
  const techniek = [
    'Muziekinstallatie / Speakers',
    'Lichtshow',
    'Microfoon',
    'DJ-booth / DJ-tafel',
    'Uplights',
    'Speakers buiten / receptie',
  ]
  for (let i = 0; i < techniek.length; i += 2) {
    checkVeld(form, page, uid(`tech_${i}`), MARGE, y, techniek[i], font)
    if (techniek[i + 1]) checkVeld(form, page, uid(`tech_${i + 1}`), MARGE + COL_W + 10, y, techniek[i + 1], font)
    y -= 16
  }

  // SECTIE — EXTRA OPTIES
  y = sectieHeader(page, bold, `${sectieNr + 1}. Extra Opties DJ Kwinten`, MARGE, y - 4, A4_W - MARGE * 2)
  y -= 6
  const extras = [
    ...(isTrouw ? ['Ceremonie Set (250 EUR)'] : []),
    'Digitale Photobooth (175 EUR)',
    'Photobooth met Prints (op aanvraag)',
    'Extra Luidspreker Receptie (25 EUR)',
    'Karaoke (150 EUR)',
  ]
  for (let i = 0; i < extras.length; i += 2) {
    checkVeld(form, page, uid(`extra_${i}`), MARGE, y, extras[i], font)
    if (extras[i + 1]) checkVeld(form, page, uid(`extra_${i + 1}`), MARGE + COL_W + 10, y, extras[i + 1], font)
    y -= 16
  }

  // SECTIE — OPMERKINGEN
  y = sectieHeader(page, bold, `${sectieNr + 2}. Opmerkingen & Vragen`, MARGE, y - 4, A4_W - MARGE * 2)
  y -= 6
  tekstVeld(form, page, uid('opmerkingen'), MARGE, y, A4_W - MARGE * 2, 60, true)
  y -= 68

  // SECTIE — TOESTEMMING
  y = sectieHeader(page, bold, `${sectieNr + 3}. Toestemming Foto / Video`, MARGE, y - 4, A4_W - MARGE * 2)
  y -= 8
  page.drawText("Geeft u toestemming aan DJ Kwinten om foto's/video's van het feest te gebruiken voor promotionele doeleinden?", { x: MARGE, y: y - 2, size: 8, font, color: DONKER })
  y -= 12
  checkVeld(form, page, uid('foto_ja'), MARGE, y, 'Ja, ik geef toestemming', font)
  checkVeld(form, page, uid('foto_nee'), MARGE + 160, y, 'Nee, geen toestemming', font)

  // Footers
  const footerY = 28
  for (const p of [doc.getPage(0), doc.getPage(1)]) {
    p.drawLine({ start: { x: MARGE, y: footerY + 12 }, end: { x: A4_W - MARGE, y: footerY + 12 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.87) })
    p.drawText('DJ Kwinten  -  Den Tandt Kwinten  -  0498/21 64 48  -  DJKWINTEN@gmail.com  -  BTW BE 0726.773.488', { x: MARGE, y: footerY, size: 6.5, font, color: GRIJS_RND })
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

mkdirSync('./public', { recursive: true })

const trouw = await generatePDF(true)
writeFileSync('./public/djkwinten-vragenlijst-trouw.pdf', trouw)
console.log('Trouw PDF: ' + trouw.length + ' bytes')

const algemeen = await generatePDF(false)
writeFileSync('./public/djkwinten-vragenlijst-algemeen.pdf', algemeen)
console.log('Algemeen PDF: ' + algemeen.length + ' bytes')
