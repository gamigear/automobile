# MobileRun Integration

MobileRun is used as the Android automation engine for controlling native social apps from Gami jobs.

Gami remains the orchestration layer: posts, approval, schedule, devices, queue, logs, and audit. MobileRun performs device actions through ADB and the MobileRun Portal app.

## Install MobileRun

MobileRun requires Python `>=3.11,<3.14`.

```bash
uv tool install mobilerun
```

Confirm it is available:

```bash
mobilerun --help
```

## Prepare Android Device

On the device:

- Enable Developer Options.
- Enable USB Debugging or Wireless Debugging.
- Connect the device through ADB.
- Install the required social apps.
- Login to the correct social account.
- Keep app language, font scale, and display size stable.

Install and verify MobileRun Portal:

```bash
mobilerun setup --device <adbId>
mobilerun ping --device <adbId>
```

## Environment

Relevant env vars:

```env
ADB_PATH="adb"
MOBILERUN_BIN="mobilerun"
MOBILERUN_TIMEOUT_MS="120000"
MOBILERUN_FACEBOOK_PACKAGE="com.facebook.katana"
MOBILERUN_INSTAGRAM_PACKAGE="com.instagram.android"
```

## API Endpoint

Gami exposes a MobileRun action endpoint:

```text
POST /api/devices/:deviceId/mobilerun
```

The endpoint requires an admin bearer token and logs results to `JobLog`, `DeviceHealthLog`, and `AuditLog`.

Supported actions:

```json
{ "action": "ping" }
{ "action": "screenshot" }
{ "action": "ui" }
{ "action": "openApp", "platform": "INSTAGRAM" }
{ "action": "verifyLogin", "platform": "INSTAGRAM", "expectedHandle": "gami.food" }
{ "action": "runTask", "goal": "Open Instagram and report the current screen", "vision": true }
```

## Recommended Rollout

### Phase 1: Device Control

- MobileRun ping
- Screenshot
- UI tree read
- Open social app
- Store logs in device/job history

### Phase 2: Login Verification

- Open the target social app.
- Navigate to the profile/account area.
- Detect current account.
- Stop if it does not match the expected handle.
- Save verification status on `SocialAccountDevice`.

### Phase 3: Media Preparation

- Download media from Drive/R2/local source.
- Push media to Android device through ADB.
- Verify it is visible in gallery/file picker.
- Store device-local media path in metadata.

### Phase 4: Publish Through Social App

- Lock device.
- Verify MobileRun and account.
- Prepare media.
- Run guarded publish prompt.
- Capture final screenshot.
- Update `PostTarget` status.
- Release device lock.

### Phase 5: Interaction Tasks

- Like/comment/follow/check notifications.
- Add per-account and per-platform rate limits.
- Keep audit logs and screenshots.

## Prompt Guardrails

Use explicit, narrow prompts. Example:

```text
Open Instagram.
Verify the active account is exactly @gami.food.
If it is not @gami.food, stop and report ACCOUNT_MISMATCH.
Do not switch accounts.
Do not publish anything unless the account matches.
Return detected account, success, visible error, and final screen summary.
```

Do not ask the agent to make business decisions. Gami should decide what to publish and when; MobileRun should only execute the controlled task.

## App Cards

For better reliability, create MobileRun app cards outside the repo or in a private config path:

```text
config/app_cards/app_cards.json
config/app_cards/facebook.md
config/app_cards/instagram.md
```

Mapping example:

```json
{
  "com.facebook.katana": "facebook.md",
  "com.instagram.android": "instagram.md"
}
```

App cards should describe stable workflows, common popups, and stop conditions.

## Known Risks

- Social apps change UI frequently.
- App popups, checkpoints, and rate limits can interrupt automation.
- macOS Docker does not pass USB Android devices cleanly; host runner is easier.
- Never publish without verifying the active account first.
- Use test accounts before enabling scheduled production publishing.
