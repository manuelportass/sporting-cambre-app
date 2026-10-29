# Imagen de producción: compila la interfaz y arranca el servidor
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY client/package*.json client/
RUN cd client && npm ci
COPY . .
RUN cd client && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
