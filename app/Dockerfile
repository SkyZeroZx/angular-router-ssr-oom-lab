FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24.21.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/router-oom-e2e/server/server.mjs"]
