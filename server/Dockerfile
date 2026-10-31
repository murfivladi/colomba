# Сборка из корня репозитория: docker build -f server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w shared -w server --include-workspace-root
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
RUN npm run build -w shared && npm run build -w server && npm prune --omit=dev -w shared -w server

FROM node:22-alpine
ENV NODE_ENV=production PORT=5576 MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/server/data server/data
COPY server/healthcheck.cjs server/healthcheck.cjs
RUN mkdir -p /data/media && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 5576
HEALTHCHECK --interval=30s --timeout=5s CMD node healthcheck.cjs
CMD ["node", "dist/index.js"]
