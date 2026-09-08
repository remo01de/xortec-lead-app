# Node 24: die App nutzt den eingebauten node:sqlite-Builtin (ab 22.5, siehe
# package.json engines) -- deshalb KEIN alpine/musl-Sonderweg und keine
# native Kompilierung noetig.
FROM node:24-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.client.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build


FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Nur fuer lesbare Logzeiten -- der Cron nutzt seine eigene Zeitzone aus
# CRON_TIMEZONE und haengt nicht hieran.
ENV TZ=Europe/Berlin

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Statische Datensaetze (PLZ-Zentroide, Gebietsliste, Ortsnamen). Die App loest
# sie relativ zu dist/server auf, deshalb muessen sie unter /app/data liegen.
COPY data ./data

# Die SQLite-Datei liegt bewusst NICHT in /app/data: ein Volume dort wuerde die
# oben kopierten Datensaetze verdecken. Stattdessen eigenes Verzeichnis, das im
# Compose als Volume gemountet wird (DATABASE_PATH zeigt darauf).
RUN mkdir -p /app/var && chown -R node:node /app/var
USER node

EXPOSE 3000

# /api/health ist bewusst ohne Login erreichbar (siehe index.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
