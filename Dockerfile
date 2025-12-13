# -------------------------------------------------------------
# 1. المرحلة الأولى: مرحلة البناء (BUILDER STAGE)
# -------------------------------------------------------------
FROM node:20-alpine AS builder

ARG DATABASE_URL

# **2. تعيين المتغير (ENV) داخلياً لجعله متاحاً لـ npx prisma generate**
ENV DATABASE_URL=$DATABASE_URL

# تثبيت التبعيات النظامية (مثل openssl اللازمة لـ Prisma)
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

# نسخ ملفات تعريف المشروع (لأجل التخزين المؤقت)
COPY package.json package-lock.json ./

# تثبيت كل التبعيات (بما فيها devDependencies لإجراء الـ build)
RUN npm install

# نسخ ملفات الكود المصدري و prisma (بما فيها schema.prisma)
COPY . .

# 1. تشغيل مولد Prisma Client
# هذا سيضمن أن أحدث ملفات Client موجودة في src/generated/prisma
RUN npx prisma generate

# 2. بناء كود TypeScript إلى JavaScript
# هذا سيفترض أن الناتج سيذهب إلى مجلد 'dist' (كما هو شائع)
# (مثلاً: dist/server.js)
RUN npm run build 

# -------------------------------------------------------------
# 2. المرحلة الثانية: مرحلة الإنتاج (PRODUCTION STAGE)
# -------------------------------------------------------------
FROM node:20-bullseye AS final

# تثبيت التبعيات النظامية اللازمة للتشغيل فقط (openssl)
RUN apt-get update && apt-get install -y openssl
# تعيين مجلد العمل
WORKDIR /app

# نسخ فقط ملفات package.json و package-lock.json
COPY package.json package-lock.json ./

# تثبيت تبعيات الإنتاج فقط
RUN npm install --only=production

# 1. نسخ ملفات JavaScript المُجمَّعة (dist)
# بما أن ملفاتك المصدرية في 'src'، فالناتج سيكون في 'dist/src' أو 'dist' حسب tsconfig
# سنفترض أن الملفات النهائية موجودة في مجلد 'dist' الرئيسي
COPY --from=builder /app/dist ./dist

# 2. نسخ ملفات Prisma الضرورية للتشغيل
# * الملفات التنفيذية والبيانات الثنائية (Prisma Engine)
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# * نسخ ملف schema.prisma (ضروري لتشغيل Prisma Client)
COPY prisma/schema.prisma ./prisma/schema.prisma

# ملاحظة: إذا كنت تستخدم بيئة التشغيل 'dist/src/server.js'، قد تحتاج لتعديل المسارات قليلاً.

# المنفذ الذي يستمع إليه التطبيق
EXPOSE 3000

# أمر بدء التشغيل
# يفترض أن الأمر "start" في package.json هو: "node dist/server.js"
CMD [ "npm", "start" ]