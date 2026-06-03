# Operations Guide

## Daily Checks

- Confirm web dashboard is reachable.
- Confirm worker is running.
- Check failed jobs in `/dashboard/jobs`.
- Check devices with `ERROR`, `OFFLINE`, or `DISCONNECTED` health.
- Check posts stuck in `PUBLISHING` or `FAILED`.
- Check accounts with expired or unverified device mappings.

## Worker

Start worker locally:

```bash
npm run worker
```

The worker requires:

```env
DATABASE_URL="..."
```

Current worker handlers are intentionally lightweight and should be expanded as production flows are finalized.

## Database

Generate Prisma Client:

```bash
npm run db:generate
```

Local push:

```bash
npm run db:local:push
```

Migration deploy:

```bash
npm run db:migrate
```

Seed:

```bash
npm run db:seed
```

## Logs

Important log tables:

- `JobLog`: background actions, MobileRun actions, publish attempts
- `DeviceHealthLog`: health checks and device automation checks
- `AuditLog`: admin/user actions
- `Notification`: dashboard notifications

## Device Locking

The `Device` model contains lock fields:

- `locked`
- `lockedAt`
- `lockedReason`

Publishing and interaction jobs should lock a device before running automation and release it after completion. Avoid running two MobileRun tasks on the same device at once.

## MobileRun Troubleshooting

Check ADB:

```bash
adb devices -l
```

Check MobileRun Portal:

```bash
mobilerun ping --device <adbId>
```

Read UI:

```bash
mobilerun device ui --device <adbId>
```

Take screenshot:

```bash
mobilerun device screenshot --device <adbId>
```

If Portal is not accessible:

- Re-run `mobilerun setup --device <adbId>`.
- Confirm accessibility service is enabled.
- Reconnect ADB.
- Unlock the device screen.

## Release Checklist

Before pushing or deploying:

```bash
npm run db:generate
npx tsc --noEmit --pretty false
npm run build
```

Also check that no secrets are staged:

```bash
git status --short
git diff --cached -- . ':!package-lock.json'
```
