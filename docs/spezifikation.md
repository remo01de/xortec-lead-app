# Xortec Lead-App — Spezifikation v1

Ergebnis des Grill-Me-Interviews vom 07.09.2026. Verbindliche Grundlage für die Implementierung.

## 1. Zielbild

Ein Werkzeug für **einen** Vertriebsmitarbeiter (Gebiet Hamburg, Niedersachsen, Bremen, NRW),
das ihm im Außendienst auf Tablet/Smartphone zeigt, welche **Facherrichter** für Videoüberwachung
und Sicherheitstechnik in seiner Nähe noch keine Xortec-Kunden sind — mit nachvollziehbarem Beleg,
warum die Firma auf der Liste steht.

**Erfolgsmaßstab ist Präzision, nicht Vollständigkeit.** Ziel: 20 belastbare, telefonierbare
Leads pro Gebiet. Die Recherche über eine Websuche findet strukturell nur einen Teil der
tatsächlich existierenden Betriebe — das wird akzeptiert und ist kein Fehler der App.

## 2. Architektur

Drei getrennte Ebenen. Die teure Recherche und die schnelle Feldnutzung sind **entkoppelt**.

### Ebene 1 — Recherche (selten, kostet Geld, füllt die Datenbank)
- Ausgelöst durch nächtlichen Cron (2 PLZ-Gebiete/Nacht) **und** manuellen Button.
- Stufe 1: Perplexity **Search API** sammelt Kandidaten für ein PLZ-Gebiet
  (3–5 Requests, `country=DE`, deutschsprachig).
- App dedupliziert die Kandidaten gegen die Datenbank über die **Domain**.
  Bereits qualifizierte Firmen werden nie erneut bezahlt.
- Stufe 2: **ein Agent-API-Call pro unbekannter Firma** liefert Fakten und Belege
  nach festem JSON-Schema.
- Harter Deckel: **40 neue Kandidaten pro Lauf**. Laufende Kostenanzeige in der UI.

### Ebene 2 — Anreicherung (automatisch, kostenlos)
- Geocoding jeder Adresse über die öffentliche Nominatim-API, gedrosselt auf
  **1 Request/15 s**, Ergebnisse dauerhaft gecacht (Vorgabe der OSMF-Nutzungsrichtlinie:
  4 Requests/Minute für regelmäßig laufende Skripte, Caching verpflichtend).
  Fallback bei nicht auflösbarer Adresse: PLZ-Mittelpunkt aus Offline-Datensatz (±5 km).
- HTTP-Check aller URLs aus `sources` — erfundene Links fliegen dadurch auf.
- Berechnung der drei Scores (siehe 5.).

### Ebene 3 — Feldnutzung (oft, kostenlos, schnell)
- Reine Datenbankabfrage. Kein API-Call, keine Wartezeit, funktioniert bei schlechtem Netz.
- Standort per Browser-Geolocation, Umkreisradius wählbar.
- Findet die Umkreissuche nichts, bietet die App einen Recherche-Lauf an —
  **mit sichtbarem Hinweis auf Dauer und Kosten**.

**Konsequenz, die in der App als Text stehen muss:** Die Datenbank muss dem Gebiet des
Vertrieblers *vorauslaufen*. Ein Gebiet, das nachts nie recherchiert wurde, ist tagsüber leer.
Der Hinweis gehört sichtbar in die Recherche-Ansicht, damit er nicht vergessen wird.

## 3. Getroffene Entscheidungen

| # | Entscheidung |
|---|---|
| Q1 | Zieldefinition: Präzision statt Vollständigkeit |
| Q2 | Bestandskundenabgleich manuell (siehe Q16); CSV-Import wird vorbereitet, aber nicht befüllt |
| Q3 | Ein Nutzer (Vertrieb HH/NI/HB/NRW), ca. 2 Nutzungen pro Tag |
| Q4 | Gebietssteuerung über explizite PLZ-/Ortsliste im Prompt **plus** harter Geofilter in der App |
| Q5 | Budget 0,50 € pro Recherche-Lauf |
| Q6 | **Agent API** (`/v1/agent`), nicht der auslaufende Sonar-Endpoint. API-Zugriff in einem Modul gekapselt |
| Q7 | Gebietseinheit = zweistelliges PLZ-Präfix; zusätzlich freie Umkreissuche im Feld |
| Q8 | Docker auf IONOS, eigene Subdomain, HTTPS, API-Key bleibt serverseitig, Tages-Rate-Limit im Code |
| Q9 | 40 neue Kandidaten pro Lauf, konfigurierbar |
| Q10 | Salesforce-Export wird nicht angebunden |
| Q11 | Lead-Status in der App: neu / angerufen / kein Interesse / in Salesforce übernommen / Bestandskunde |
| Q12 | Umkreissuche liest ausschließlich die Datenbank |
| Q13 | Recherche wird per Nacht-Cron **und** manuell ausgelöst |
| Q14 | Nominatim gedrosselt im Cron, PLZ-Mittelpunkt als Fallback |
| Q15 | Startbildschirm = nach Entfernung sortierte Liste mit `tel:`-Button. Responsive Webapp mit PWA-Manifest. Karte erst in v2 |
| Q16 | Kein CSV-Abgleich in v1. Status "Bestandskunde" lässt die Ausschlussliste durch Nutzung wachsen |
| Q17 | Modell liefert nur Fakten und Belege. App rechnet Score, Priorität, Verifikationsstatus, Entfernung |
| Q18 | Lead ohne belastbare Quelle kommt als "ungeprüft" in die Datenbank, wird in der Feldansicht ausgeblendet |
| Q19 | Drei getrennte Werte: Fachlichkeit, Potenzial, Datenqualität. Herstellerbindung wird angezeigt, nicht verrechnet |
| Q20 | Keine personenbezogenen Kontaktdaten. Nur Firmendaten und funktionsbezogene Kontakte. **Kein E-Mail-Button in der UI** |
| Q21 | v1-Schnitt siehe 6. |

## 4. Datenmodell (SQLite)

**companies** — eine Zeile pro Firma, Schlüssel ist die normalisierte Domain
- `id`, `domain` (unique), `company_name`, `website`, `street`, `postal_code`, `city`
- `phone`, `lat`, `lon`, `geocode_source` (nominatim | plz_centroid | none)
- `company_type`, `services` (JSON), `target_segments` (JSON)
- `manufacturer_mentions` (JSON), `certifications` (JSON)
- `score_fachlichkeit`, `score_potenzial`, `score_datenqualitaet`, `priority`
- `verification_status` (verified | unverified)
- `status` (neu | angerufen | kein_interesse | in_salesforce | bestandskunde)
- `note`, `first_seen_run_id`, `last_updated`

**sources** — n pro Firma: `company_id`, `url`, `title`, `evidence`, `http_ok`, `checked_at`

**evidence** — n pro Firma: `company_id`, `text`

**runs** — Protokoll: `id`, `area_code`, `started_at`, `candidates_found`, `candidates_qualified`,
`api_calls`, `cost_eur`, `trigger` (cron | manual)

## 5. Scoring (deterministisch in der App)

**Fachlichkeit 0–100**
- Videoüberwachung als Leistung belegt: 25
- Planung **und** Installation belegt: 25
- Wartung / Service / Fernwartung belegt: 15
- VMS, Server, Storage, Netzwerk, PoE oder LWL belegt: 15
- Zutritt, EMA, BMA oder Intercom zusätzlich: 10
- VdS, BHE oder DIN 14675 belegt: 10

**Potenzial 0–100**
- Segmente Industrie, Logistik, Retail, öffentliche Hand, KRITIS: je 15, maximal 45
- Referenzprojekte öffentlich belegt: 25
- Betriebsgröße erkennbar (Team-/Karriereseite, mehr als 10 Mitarbeiter): 20
- Mehrere Standorte oder eigene Leitstelle: 10

**Datenqualität 0–100**
- Zwei oder mehr unabhängige Quellen: 40
- Eigene Website erreichbar (HTTP 200): 30
- Adresse per Geocoder auflösbar: 15
- Telefonnummer vorhanden: 15

**Ableitungen**
- Datenqualität unter 45 → `verification_status = unverified` → in der Feldansicht ausgeblendet
- Priorität A: Fachlichkeit ≥ 70 **und** Potenzial ≥ 50
- Priorität B: Fachlichkeit ≥ 70 **oder** (Fachlichkeit ≥ 50 und Potenzial ≥ 50)
- Priorität C: Rest
- Fachlichkeit unter 35 → nicht angezeigt, bleibt aber in der Datenbank
- Sortierung im Feld: Entfernung. Am Schreibtisch: Fachlichkeit × Potenzial

Sichtbare Herstellerbindung (z. B. "Axis Gold Partner") wird als Merkmal angezeigt und
**nicht** in den Score verrechnet — die Einordnung macht der Vertriebler.

## 6. JSON-Schema Stufe 2 (eine Firma pro Call)

Flach, ohne Bewertungsfelder, ohne erzwungene Belege.

```json
{
  "name": "xortec_company_qualification",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["company_name", "website", "street", "postal_code", "city", "phone",
                 "is_facherrichter", "company_type", "services", "target_segments",
                 "manufacturer_mentions", "certifications", "size_indicators",
                 "reference_projects", "evidence", "sources"],
    "properties": {
      "company_name":  { "type": "string" },
      "website":       { "type": ["string", "null"] },
      "street":        { "type": ["string", "null"] },
      "postal_code":   { "type": ["string", "null"], "pattern": "^[0-9]{5}$" },
      "city":          { "type": ["string", "null"] },
      "phone":         { "type": ["string", "null"] },
      "is_facherrichter": { "type": "boolean" },
      "company_type": { "type": "string", "enum": [
        "security_systems_installer", "video_surveillance_installer",
        "alarm_security_installer", "electrical_installer", "it_system_integrator",
        "building_technology_installer", "mixed_security_integrator",
        "security_service_no_installation", "reseller_only", "other", "unknown"] },
      "services": { "type": "array", "items": { "type": "string", "enum": [
        "video_surveillance", "video_management_system", "nvr_recording",
        "server_storage_raid", "network_poe", "fiber_optics", "access_control",
        "video_intercom", "intrusion_alarm", "fire_detection", "planning_design",
        "installation", "commissioning", "maintenance_service", "remote_maintenance",
        "monitoring_station", "license_plate_recognition", "video_analytics",
        "thermal_imaging", "other"] } },
      "target_segments": { "type": "array", "items": { "type": "string", "enum": [
        "private_customers", "small_business", "commercial", "retail", "industry",
        "logistics", "property_management", "public_sector", "education",
        "healthcare", "critical_infrastructure", "other"] } },
      "manufacturer_mentions": { "type": "array", "items": { "type": "object",
        "additionalProperties": false,
        "required": ["manufacturer", "relationship"],
        "properties": {
          "manufacturer": { "type": "string" },
          "relationship": { "type": "string",
            "enum": ["certified_partner", "mentioned_only"] } } } },
      "certifications": { "type": "array", "items": { "type": "string",
        "enum": ["vds", "bhe", "din_14675", "iso_9001", "k_einbruch", "other"] } },
      "size_indicators": { "type": ["string", "null"] },
      "reference_projects": { "type": "array", "items": { "type": "string" } },
      "evidence": { "type": "array", "items": { "type": "string" } },
      "sources": { "type": "array", "items": { "type": "object",
        "additionalProperties": false,
        "required": ["url", "title", "evidence"],
        "properties": {
          "url":      { "type": "string" },
          "title":    { "type": "string" },
          "evidence": { "type": "string" } } } }
    }
  }
}
```

Änderungen gegenüber dem Ursprungsentwurf und ihr Grund:

1. **`minItems: 1` bei `evidence` und `sources` entfernt.** Der Zwang, mindestens einen
   Beleg zu liefern, erzeugt erfundene Belege. Leere Arrays sind erlaubt; die App verwirft
   oder markiert den Lead.
2. **`lead_score`, `lead_priority`, `fit_for_xortec`, `verification_status` entfernt.**
   Bewertung ist Aufgabe der App, sonst existieren zwei widersprüchliche Wahrheiten.
3. **`not_publicly_listed` / `not_publicly_verified` entfernt.** Fehlende Daten sind ein
   leeres Array, kein Datenwert.
4. **Wrapper (`leads[]`, `search_area`, `excluded_count`) entfernt.** Ein Call pro Firma;
   den Rahmen baut die App. Kleines Schema heißt außerdem geringeres Risiko beim
   Schema-Prep der API (dokumentiert sind 10–30 s Verzögerung beim ersten Request
   mit neuem Schema, inklusive Timeout-Gefahr).
5. **`manufacturer_mentions` als Objekt mit `relationship`.** "Axis Gold Partner" und
   "wir verbauen auch Axis" sind vertrieblich das Gegenteil voneinander.
6. **`services` um `planning_design`, `installation`, `commissioning` und `other` ergänzt**,
   weil genau diese drei die Definition von "Facherrichter" tragen und vorher nur im
   Fließtext standen.
7. **`is_facherrichter` als eigenes Boolean** — die zentrale Ja/Nein-Entscheidung der
   zweiten Stufe wird nicht mehr aus Enums abgeleitet.
8. **`postal_code` mit Pattern**, weil PLZ Dedup- und Geo-Schlüssel ist.

## 7. Umfang v1

**Enthalten:** Stufe 1 + Stufe 2, SQLite, Geocoding, Nacht-Cron, manueller Gebietslauf,
Umkreisliste mit Statusverwaltung, `tel:`-Button, Kostenanzeige, Docker auf IONOS mit Login.

**Nicht enthalten:** Kartenansicht, CSV-Import, Export, Mehrbenutzerbetrieb,
Salesforce-Anbindung, Score-Feintuning.

**Abnahmekriterium:** Ein Lauf über ein PLZ-Gebiet, das Remo selbst kennt (21 oder 22).
Er prüft die Treffer gegen seine eigene Marktkenntnis. Sind weniger als 50 % brauchbar,
liegt der Fehler im Prompt und nicht in der App — dann wird kein weiteres Feature gebaut,
bevor das behoben ist.

## 8. Offene Punkte und Risiken

1. **Agent-API-Syntax für `response_format`/`json_schema` ist in der Migrationsdoku nicht
   sauber beschrieben.** Muss beim Bauen gegen die API verifiziert werden. Wenn strukturierte
   Ausgabe dort anders funktioniert als bei Sonar, ändert sich Stufe 2. Das ist das größte
   technische Risiko in v1.
2. **API-Key**: Auf wessen Rechnung läuft das Perplexity-Konto? Bei 2 Läufen/Tag rund
   25 €/Monat. Muss vor dem Bauen geklärt sein.
3. **PLZ-Gebietsliste** für HH/NI/HB/NRW inklusive Abarbeitungsreihenfolge für den Cron
   ist noch nicht erstellt. Vorschlag: nach Betriebsdichte, nicht alphabetisch.
4. **Potenzial-Score wird oft dünn bleiben.** Betriebsgröße ist bei kleinen Errichtern
   selten öffentlich belegt. Erwartung: viele Leads mit Potenzial unter 30, obwohl sie gut sind.
   Nach dem Testlauf prüfen, ob der Wert überhaupt trägt.
5. **Prompt-Feintuning** erfolgt nach dem ersten Testlauf, nicht vorher.
6. **Score-Gewichtung** ist ein erster Vorschlag und wird nach dem Testlauf kalibriert.