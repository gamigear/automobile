# Gami Social Content Admin

Dashboard local/self-hosted để quản lý bài đăng, lịch đăng, phê duyệt, media Google Drive, tài khoản Facebook/Instagram và job đồng bộ.

## Stack

- Next.js + TypeScript
- Minimal Dashboard / MUI template
- Neon PostgreSQL
- Prisma
- pg-boss worker
- Docker Compose

## Chạy local

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run db:generate
npm run dev
```

Dashboard mặc định chạy tại:

```text
http://localhost:8081
```

## Chạy bằng Docker

```bash
cp .env.example .env
docker compose up --build
```

Yêu cầu cập nhật `DATABASE_URL` trong `.env` bằng connection string Neon trước khi chạy migration hoặc worker thật.

## Database

```bash
npm run db:dev
npm run db:seed
```

Seed tạo admin mặc định từ:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
```

## MobileRun Android automation

MobileRun được dùng như automation engine cho Android device khi cần điều khiển app social native.

```bash
uv tool install mobilerun
mobilerun setup --device <adbId>
mobilerun ping --device <adbId>
```

Các API nền đã có:

```text
POST /api/devices/:deviceId/mobilerun
```

Payload hỗ trợ giai đoạn đầu:

```json
{ "action": "ping" }
{ "action": "screenshot" }
{ "action": "ui" }
{ "action": "openApp", "platform": "INSTAGRAM" }
{ "action": "verifyLogin", "platform": "INSTAGRAM", "expectedHandle": "gami.food" }
```

Runner đọc env `MOBILERUN_BIN`, `MOBILERUN_TIMEOUT_MS`, `MOBILERUN_FACEBOOK_PACKAGE`, `MOBILERUN_INSTAGRAM_PACKAGE`.

## Tài liệu

- [Project overview](docs/PROJECT_OVERVIEW.md)
- [Setup guide](docs/SETUP.md)
- [MobileRun integration](docs/MOBILERUN.md)
- [Operations guide](docs/OPERATIONS.md)
- [API notes](docs/API.md)

## Module MVP

- Tổng quan
- Bài đăng
- Lịch đăng
- Phê duyệt
- Media Library
- Nguồn nội dung
- Tài khoản mạng xã hội
- Jobs / Đồng bộ
- Nhân viên
- Cài đặt

## Đăng nhập local

Màn hình đăng nhập JWT dùng API nội bộ:

```text
/api/auth/login/
/api/auth/me/
```

Thông tin mặc định lấy từ `.env`:

```text
ADMIN_EMAIL=admin@gami.local
ADMIN_PASSWORD=admin123456
```
