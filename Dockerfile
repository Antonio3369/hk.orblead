FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3080
ENV DATABASE_PATH=/app/data/app.db
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/public ./public
RUN mkdir -p /app/data
EXPOSE 3080
CMD ["sh", "-c", "node dist-server/seed.js 2>/dev/null || true; node dist-server/index.js"]
