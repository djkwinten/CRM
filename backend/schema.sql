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
  werk_partner1 TEXT,
  werk_partner2 TEXT,
  hobbys_interesses TEXT,
  leeftijd_partner1 INTEGER,
  leeftijd_partner2 INTEGER,
  extra_koppel_info TEXT,
  anderstalige_gasten TEXT,
  anderstalige_talen TEXT,
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
  leveranciers_info TEXT,
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
  uitnodiging_files TEXT,
  handtekening_klant TEXT,

  -- Financieel
  totaalprijs REAL DEFAULT 0,
  basisprijs REAL DEFAULT 0,
  extra_prijzen TEXT,
  voorschot_instructies TEXT,
  billit_factuur_pdf TEXT,
  billit_factuur_naam TEXT,
  contract_pdf TEXT,

  -- Trouw-afspraak
  wedding_meeting_at TEXT,
  wedding_meeting_note TEXT,

  -- Workflow & klantportaal
  reminder_sent_at TEXT,
  aanvraag_reminder_sent_at TEXT,
  review_sent_at TEXT,
  feest_herinnering_sent_at TEXT,
  vragenlijst_updated_at TEXT,
  vragenlijst_first_submitted_at TEXT,
  vragenlijst_diff TEXT,
  venue_id INTEGER,
  feedback_vragenlijst TEXT,
  feedback_herkomst TEXT,
  is_afgewezen INTEGER NOT NULL DEFAULT 0,
  afgewezen_reden TEXT,
  portal_title TEXT,

  -- Meta
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Deze tabellen vormen samen met bookings de volledige persistente D1-opslag.
-- CREATE IF NOT EXISTS maakt toepassing op een bestaande productie-database
-- additief; bestaande records worden niet verwijderd of overschreven.
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  naam TEXT NOT NULL,
  adres TEXT,
  capaciteit INTEGER,
  contact_naam TEXT,
  contact_telefoon TEXT,
  contact_email TEXT,
  website TEXT,
  geluidsbeperking INTEGER DEFAULT 0,
  geluidsbeperking_db INTEGER,
  speakers_aanwezig INTEGER DEFAULT 0,
  licht_aanwezig INTEGER DEFAULT 0,
  micro_aanwezig INTEGER DEFAULT 0,
  dj_booth_aanwezig INTEGER DEFAULT 0,
  uplights_aanwezig INTEGER DEFAULT 0,
  speakers_buiten INTEGER DEFAULT 0,
  parkeren_info TEXT,
  gelijkvloers INTEGER DEFAULT 1,
  wifi_code TEXT,
  fotos TEXT,
  notities TEXT,
  afstand_km REAL,
  rijtijd_min INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_contract_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE,
  naam TEXT,
  email TEXT,
  gsm TEXT,
  klant_adres TEXT,
  event_type TEXT,
  event_datum TEXT,
  locatie_naam TEXT,
  locatie_adres TEXT,
  aantal_gasten INTEGER,
  uur_dansfeest TEXT,
  geluid_voorzien INTEGER DEFAULT 0,
  licht_voorzien INTEGER DEFAULT 0,
  dj_booth_nodig INTEGER DEFAULT 0,
  afgesproken_prijs REAL,
  voorschot_bedrag REAL,
  contract_ready INTEGER DEFAULT 0,
  contract_info_notified_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS wedding_meetings (
  booking_id INTEGER PRIMARY KEY,
  meeting_at TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS booking_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  size INTEGER,
  data_base64 TEXT NOT NULL,
  visible_to_customer INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Aparte compatibele opslag voor het tijdelijk heropenen van Contract Info.
-- Dit voorkomt dat oudere, brede D1-tabellen tijdens een gebruikersactie moeten wijzigen.
CREATE TABLE IF NOT EXISTS booking_contract_unlocks (
  booking_id INTEGER PRIMARY KEY,
  unlocked INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS internal_todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'manual',
  text TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(booking_id, kind)
);

-- Alleen-lezen bronregistratie voor aanvragen uit Gmail. Het unieke Gmail-ID
-- voorkomt dat retries of gelijktijdige scheduler-runs dubbele aanvragen maken.
CREATE TABLE IF NOT EXISTS gmail_intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER UNIQUE,
  gmail_message_id TEXT NOT NULL UNIQUE,
  gmail_rfc_message_id TEXT,
  source_account TEXT NOT NULL,
  source_sender TEXT,
  source_subject TEXT,
  received_at TEXT NOT NULL,
  original_message TEXT,
  intake_status TEXT NOT NULL DEFAULT 'nieuw',
  issues TEXT,
  decision TEXT NOT NULL DEFAULT 'imported',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_intakes_booking
  ON gmail_intakes(booking_id);

CREATE TABLE IF NOT EXISTS gmail_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
