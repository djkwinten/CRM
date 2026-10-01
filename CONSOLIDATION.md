# Canonieke configuratie en voorbereide migratie

## Enige officiële deploymentconfiguratie

De enige deploymentconfiguratie van deze CRM is het rootbestand `wrangler.toml`.

| Onderdeel | Canonieke waarde |
|---|---|
| Worker | `crm` |
| Frontendbron | `frontend/index.html` → `frontend/src/main.tsx` |
| Gebouwde frontendassets | `dist/` |
| Backend-entrypoint | `backend/src/index.ts` |
| D1-binding | `DB` → `dj-booking-db` |
| R2-binding | `STORAGE` → `dj-booking-fotos` |
| Gmail-cron | `*/5 * * * *` |
| Dagelijkse opvolgcron | `15 8 * * *` |

De rootbuild bouwt de Vite-frontend en kopieert de output naar `dist/`. De root-Worker bedient zowel de assets als `/api/*` en `/health`. Er is geen afzonderlijke frontend- of API-Workerconfiguratie.

### Niet-geheime Worker-variabelen

- `ENVIRONMENT`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `GMAIL_ACCOUNT`
- `GMAIL_LABEL_NAME`
- `GMAIL_EXPECTED_FROM`
- `GMAIL_EXPECTED_SUBJECT`
- optioneel `APP_URL` wanneer een vaste publieke/custom origin nodig is
- optioneel `SMTP_FROM`

### Runtime-secrets

Alleen de namen worden gedocumenteerd; waarden horen nooit in Git, logs, exports of documentatie.

- `BREVO_API_KEY` (voorkeur) of de compatibiliteitsnaam `SMTP_PASS`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Deze CRM gebruikt een vooraf verkregen Google refresh token als Worker secret en bevat zelf geen interactieve Google OAuth-authorisatieflow.

## Voorbereide, nog niet uitgevoerde D1-migratie

De migratierunner staat in `backend/src/lib/consolidationMigration.ts`. Hij is bewust niet geïmporteerd door de Worker-entrypoint, routes, cron of deployscripts. Een build of deploy kan hem daarom niet automatisch uitvoeren.

### Eigenschappen

1. Controleert dat de bestaande `bookings`-tabel aanwezig is.
2. Leest bestaande kolommen met `PRAGMA table_info`.
3. Voert `ALTER TABLE ... ADD COLUMN` alleen uit voor een ontbrekende kolom.
4. Maakt ontbrekende zijtabellen met `CREATE TABLE IF NOT EXISTS`.
5. Controleert ook gedeeltelijk bestaande zijtabellen en voegt alleen ontbrekende kolommen toe.
6. Bevat geen `DROP`, `DELETE`, `UPDATE`, tabelhernoeming of database-reset.
7. Kan veilig opnieuw worden aangeroepen: een tweede run voegt niets toe.

### Oude database → wijzigingen → eindschema

#### Toe te voegen aan een oudere `bookings`-tabel wanneer afwezig

- `aanvraag_reminder_sent_at TEXT`
- `review_sent_at TEXT`
- `feest_herinnering_sent_at TEXT`
- `vragenlijst_updated_at TEXT`
- `vragenlijst_first_submitted_at TEXT`
- `vragenlijst_diff TEXT`
- `venue_id INTEGER`
- `feedback_vragenlijst TEXT`
- `feedback_herkomst TEXT`
- `is_afgewezen INTEGER NOT NULL DEFAULT 0`
- `afgewezen_reden TEXT`
- `portal_title TEXT`

#### Aan te maken wanneer afwezig

- `venues`
- `booking_contract_info`
- `wedding_meetings`
- `booking_files`
- `email_templates`

Reeds bestaande tabellen en rijen blijven staan. De runner vult ook ontbrekende kolommen in gedeeltelijk bestaande versies van deze vijf tabellen aan.

De volgende tabellen stonden al in de schemabron vóór deze consolidatiewijziging en zijn dus geen nieuwe fase-1-tabellen:

- `booking_contract_unlocks`
- `internal_todos`
- `gmail_intakes`
- `gmail_sync_state`

De runner verifieert ze wel als onderdeel van het beoogde volledige eindschema: als zo'n tabel of kolom in een oudere of gedeeltelijke database ontbreekt, wordt alleen dat ontbrekende onderdeel toegevoegd. De Gmail-tokenlogica, readonly-import, cron en duplicaatbeveiliging veranderen daarbij niet.

Bij een reeds bestaande gedeeltelijke tabel worden ontbrekende kolommen additief toegevoegd. SQLite kan daarbij niet achteraf alle tabelconstraints reconstrueren zonder een tabel te herbouwen; deze migratie doet bewust geen rebuild, omdat behoud van bestaande data en structuur voorrang heeft. Volledig ontbrekende tabellen worden wel direct met de canonieke constraints aangemaakt.

### Uitvoering na latere expliciete goedkeuring

De runner is nu alleen voorbereid en lokaal getest. Voor production moet na een volledige recovery-backup een gecontroleerd eenmalig uitvoerpad met de bestaande D1-binding worden goedgekeurd. Pas dan wordt de runner tijdelijk of expliciet aangeroepen, het resultaat gecontroleerd en daarna opnieuw uitgevoerd om te bewijzen dat de tweede run nul kolommen toevoegt.

Er mag voor deze migratie geen nieuwe D1-database worden gemaakt en de bestaande binding mag niet worden gewijzigd.

## Benodigd voor volledige recovery

Een volledige recoveryset bestaat uit:

1. Volledige D1-data van alle tabellen, niet alleen de huidige JSON-export.
2. Het D1-schema, inclusief tabellen, kolommen, indexes, constraints en migratieversie.
3. Alle R2-objecten plus keys, metadata, aantallen en waar mogelijk checksums.
4. Het canonieke Worker-configuratiebestand.
5. De namen en niet-geheime waarden van environment variables.
6. Alleen de namen van vereiste secrets; nooit de secretwaarden.
7. Het exacte Git-commit van de release.
8. De build- en deploymentprocedure waarmee dat commit is gepubliceerd.
9. Een gecontroleerd D1-herstelpunt en een afzonderlijke R2-kopie buiten de actieve resources.

De bestaande JSON-export is een aanvullende logische export, geen volledige D1- of R2-backup.
