# Quelle: data/plz-centroids.csv

Aggregiert aus [GeoNames](https://www.geonames.org/) Postleitzahlen-Export fuer Deutschland
(`https://download.geonames.org/export/zip/DE.zip`, abgerufen 2026-09-07).

Lizenz: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) —
Namensnennung: Daten von GeoNames (www.geonames.org).

Erzeugt mit `scripts/build-plz-centroids.mjs`: pro PLZ wird der Mittelwert aller in der
GeoNames-Datei enthaltenen Koordinaten gebildet (mehrere Zeilen pro PLZ moeglich, z.B. bei
Groharoessern mit eigener PLZ). 10.813 Postleitzahlen.
