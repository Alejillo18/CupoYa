
    FROM node:22-alpine AS build
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY tsconfig*.json ./
    COPY prisma ./prisma
    RUN npx prisma generate
    COPY src ./src
    RUN npm run build

    FROM node:22-alpine
    WORKDIR /app
    ENV NODE_ENV=production
    RUN apk add --no-cache openssl
    COPY package*.json ./
    RUN npm ci --omit=dev
    COPY --from=build /app/dist ./dist
    COPY --from=build /app/prisma ./prisma
    COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
    COPY --from=build /app/node_modules/prisma ./node_modules/prisma
    COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
    USER node
    EXPOSE 3000
    CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/server.js"]