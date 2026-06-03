# Gami / Automobile Project Overview

Gami Automobile is a local/self-hosted social content operations dashboard. It manages posts, schedules, approvals, media, social accounts, devices, background jobs, source imports, and Android/mobile automation.

## Goals

- Manage social content from a web dashboard.
- Schedule and approve posts before publishing.
- Map social accounts to browser profiles or Android devices.
- Run background jobs for sync, publishing, imports, retries, and notifications.
- Use Android device automation for social apps where official APIs are limited.
- Keep audit logs and operational status visible to admins.

## Stack

- Next.js 13 App Router + TypeScript
- MUI / Minimal Dashboard template
- Prisma ORM
- PostgreSQL, local Docker Postgres or Neon
- pg-boss worker
- JWT auth for local dashboard login
- MostLogin profile integration
- Android ADB device integration
- MobileRun automation adapter
- Telegram bot for source import links

## Main Modules

- Dashboard overview
- Posts and scheduled publishing
- Calendar
- Approvals
- Media library
- Content sources and source imports
- Social accounts
- Devices and account-device mappings
- Jobs and health logs
- Users and roles
- Settings
- Telegram bot ingestion
- MobileRun Android automation

## Key Concepts

### Posts

Posts have a lifecycle:

```text
DRAFT -> WAITING_APPROVAL -> APPROVED -> SCHEDULED -> PUBLISHING -> PUBLISHED
                                                   -> FAILED
                                                   -> CANCELLED
```

A post can target one or more social accounts and can be associated with media assets and a device.

### Devices

Devices represent either browser automation profiles or Android devices.

Supported device types/providers include:

- `ANTIDETECT_PROFILE` with `MOSTLOGIN`
- `ANDROID_DEVICE` with `ADB`

MobileRun is used as an automation engine on top of Android ADB devices.

### Jobs

The worker uses pg-boss for queued work and also stores operational logs in `JobLog`.

Current job families include:

- `drive.syncFolder`
- `meta.syncAccounts`
- `post.publishTarget`
- `device.healthCheck`
- `device.mobilerun.*`
- source import/download jobs

## Important Directories

```text
src/app                 Next.js app routes and API routes
src/sections            Dashboard UI sections
src/server              Server-side adapters, worker, bots, processors
src/lib                 Auth, Prisma, API helpers
src/routes              Route path helpers
prisma                  Prisma schema and seed script
public                  Static assets and uploads
docs                    Project documentation
template                Original dashboard template reference
```

## Security Notes

- Do not commit `.env` or backup env files.
- Do not log raw tokens, passwords, or social account secrets.
- Use role checks in API routes for all admin actions.
- Treat MobileRun prompts as operational commands: keep them specific and guarded.
- Always verify the active account before publishing through a mobile app.
