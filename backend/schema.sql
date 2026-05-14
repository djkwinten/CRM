-- DJ Kwinten Boekings-App — Database Schema
-- Pas toe op D1 met: nxcode d1 execute <naam> --file schema.sql

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Beheer
  feest_datum TEXT NOT NULL,
  type_feest TEXT NOT NULL DEFAULT 'Algemeen',
  is_aanvraag INTEGER NOT NULL DEFAULT 0,
  status_contract INTEGER NOT NULL DEFAULT 0,
  status_voorschot INTEGER NOT NULL DEFAULT 0,
  status_vragenlijst INTEGER NOT NULL DEFAULT 0,

  -- Toegang
  access_token TEXT,
  slug TEXT,

  -- Contact organisator
  naam_organisator TEXT,
  naam_partner1 TEXT,
  naam_partner2 TEXT,
  bedrijfsnaam TEXT,
  btw_nr TEXT,
  email TEXT,
  telefoon TEXT,
  adres_organisator TEXT,

  -- Locatie
  locatie_naam TEXT,
  locatie_adres TEXT,
  aantal_gasten INTEGER,
  thema TEXT,
  publiek_leeftijd TEXT,
  parkeren_info TEXT,
  gelijkvloers INTEGER DEFAULT 1,
  backup_contact_naam TEXT,
  backup_contact_telefoon TEXT,
  verzoeknummers TEXT DEFAULT 'Ja',

  -- Planning
  uur_ceremonie TEXT,
  uur_receptie TEXT,
  uur_receptie_einde TEXT,
  uur_receptie2 TEXT,
  uur_receptie2_einde TEXT,
  uur_diner TEXT,
  uur_dessert TEXT,
  uur_dansfeest TEXT,
  uur_midnightsnack TEXT,
  einduur TEXT,
  planning_extra TEXT,
  einde_feest TEXT,

  -- Muziek
  top_genres TEXT,
  top_genres_extra TEXT,
  flop_genres TEXT,
  flop_genres_extra TEXT,
  must_play TEXT,
  do_not_play TEXT,
  spotify_link TEXT,
  muziek_receptie TEXT,
  muziek_receptie_extra TEXT,
  muziek_diner TEXT,
  muziek_diner_extra TEXT,

  -- Intredes & Speciale nummers
  intrede_zaal_nummer TEXT,
  intrede_eretafel_nummer TEXT,
  intrede_bridesmaids_nummer TEXT,
  intrede_groomsmen_nummer TEXT,
  intrede_koppel_nummer TEXT,
  intrede_anders_nummer TEXT,
  intrede_taart_nummer TEXT,
  openingsdans_nummer TEXT,
  tweede_dans_nummer TEXT,
  boeket_werpen_nummer TEXT,
  verjaardag_naam_leeftijd TEXT,

  -- Zaal & Techniek
  zaal_contact TEXT,
  geluidsbeperking_info TEXT,
  wifi_code TEXT,
  speakers_aanwezig INTEGER DEFAULT 0,
  licht_aanwezig INTEGER DEFAULT 0,
  micro_aanwezig INTEGER DEFAULT 0,
  dj_booth_aanwezig INTEGER DEFAULT 0,
  uplights_aanwezig INTEGER DEFAULT 0,
  speakers_buiten INTEGER DEFAULT 0,

  -- Extra services
  ceremonie_set INTEGER DEFAULT 0,
  digital_booth INTEGER DEFAULT 0,
  retro_booth INTEGER DEFAULT 0,
  draadloze_speaker INTEGER DEFAULT 0,
  karaoke INTEGER DEFAULT 0,

  -- Toestemmingen & Opmerkingen
  toestemming_foto INTEGER DEFAULT NULL,
  opmerkingen TEXT,
  zaal_fotos TEXT,
  handtekening_klant TEXT,

  -- Financieel
  totaalprijs REAL DEFAULT 0,
  basisprijs REAL DEFAULT 0,
  extra_prijzen TEXT,
  voorschot_instructies TEXT,
  billit_factuur_pdf TEXT,
  billit_factuur_naam TEXT,
  contract_pdf TEXT,

  -- Meta
  reminder_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
