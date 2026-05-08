# -------------------------------------------------------------
# 1. المرحلة الأولى: مرحلة البناء (BUILDER STAGE)
# -------------------------------------------------------------
FROM node:20-alpine AS builder

ARG DATABASE_URL
ARG CACHE_DATE

ENV DATABASE_URL=$DATABASE_URL

RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install
RUN echo "Cache Buster: $CACHE_DATE"
COPY . .

RUN npx prisma generate

RUN npm run build 

# -------------------------------------------------------------
# 2. المرحلة الثانية: مرحلة الإنتاج (PRODUCTION STAGE)
# -------------------------------------------------------------
FROM node:20-bullseye AS final

# تثبيت التبعيات النظامية اللازمة للتشغيل فقط (openssl)
RUN apt-get update && apt-get install -y openssl
# تعيين مجلد العمل
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --only=production

COPY --from=builder /app/dist ./dist
 

COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY prisma ./prisma/


EXPOSE 3000

CMD [ "npm", "start" ]
