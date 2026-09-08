# Xortec Lead-App

Werkzeug für den Außendienst: Es findet **Facherrichter für Videoüberwachung und
Sicherheitstechnik**, die noch keine Xortec-Kunden sind, und zeigt sie unterwegs auf Tablet oder
Smartphone nach Entfernung sortiert — mit Telefonnummer und mit Belegen dafür, warum die Firma auf
der Liste steht.

Maßstab ist **Präzision, nicht Vollständigkeit**: Eine Websuche findet strukturell nur einen Teil
der tatsächlich existierenden Betriebe. Ziel sind rund 20 belastbare, telefonierbare Leads pro
Gebiet.

Im Abnahmetest über das Hamburger Gebiet lieferte ein Lauf 30 brauchbare Leads aus 31 Kandidaten.

## Wie es funktioniert

Drei bewusst entkoppelte Ebenen — die teure Recherche und die schnelle Nutzung im Feld hängen
nicht voneinander ab:

1. **Recherche** (selten, kostet Geld) — ein Finder-Call sammelt Kandidaten für ein Gebiet, danach
   ermittelt je ein Agent-API-Call pro Firma die Fakten und Quellen. Firmen, die schon in der
   Datenbank stehen, werden über ihre Domain aussortiert, bevor Kosten entstehen. Pro Lauf gelten
   harte Deckel für Kandidatenzahl und Betrag.
2. **Anreicherung** (automatisch, kostenlos) — Adressen werden über Nominatim geokodiert
   (gedrosselt und dauerhaft gecacht, mit PLZ-Mittelpunkt als Rückfallebene), alle Quell-URLs per
   HTTP geprüft (dabei fliegen erfundene Links auf) und die drei Bewertungen berechnet.
3. **Feldnutzung** (oft, kostenlos, schnell) — reine Datenbankabfrage per Umkreissuche, ohne einen
   einzigen API-Aufruf. Funktioniert auch bei schlechtem Netz.

Bewertet wird **in der App, nicht vom Sprachmodell**: Fachlichkeit, Potenzial und Datenqualität
werden deterministisch nach festen Punkteregeln gerechnet. Das Modell liefert ausschließlich Fakten
und Belege.

> **Die Datenbank muss dem Vertriebsgebiet vorauslaufen.** Ein Gebiet, das nachts nie recherchiert
> wurde, ist tagsüber im Feld leer. Das ist kein Fehler der App.

## Voraussetzungen

- **Node.js ≥ 22.5** — die App nutzt den eingebauten `node:sqlite`-Baustein, deshalb ist keine
  native Kompilierung und kein Datenbankserver nötig.
- Ein **Perplexity-API-Key** mit Zugriff auf die Agent API.

## Einrichtung

```bash
npm install
cp .env.example .env
```

Danach `.env` ausfüllen. Mindestens nötig:

| Variable | Zweck |
|---|---|
| `PERPLEXITY_API_KEY` | Recherche-Läufe |
| `NOMINATIM_CONTACT_EMAIL` | Pflichtangabe der OSM-Nutzungsrichtlinie für Geocoding |
| `AUTH_PASSWORD_HASH`, `SESSION_SECRET` | Login |

Die beiden Login-Werte erzeugt:

```bash
npm run hash-password
```

Das Skript fragt das Passwort verdeckt ab und gibt die fertigen `.env`-Zeilen aus. Das
Klartextpasswort wird nirgends gespeichert. **Ohne diese beiden Werte startet der Server bewusst
nicht** — sonst würde eine Fehlkonfiguration erst beim Anmeldeversuch auffallen.

Alle weiteren Variablen sind in `.env.example` kommentiert und haben brauchbare Vorgaben.

## Entwicklung

Die App besteht im Entwicklungsbetrieb aus zwei Prozessen:

```bash
npm run dev
```

```bash
npx vite
```

Der erste startet die API auf Port 3000, der zweite das Frontend auf Port 5173 und leitet `/api`
dorthin weiter. Zum Anschauen der Oberfläche also **Port 5173** öffnen.

Migrationen laufen beim Serverstart automatisch; `npm run migrate` gibt es zusätzlich einzeln.

```bash
npm test          # Unit-Tests
npm run typecheck # TypeScript fuer Server und Client
```

Nach Änderungen an den Client-Einstiegspunkten zusätzlich `npm run build:client` ausführen — der
Typecheck deckt das Browser-Ziel des Bundlers nicht ab.

## Betrieb

```bash
docker compose up -d --build
```

Der Container lauscht nur auf `127.0.0.1:3000`; TLS, Subdomain und Zertifikat übernimmt ein
Reverse Proxy davor, damit der API-Key nie an einem offenen Port hängt.

Zwei Punkte, die nicht offensichtlich sind:

- **Die Datenbank liegt auf einem Volume unter `/app/var`, nicht unter `/app/data`.** In `/app/data`
  stecken die statischen Datensätze aus dem Image (PLZ-Mittelpunkte, Gebietsliste); ein Volume an
  dieser Stelle würde sie verdecken. `DATABASE_PATH` und der Volume-Pfad im Compose gehören deshalb
  zusammen.
- **Ein manueller Recherche-Lauf dauert 20–30 Minuten.** Nginx bricht per Vorgabe nach 60 Sekunden
  ab (`proxy_read_timeout`). Entweder den Timeout hochsetzen oder den Endpunkt auf einen
  asynchronen Job mit Status-Abfrage umbauen. Der Nacht-Cron ist davon nicht betroffen, er läuft im
  Prozess ohne Proxy dazwischen.

## Kosten

Recherche kostet echtes Geld — das ist keine Nebensache, sondern der Grund für sämtliche Deckel im
Code:

- Ein Lauf über ein Gebiet liegt bei **etwa 0,20–0,25 €**.
- Der Nacht-Cron ist **standardmäßig aus** (`CRON_ENABLED=false`). Eingeschaltet mit zwei Gebieten
  pro Nacht sind das grob **12–15 € im Monat**.
- Pro Lauf greifen zusätzlich `RESEARCH_MAX_NEW_CANDIDATES` und `RESEARCH_MAX_COST_EUR`.

Die Feldnutzung selbst kostet nichts — sie liest nur die Datenbank.

## Datensätze

Unter `data/` liegen drei erzeugte Dateien, die die App zur Laufzeit liest: PLZ-Mittelpunkte,
Ortsnamen je PLZ-Präfix und die Gebietsliste für den Cron. Alle drei stammen aus dem
GeoNames-Postleitzahlen-Export (CC BY 4.0, Herkunft und Lizenz in
[`data/plz-centroids.SOURCE.md`](data/plz-centroids.SOURCE.md)) und lassen sich mit den Skripten in
`scripts/` neu erzeugen.

Die **Reihenfolge in `data/plz-areas.json` bestimmt, welche Gebiete der Cron zuerst abarbeitet**.
Sie ist grob nach Stadt-vor-Land vorsortiert und darf jederzeit nach eigener Marktkenntnis
umsortiert werden.

## Weitere Dokumente

- [`docs/spezifikation.md`](docs/spezifikation.md) — die verbindliche Spezifikation: getroffene
  Entscheidungen samt Begründung, Datenmodell, Punkteregeln der Bewertung, Umfang von v1.
- [`docs/Agent_api_hinweise.md`](docs/Agent_api_hinweise.md) — der geprüfte Vertrag mit der
  Perplexity Agent API. Vor Änderungen an den API-Aufrufen lesen; die dort beschriebenen Fallstricke
  scheitern sonst still.
- [`CLAUDE.md`](CLAUDE.md) — Arbeitsanleitung für Claude Code, inklusive der Testlauf-Historie und
  offener Punkte.
