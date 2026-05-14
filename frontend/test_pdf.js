const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;
const { format, parseISO } = require('date-fns');
const { nl } = require('date-fns/locale');

const booking = {
  id: 1,
  naam_organisator: 'Van Den Berghe-Desiree',
  naam_partner1: 'Amelie',
  naam_partner2: 'Francois',
  feest_datum: '2026-06-15',
  type_feest: 'Trouw',
  email: 'test@test.be',
  telefoon: '0498/123456',
  adres_organisator: 'Kerkstraat 5, 9000 Gent',
  basisprijs: 800,
  extra_prijzen: JSON.stringify({ ceremonie_set: 250 }),
  ceremonie_set: 1,
  digital_booth: 0,
  draadloze_speaker: 0,
  karaoke: 0,
  retro_booth: 0,
  locatie_naam: 'Feestzaal De Linde',
  locatie_adres: 'Zaalstraat 1, 9000 Gent',
  aantal_gasten: 150,
  thema: null,
  uur_ceremonie: '14:00',
  uur_dansfeest: '20:00',
  einduur: '02:00',
  voorschot_instructies: null,
  billit_factuur_naam: null,
  handtekening_klant: null,
  totaalprijs: 1050,
};

const DJ_INFO = {
  naam: 'Den Tandt Kwinten (DJ Kwinten)',
  adres: 'Loskaai 26, 9800 Grammene',
  telefoon: '0498/21 64 48',
  email: 'DJKWINTEN@gmail.com',
  btw: 'BTW BE 0726.773.488 (Vrijgesteld van BTW)',
};

const VOORSCHOT = 100;
const EXTRA_LABELS = {
  ceremonie_set: 'Ceremonie Set',
  digital_booth: 'Digitale Photobooth',
  retro_booth: 'Photobooth met Prints',
  draadloze_speaker: 'Extra Luidspreker',
  karaoke: 'Karaoke',
};

function fmt(val) { return val || '-'; }

try {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, margin = 14;
  const datumStr = format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl });
  
  doc.setFillColor(0, 122, 255);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('OVEREENKOMST', pageW - margin, 14, { align: 'right' });
  
  let y = 48;
  
  const colW = ((pageW - margin * 2) - 6) / 2;
  const col2X = margin + colW + 6;
  
  doc.setFillColor(240, 247, 255);
  doc.roundedRect(margin, y, colW, 38, 2, 2, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(DJ_INFO.naam, margin + 3, y + 12);
  doc.text(DJ_INFO.btw, margin + 3, y + 36);
  
  doc.setFillColor(248, 248, 252);
  doc.roundedRect(col2X, y, colW, 38, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(fmt(booking.naam_organisator), col2X + 3, y + 12);
  y += 45;
  
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    body: [
      ['Datum', datumStr, 'Type', fmt(booking.type_feest)],
      ['Locatie', fmt(booking.locatie_naam), 'Gasten', '150'],
    ],
    alternateRowStyles: { fillColor: [245, 248, 255] },
  });
  y = doc.lastAutoTable.finalY + 5;
  console.log('autoTable 1 OK, y:', y);
  
  const ab = doc.output('arraybuffer');
  console.log('OUTPUT:', ab ? 'OK size=' + ab.byteLength : 'NULL/UNDEFINED');
} catch(e) {
  console.error('CRASH:', e.message);
  console.error(e.stack);
}
