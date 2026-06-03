# Setup Guide

This guide explains how to run the project locally or with Docker.

## Requirements

- Node.js 18+
- npm
- PostgreSQL or Neon PostgreSQL
- Docker and Docker Compose, optional but recommended
- Android platform tools if using Android devices
- `uv` if using MobileRun

## Environment

Create a local env file:

```bash
cp .env.example .env
```

Minimum local values:

```env
DATABASE_URL="postgresql://gami:gami_local_password@localhost:5432/gami?schema=public"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:8081"
ADMIN_EMAIL="admin@gami.local"
ADMIN_PASSWORD="admin123456"
```

For Neon, replace `DATABASE_URL` with the Neon connection string.

## Install

```bash
npm install --legacy-peer-deps
npm run db:generate
```

## Local Database With Docker

Start only Postgres:

```bash
docker compose up -d postgres
```

Push schema and seed data:

```bash
npm run db:local:push
npm run db:local:seed
```

## Run Development Server

```bash
npm run dev
```

Dashboard URL:

```text
http://localhost:8081
```

Default login comes from `.env`:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
```

## Run Worker

In another terminal:

```bash
npm run worker
```

## Run Telegram Bot

Set these env vars first:

```env
TELEGRAM_BOT_TOKEN=""
TELEGRAM_APP_BASE_URL="http://localhost:8081"
```

Then run:

```bash
npm run telegram:bot
```

## Docker Compose

Run the complete stack:

```bash
docker compose up --build
```

Services:

- `postgres`: local PostgreSQL
- `web`: Next.js production server
- `worker`: pg-boss worker
- `telegram-bot`: optional Telegram ingestion bot

The compose file defaults to local Postgres if `DATABASE_URL` is not provided.

## Verification

```bash
npm run db:generate
npx tsc --noEmit --pretty false
npm run build
```

The full lint script can be slow because the dashboard template contains many files. For focused checks:

```bash
npx eslint --ext .ts,.tsx src/server src/app/api prisma
```
