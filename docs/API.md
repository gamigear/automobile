# API Notes

All admin APIs expect a bearer token from the local JWT login flow unless noted otherwise.

```http
Authorization: Bearer <accessToken>
```

## Auth

```text
POST /api/auth/login/
GET  /api/auth/me/
POST /api/auth/register/
```

## Core Domains

```text
/api/posts
/api/accounts
/api/media
/api/approvals
/api/jobs
/api/users
/api/settings
/api/sources
/api/notifications
```

## Devices

```text
GET  /api/devices
POST /api/devices
GET  /api/devices/:deviceId
POST /api/devices/:deviceId/health-check
POST /api/devices/:deviceId/open
POST /api/devices/:deviceId/close
POST /api/devices/:deviceId/state
POST /api/devices/:deviceId/scan-social-logins
POST /api/devices/:deviceId/verify-login
POST /api/devices/:deviceId/mobilerun
```

## MobileRun Device Actions

Endpoint:

```text
POST /api/devices/:deviceId/mobilerun
```

Examples:

```json
{ "action": "ping" }
```

```json
{ "action": "screenshot" }
```

```json
{ "action": "ui" }
```

```json
{ "action": "openApp", "platform": "FACEBOOK" }
```

```json
{
  "action": "verifyLogin",
  "platform": "INSTAGRAM",
  "expectedHandle": "gami.food",
  "reasoning": true,
  "vision": true,
  "steps": 20
}
```

```json
{
  "action": "runTask",
  "goal": "Open Instagram and summarize the current screen.",
  "vision": true,
  "steps": 10
}
```

## Response Pattern

Most APIs return:

```json
{
  "data": {},
  "result": {}
}
```

Error responses usually return:

```json
{
  "message": "Human readable error"
}
```
