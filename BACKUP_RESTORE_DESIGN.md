# Ontwerpvoorstel: volledige backup en restore

Status: **voorstel — niet geïmplementeerd**  
Doel: een volledige, controleerbare en herhaalbare backup en restore van de CRM, zonder gegevensverlies en zonder wijzigingen aan productie tijdens ontwerp of tests.

## 1. Beschermde huidige basis

De huidige versie blijft de veilige referentie. De bestaande gedeeltelijke JSON-export/import en de R2-fallback blijven werken totdat een vervanger alle acceptatiecriteria uit dit document aantoonbaar haalt.

Zonder uitdrukkelijke toestemming mogen niet worden verwijderd of gewijzigd:

- `backend/src/lib/cloudBookings.ts`;
- `backend/src/lib/cloudTemplates.ts`;
- `backend/src/lib/cloudVenues.ts`;
- alle JSON export/import-routes;
- Gmail-intake- en synchronisatiestorage;
- databaseschema en migratielogica;
- uploadroute en R2-binding;
- klantbestandenroute;
- alle D1-tabellen;
- bestaande R2-objecten;
- frontend backupdownload en importinterface.

Dit voorstel voert geen migratie, restore, productie-import, R2-mutatie of deployment uit.

## 2. Te beschermen gegevens

Een volledige backup moet alle rijen en alle kolommen bevatten uit de tien huidige persistente D1-tabellen:

1. `bookings`;
2. `venues`;
3. `booking_contract_info`;
4. `wedding_meetings`;
5. `booking_files`;
6. `email_templates`;
7. `booking_contract_unlocks`;
8. `internal_todos`;
9. `gmail_intakes`;
10. `gmail_sync_state`.

Daarnaast moet de backup alle relevante R2-objecten bevatten, waaronder:

- alle objecten onder `zaal-fotos/`;
- zaalafbeeldingen en uitnodigingen waarnaar `bookings.zaal_fotos` verwijst;
- objecten waarnaar `venues.fotos` verwijst;
- de huidige fallbackobjecten `data/bookings.json`, `data/venues.json` en `data/email-templates.json`;
- eventuele toekomstige applicatieobjecten die nog niet door de huidige code worden herkend.

Contracten, facturen en handtekeningen die als tekst/base64 in D1 staan, blijven onderdeel van de betreffende tabelrij. `booking_files.data_base64` wordt zonder verkorting meegenomen.

Secrets, API-sleutels en OAuth-refresh-tokens horen niet in een gegevensbackup. Alleen de persistente Gmail-intakegegevens en synchronisatiestatus uit D1 worden opgenomen.

## 3. Nieuw versioned backupformaat

Voorgesteld formaat:

```text
format: djkwinten-crm-full-backup
format_version: 1
```

Dit is een andere naamruimte dan de bestaande legacy JSON-versies 1, 3 en 4. Daardoor blijft ondubbelzinnig welk importpad moet worden gebruikt.

Een volledige backup is een pakket met minimaal:

```text
manifest.json
d1/schema.json
d1/bookings.ndjson
d1/venues.ndjson
d1/booking_contract_info.ndjson
d1/wedding_meetings.ndjson
d1/booking_files.ndjson
d1/email_templates.ndjson
d1/booking_contract_unlocks.ndjson
d1/internal_todos.ndjson
d1/gmail_intakes.ndjson
d1/gmail_sync_state.ndjson
r2/objects/<inhoudsnaam>
reports/export-validation.json
```

NDJSON voorkomt dat de volledige database tegelijk in het geheugen moet worden geladen. Elk record behoudt expliciet de SQLite-waarde en het type. Tekst, integers, reële getallen, nullwaarden en eventuele toekomstige blobs moeten verliesloos worden weergegeven.

### Verplicht manifest

`manifest.json` bevat minimaal:

- uniek `backup_id`;
- formaatnaam en formaatversie;
- aanmaakmoment in UTC;
- bronapplicatieversie en schemafingerprint;
- status `building`, `complete` of `failed`;
- per tabel: tabelnaam, kolommen, primaire sleutel, rijtelling, bestandsnaam, bytegrootte en SHA-256-checksum;
- volledige relationele beschrijving;
- aantal R2-objecten en totale grootte;
- per R2-object: originele key, pakketpad, grootte, SHA-256, contenttype, ETag indien beschikbaar en relevante metadata;
- exportwaarschuwingen;
- checksum van het uiteindelijke manifest of een apart ondertekend checksumoverzicht.

Alleen een manifest met status `complete` mag herstelbaar worden verklaard.

## 4. Geen verlies door een vaste importwhitelist

De toekomstige export neemt alle werkelijk aanwezige kolommen op. De restore vergelijkt de kolommen uit het manifest met een vertrouwd schemasnapshot en met de doel-database.

Regels:

1. bekende kolommen worden allemaal hersteld;
2. ontbrekende doelkolommen vereisen eerst een expliciet goedgekeurde migratie;
3. onbekende bronkolommen worden niet stilzwijgend verwijderd, maar blokkeren de restore of gaan naar een zichtbaar quarantainerapport;
4. kolomnamen worden alleen vanuit vertrouwde schemametadata gebruikt en veilig gequote;
5. per tabel wordt na restore een veld-voor-veldvergelijking uitgevoerd.

Hierdoor verdwijnen nieuwe of legacy boekingsvelden niet meer door een verouderde whitelist.

## 5. Relatiemodel

Het manifest beschrijft minimaal deze relaties:

- `bookings.venue_id` → `venues.id`;
- `booking_contract_info.booking_id` → `bookings.id`;
- `wedding_meetings.booking_id` → `bookings.id`;
- `booking_files.booking_id` → `bookings.id`;
- `booking_contract_unlocks.booking_id` → `bookings.id`;
- `internal_todos.booking_id` → `bookings.id`, waarbij null toegestaan blijft;
- `gmail_intakes.booking_id` → `bookings.id`;
- `email_templates.key` als stabiele logische templatesleutel;
- `gmail_sync_state.key` als stabiele synchronisatiesleutel.

Klanten zijn momenteel geen aparte tabel. Hun gegevens worden verliesloos als onderdeel van `bookings` en, waar aanwezig, `booking_contract_info` hersteld.

R2-verwijzingen worden eveneens als relaties behandeld. Het manifest legt vast welke velden verwijzen naar welke objectkeys, in elk geval `bookings.zaal_fotos` en `venues.fotos`.

## 6. Twee restoremodi

### 6.1 Exact herstel naar een lege database

Dit is de voorkeursmethode voor disaster recovery of een nieuwe D1-database.

- Originele primaire IDs worden expliciet ingevoegd.
- Tabellen worden in relationeel veilige volgorde gevuld.
- Autoincrement-sequences worden daarna boven het hoogste herstelde ID gezet.
- R2-objecten behouden hun oorspronkelijke keys.
- De doelomgeving wordt pas gebruikt nadat alle validaties slagen.

Voorgestelde volgorde:

1. schema en goedgekeurde migraties;
2. R2-objecten naar een geïsoleerde doelbucket of stagingprefix;
3. `venues`;
4. `bookings`, inclusief oorspronkelijke `venue_id`;
5. `email_templates`;
6. `booking_contract_info`;
7. `wedding_meetings`;
8. `booking_files`;
9. `booking_contract_unlocks`;
10. `internal_todos`;
11. `gmail_intakes`;
12. `gmail_sync_state`;
13. sequencecorrectie en volledige nacontrole.

### 6.2 Gecontroleerd samenvoegen met een bestaande database

Wanneer originele IDs al bezet zijn, wordt nooit blind overschreven. Een restore-run maakt een expliciete mapping:

```text
backup_id + brontabel + bron-ID → doel-ID
```

Voorgestelde stabiele herkenning:

- boeking: eerst bestaande restoremapping, daarna uniek `access_token`; `slug` alleen als extra controle;
- zaal: bestaande restoremapping; naam/adres alleen na eenduidige match of handmatige bevestiging;
- template: `key`;
- Gmail-intake: `gmail_message_id`;
- Gmail-sync: `key`;
- alle afhankelijke records: uitsluitend via de vastgelegde booking- of venue-ID-mapping.

Fuzzy matching op klantnaam, datum of zaalnaam mag nooit automatisch records samenvoegen. Ambigue gevallen worden vooraf gerapporteerd en vereisen een keuze.

Voor betrouwbare retries zijn twee toekomstige operationele tabellen of een gelijkwaardig persistent restorejournaal nodig:

- restore-runs met backupchecksum, doelomgeving, status en tellingen;
- restore-ID-mapping met bron- en doel-ID per tabel.

Toevoeging hiervan vereist later een afzonderlijk goedgekeurde migratie.

## 7. Bestaande JSON-backups blijven bruikbaar

Er komt een legacy-adapter voor bestaande backups:

- versie 1: browser/localStorage-boekingen;
- versie 3: R2-boekingen, zalen en templates;
- versie 4: D1-boekingen, zalen, templates, Gmail-intakes en Gmail-sync.

De adapter leest alle velden die werkelijk in het bestand staan en gebruikt niet de huidige verliesgevende boekingswhitelist.

Voor bestaande aanvragen en boekingen:

1. originele boekings-ID wordt bij een lege database behouden of naar een nieuw ID gemapt;
2. het oorspronkelijke `venue_id` wordt gelezen vóór enige omzetting;
3. de zaal met dat bron-ID wordt eerst hersteld of gemapt;
4. de boeking krijgt daarna het juiste doel-`venue_id`;
5. Gmail-intakes worden via de ID-mapping en aanvullend via `booking_access_token` gekoppeld;
6. ontbrekende relaties worden in een conflictbestand gezet en niet stilzwijgend genegeerd.

Een legacy-backup kan alleen herstellen wat werkelijk in dat bestand aanwezig is. Ontbrekende tabellen en ontbrekende R2-binaire objecten kunnen niet worden gereconstrueerd. Voor volledig herstel van historische backups zijn daarom ook een D1-snapshot en/of een kopie van de toenmalige R2-bucket nodig.

De huidige importinterface blijft tijdens de ontwikkeling beschikbaar. De nieuwe volledige restore krijgt een afzonderlijke preview-/dry-runstroom en vervangt de bestaande route pas na expliciete goedkeuring en geslaagde compatibiliteitstests.

## 8. R2-backup en objectintegriteit

Een JSON-verwijzing alleen is onvoldoende. Voor ieder R2-object wordt de daadwerkelijke byte-inhoud opgenomen of naar gecontroleerde backupopslag gekopieerd.

Vereisten:

- originele objectkey;
- exacte bytegrootte;
- SHA-256 over de ongewijzigde bytes;
- contenttype en metadata;
- geen opname van secrets;
- veilige codering van objectkeys in pakketpaden, zodat padtekens geen bestandspad kunnen manipuleren;
- objecten onder de eigen backupprefix worden niet opnieuw recursief geback-upt;
- ontbrekende objecten waarnaar D1 verwijst veroorzaken een zichtbare fout;
- niet-verwezen objecten worden wel geïnventariseerd en als zodanig gerapporteerd, zodat niets ongemerkt verdwijnt.

Bij restore worden objecten eerst naar staging geschreven en opnieuw gehasht. Een bestaande key met een andere checksum veroorzaakt een conflict; deze wordt nooit stilzwijgend overschreven. Indien een nieuwe key nodig is, worden alle verwijzende D1-velden via een gecontroleerde objectkey-mapping aangepast.

## 9. Consistente export

D1 en R2 hebben samen geen enkele gedeelde transactie. Daarom moet de export een expliciet consistentiemodel gebruiken.

Voorkeursontwerp:

1. start een backup-run en leg bronversie en starttijd vast;
2. activeer tijdelijk een applicatiebrede backupbarrière voor muterende CRM-acties;
3. exporteer schema en alle tien tabellen in vaste volgorde;
4. inventariseer en kopieer alle R2-objecten;
5. valideer tellingen en checksums;
6. schrijf het definitieve manifest als laatste;
7. verwijder de barrière;
8. markeer de backup uitsluitend na volledige controle als `complete`.

Als een korte schrijfbarrière niet aanvaardbaar blijkt, moet vóór implementatie een alternatief met een providerondersteunde database-snapshot en een duidelijk R2-consistentievenster worden bewezen. Een backup die tijdens de export wijzigt mag niet als volledig consistent worden gepresenteerd.

## 10. Idempotente import

Dezelfde backup tweemaal herstellen moet dezelfde eindtoestand geven.

Daarvoor gelden deze regels:

- iedere backup heeft een stabiel `backup_id` en totaalchecksum;
- iedere restore heeft een persistent journaal;
- voltooide restore van dezelfde checksum voert geen nieuwe inserts uit;
- een afgebroken restore hervat op basis van het journaal en de ID-mapping;
- inserts gebruiken primaire IDs of de vastgelegde mapping;
- updates vergelijken de verwachte bronchecksum met de doelrij;
- conflicten worden gemeld in plaats van gedupliceerd;
- R2-objecten met dezelfde key en checksum worden overgeslagen;
- R2-objecten met dezelfde key maar andere checksum blokkeren of krijgen een expliciete nieuwe key plus relatiemapping.

## 11. Transacties en rollback

De veiligste productieroute is restore naar nieuwe, geïsoleerde D1- en R2-resources, gevolgd door volledige acceptatie en pas daarna een afzonderlijk goedgekeurde omschakeling. Hierdoor blijft de bestaande omgeving onaangeraakt totdat de nieuwe omgeving aantoonbaar compleet is.

Voor restore naar een bestaande database:

- maak eerst een volledige herstelbare backup van de huidige doeltoestand;
- voer een dry-run uit zonder writes;
- gebruik begrensde atomaire databasebatches nadat de actuele D1-transactiegaranties zijn geverifieerd;
- houd per batch een restorejournaal en inverse wijzigingsset bij;
- zet nieuwe R2-objecten eerst in staging;
- publiceer geen nieuwe toestand voordat alle tabellen en objecten zijn gevalideerd;
- voer bij een fout rollback of gecontroleerde compensatie uit;
- laat de applicatie bij een onvolledige restore niet verder schrijven op een half herstelde dataset.

Omdat D1 en R2 niet samen atomair kunnen committen, wordt nooit beweerd dat een cross-resource restore één transactie is. Staging, checksums, een hersteljournaal en een voorafgaande recoverybackup zijn verplicht.

## 12. Dry-run en validatierapport

Elke restore begint met een dry-run die niets wijzigt en rapporteert:

- backupformaat en ondersteunde versie;
- checksumstatus van manifest, tabellen en objecten;
- bron- en doelschema;
- aantal bronrijen per tabel;
- verwachte inserts, updates, ongewijzigde records en conflicten;
- volledige oude→nieuwe ID-mapping;
- ontbrekende ouders en verweesde kinderen;
- ontbrekende R2-objecten;
- objectkeyconflicten;
- onbekende of ontbrekende kolommen;
- benodigde migraties;
- geschatte gegevens- en objectgrootte;
- expliciete blokkades die handmatige goedkeuring vereisen.

Na restore worden minimaal gecontroleerd:

- rijtelling per tabel vóór, verwacht en na;
- checksum of canonieke veldvergelijking van iedere rij;
- iedere booking→venue-relatie;
- iedere child→booking-relatie;
- unieke Gmail-message-ID’s;
- unieke template- en syncsleutels;
- iedere R2-referentie vanuit D1;
- grootte en SHA-256 van ieder hersteld R2-object;
- nul onverwachte verweesde relaties;
- nul niet-gerapporteerde velden of records.

Het eindrapport krijgt status `passed`, `passed_with_approved_conflicts` of `failed`. Alleen `passed` mag standaard als volledig hersteld worden beschouwd.

## 13. Vereiste acceptatietests vóór productiegebruik

De oplossing is pas gereed nadat onderstaande tests in een geïsoleerde omgeving slagen:

1. alle tien tabellen bevatten meerdere synthetische records;
2. iedere kolom van `bookings` krijgt een herkenbare niet-standaardwaarde, plus afzonderlijke tests voor `null`, lege tekst en nul;
3. meerdere boekingen verwijzen naar dezelfde zaal;
4. de zaalrelatie en alle zes booking-gerelateerde childrelaties zijn aanwezig;
5. klantbestanden bevatten echte synthetische bytes;
6. contract, factuur en handtekening worden byte-identiek hersteld;
7. R2 bevat zaalbeelden, uitnodigingen, niet-verwezen objecten en metadata;
8. alle checksums zijn na restore identiek;
9. exact herstel naar een lege database behoudt alle IDs;
10. merge-herstel naar een gevulde database produceert een correcte ID-mapping;
11. dezelfde backup tweemaal herstellen maakt geen duplicaten;
12. een onderbroken restore kan veilig hervatten;
13. foutinjectie midden in D1-herstel laat geen ongemerkte halve toestand achter;
14. foutinjectie midden in R2-herstel laat productionkeys ongemoeid;
15. ontbrekende en beschadigde objecten worden vóór publicatie gedetecteerd;
16. legacy JSON-versies 1, 3 en 4 worden correct geanalyseerd;
17. bestaande aanvragen en boekingen uit legacy JSON krijgen hun juiste zaalrelatie terug wanneer bronzaal en `venue_id` aanwezig zijn;
18. een legacy-bestand zonder benodigde relatiegegevens geeft een expliciet conflict en geen verzonnen koppeling;
19. de huidige export/importfunctionaliteit blijft tijdens de overgang werken;
20. de uiteindelijke productieacceptatie gebeurt eerst op een afzonderlijke test-D1 en test-R2 met uitsluitend synthetische data.

## 14. Voorgestelde uitvoeringsfasen

Geen van deze fasen wordt uitgevoerd zonder afzonderlijke toestemming.

### Fase A — formaat en read-only exporter

- manifest- en schemaspecificatie vastleggen;
- streaming tabel- en R2-export bouwen;
- uitsluitend synthetische lokale tests;
- geen import en geen productionread.

### Fase B — validator en dry-run

- pakketchecksums;
- schema- en relatiecontrole;
- legacy-analyse;
- ID-mappingvoorstel zonder writes.

### Fase C — restore naar tijdelijke lokale resources

- exact ID-behoud;
- alle tien tabellen;
- alle objecten;
- idempotentie en foutinjectie.

### Fase D — geïsoleerde cloudacceptatie

- nieuwe test-D1 en test-R2;
- uitsluitend synthetische data;
- actuele providerlimieten en transactiesemantiek opnieuw verifiëren;
- geen productionbinding wijzigen.

### Fase E — optionele productieprocedure

Pas na een afzonderlijke expliciete opdracht:

- read-only inventaris van de exacte productiebron;
- recoverypunt vóór iedere mutatie;
- dry-runrapport ter goedkeuring;
- restore naar nieuwe resources als voorkeursroute;
- volledige nacontrole;
- afzonderlijke goedkeuring voor eventuele omschakeling of deployment.

## 15. Beslispunten vóór implementatie

Voor de bouw moet nog worden goedgekeurd:

- pakketvorm: server-side backupset, downloadbaar archief of beide;
- encryptie en sleutelbeheer voor backups met persoonsgegevens;
- bewaartermijn en automatische verwijdering;
- maximaal toegestaan schrijfslot tijdens een consistente export;
- exact herstel versus merge als standaardmodus;
- gebruik van extra restorejournaaltabellen;
- conflictbeleid voor bestaande IDs en R2-objectkeys;
- procedure om een gevalideerde nieuwe D1/R2-omgeving later veilig actief te maken.

Tot die beslissingen zijn genomen, blijft dit document uitsluitend een ontwerp en blijft de huidige referentieversie leidend.
