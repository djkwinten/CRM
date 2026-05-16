# CRM workflow: aanpassen, previewen, opslaan en deployen

Dit project staat in GitHub:

```text
https://github.com/djkwinten/CRM
```

## Nieuwe sessie / project opnieuw openen

Als de Nxcode preview of server na een dag niet meer bereikbaar is, hoef je geen nieuw project te maken. Open dezelfde repo opnieuw en start de dev-omgeving met:

```bash
./scripts/resume-dev.sh
```

Wat dit doet:

1. haalt de laatste code van GitHub op wanneer er geen lokale wijzigingen zijn;
2. installeert ontbrekende dependencies;
3. start de backend op poort `3001`;
4. start de frontend op poort `5173` met `--host 0.0.0.0`;
5. registreert de Nxcode preview.

Als je helemaal opnieuw begint in een lege workspace:

```bash
git clone https://github.com/djkwinten/CRM.git .
./scripts/resume-dev.sh
```

## Wijzigingen maken

Laat de assistent gewoon wijzigingen maken in de code. Dat hoeft niet automatisch naar Cloudflare gedeployed te worden.

## Alleen opslaan naar GitHub wanneer jij dat vraagt

Gebruik:

```bash
./scripts/save-to-github.sh "Korte beschrijving van de wijziging"
```

Als GitHub authenticatie vraagt in een niet-interactieve omgeving:

```bash
GITHUB_TOKEN=ghp_xxx ./scripts/save-to-github.sh "Korte beschrijving van de wijziging"
```

Zet tokens nooit in bestanden en commit ze nooit.

## Cloudflare deployen

Niet na elke wijziging deployen. Alleen wanneer je expliciet zegt dat het live mag.

Als Cloudflare gekoppeld is aan GitHub, kies in Cloudflare:

```text
Deploy latest commit
```

Gebruik als build settings:

```text
Root directory: /
Build command: npm run build
Build output directory: dist
```

Let op: bestaande gegenereerde contract-PDF's veranderen niet automatisch. Die moet je per boeking opnieuw genereren via:

```text
Contract → Hernieuwen
Code: 7777
```
