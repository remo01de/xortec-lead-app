# Agent API — verbindliche Hinweise für die Implementierung
 
Ergänzung zu `claude/lead-app-spezifikation-v1.md`. **Ersetzt dort Risiko 1** ("Agent-API-Syntax
für `response_format` ist nicht sauber dokumentiert"). Quelle: offizielles Perplexity-Skill
`migrate-sonar-to-agent-api`
(https://github.com/perplexityai/api-platform-developers/tree/main/skills/migrate-sonar-to-agent-api).
 
## Risiko 1 ist erledigt
 
`response_format` bleibt in der Agent API **top-level** und behält exakt die Form, die wir in
der Spezifikation vorgesehen haben:
 
```json
{ "type": "json_schema", "json_schema": { "name": "xortec_company_qualification", "schema": { } } }
```
 
- Die OpenAI-Responses-Schreibweise `text: { "format": ... }` wird **abgelehnt**
  (400, unknown field "format") — auch wenn die Antwort `text.format` zurückspiegelt.
- `json_schema.name` ist derzeit optional, sollte aber gesetzt werden (1–64 Zeichen,
  `[A-Za-z0-9_-]`).
- `type: "regex"` gibt es nicht.
**Das Ein-Firmen-Schema aus der Spezifikation kann unverändert übernommen werden.**
 
## Vier Fallen, die den Bau der App direkt betreffen
 
**1. Strict Mode.** Die Agent API weist *jedes* unbekannte Feld mit HTTP 400 ab — top-level
wie verschachtelt. Sonar hat unbekannte Parameter stillschweigend verworfen, die Agent API
nicht. Kein `return_citations`, kein `temperature` "auf Verdacht" mitschicken. Jeder Parameter
muss in der Doku stehen.
 
**2. Websuche läuft nicht automatisch.** Ein reiner Modell-Request recherchiert nichts und
antwortet ungegroundet — genau der Halluzinationsfall, den die ganze Belegkette verhindern soll.
Für Stufe 2 zwingend:
 
```json
"tools": [{ "type": "web_search" }],
"tool_choice": { "type": "web_search" }
```
 
Auch erzwungen liefert ein Lauf gelegentlich null Quellen. Das muss der Code abfangen — der
Lead landet dann per Definition aus der Spezifikation als "ungeprüft" in der Datenbank.
 
**3. Quellen stehen woanders.** Es gibt **kein** top-level `citations` und kein top-level
`search_results` mehr. Die Quellen liegen als `search_results`-Output-Item **innerhalb von
`output[]`**. `annotations` an der Message ist häufig ein leeres Array und darf nicht als
Quellenliste benutzt werden.
 
**4. Fehler kommen mit HTTP 200.** Fehlgeschlagene und abgebrochene Läufe antworten mit
HTTP 200 und `status: "failed"` bzw. `"cancelled"` plus gefülltem `error`-Feld. Der Code muss
auf `response.status` verzweigen, **nicht** nur auf den HTTP-Code. Sonst schreibt die App
leere Leads in die Datenbank und zählt sie als Erfolg.
 
## Kleinkram, der trotzdem 400er produziert
 
- Es gibt keinen Slug `perplexity/sonar-pro`. Preset `"low"` oder `perplexity/sonar` +
  web_search verwenden.
- Eigene Function-Namen, die mit eingebauten Tools kollidieren (`web_search`, `fetch_url`,
  `search_web` und weitere), werden mit 400 abgelehnt.
- `max_output_tokens` ist für `anthropic/*`-Modelle Pflicht. Bei Presets und Reasoning-Modellen
  kann ein zu enges Limit komplett von Reasoning-Tokens aufgebraucht werden, bevor überhaupt
  Text entsteht — großzügig setzen oder weglassen.