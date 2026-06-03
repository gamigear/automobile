import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DeviceType, type Device, type Platform } from '@prisma/client';

const execFileAsync = promisify(execFile);

export type MobileRunActionResult = {
  status: 'OK' | 'ERROR';
  message: string;
  metadata?: Record<string, unknown>;
};

export type MobileRunTaskInput = {
  device: Device;
  goal: string;
  steps?: number;
  reasoning?: boolean;
  vision?: boolean;
  visionOnly?: boolean;
  debug?: boolean;
};

const defaultTimeoutMs = Number(process.env.MOBILERUN_TIMEOUT_MS || 120000);

export const SOCIAL_APP_PACKAGES: Record<Platform, string> = {
  FACEBOOK: process.env.MOBILERUN_FACEBOOK_PACKAGE || 'com.facebook.katana',
  INSTAGRAM: process.env.MOBILERUN_INSTAGRAM_PACKAGE || 'com.instagram.android',
};

function mobilerunBin() {
  return process.env.MOBILERUN_BIN || 'mobilerun';
}

function getAdbId(device: Device) {
  if (device.type !== DeviceType.ANDROID_DEVICE) {
    throw new Error('MobileRun hiện chỉ hỗ trợ Android device trong Gami');
  }

  if (!device.adbId) throw new Error('Device chưa có ADB ID');

  return device.adbId;
}

function sanitizeOutput(output: string) {
  return output.trim().slice(-8000);
}

async function runMobileRun(args: string[], timeout = defaultTimeoutMs) {
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(mobilerunBin(), args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });

    return {
      status: 'OK' as const,
      stdout: sanitizeOutput(stdout),
      stderr: sanitizeOutput(stderr),
      durationMs: Date.now() - startedAt,
    };
  } catch (error: any) {
    return {
      status: 'ERROR' as const,
      stdout: sanitizeOutput(String(error?.stdout || '')),
      stderr: sanitizeOutput(String(error?.stderr || error?.message || '')),
      durationMs: Date.now() - startedAt,
      exitCode: error?.code,
    };
  }
}

export async function pingMobileRunDevice(device: Device): Promise<MobileRunActionResult> {
  const adbId = getAdbId(device);
  const result = await runMobileRun(['ping', '--device', adbId], 45000);
  const ok = result.status === 'OK';

  return {
    status: ok ? 'OK' : 'ERROR',
    message: ok ? 'MobileRun Portal accessible' : 'MobileRun ping thất bại',
    metadata: { adbId, ...result },
  };
}

export async function openSocialAppWithMobileRun(device: Device, platform: Platform): Promise<MobileRunActionResult> {
  const adbId = getAdbId(device);
  const packageName = SOCIAL_APP_PACKAGES[platform];
  const result = await runMobileRun(['device', 'start', packageName, '--device', adbId], 45000);
  const ok = result.status === 'OK';

  return {
    status: ok ? 'OK' : 'ERROR',
    message: ok ? `Đã mở ${platform} qua MobileRun` : `Không thể mở ${platform} qua MobileRun`,
    metadata: { adbId, platform, packageName, ...result },
  };
}

export async function captureScreenshotWithMobileRun(device: Device): Promise<MobileRunActionResult> {
  const adbId = getAdbId(device);
  const result = await runMobileRun(['device', 'screenshot', '--device', adbId], 45000);
  const ok = result.status === 'OK';

  return {
    status: ok ? 'OK' : 'ERROR',
    message: ok ? 'Đã chụp screenshot qua MobileRun' : 'Không thể chụp screenshot qua MobileRun',
    metadata: { adbId, screenshotPath: result.stdout.split('\n').pop() || '', ...result },
  };
}

export async function readUiWithMobileRun(device: Device): Promise<MobileRunActionResult> {
  const adbId = getAdbId(device);
  const result = await runMobileRun(['device', 'ui', '--device', adbId], 45000);
  const ok = result.status === 'OK';

  return {
    status: ok ? 'OK' : 'ERROR',
    message: ok ? 'Đã đọc UI state qua MobileRun' : 'Không thể đọc UI state qua MobileRun',
    metadata: { adbId, uiText: result.stdout, ...result },
  };
}

export async function runMobileRunTask(input: MobileRunTaskInput): Promise<MobileRunActionResult> {
  const adbId = getAdbId(input.device);
  const args = ['run', input.goal, '--device', adbId, '--steps', String(input.steps || 15)];

  if (input.reasoning) args.push('--reasoning');
  if (input.vision) args.push('--vision');
  if (input.visionOnly) args.push('--vision-only');
  if (input.debug) args.push('--debug');

  const result = await runMobileRun(args);
  const ok = result.status === 'OK';

  return {
    status: ok ? 'OK' : 'ERROR',
    message: ok ? 'MobileRun task hoàn tất' : 'MobileRun task thất bại',
    metadata: { adbId, goal: input.goal, ...result },
  };
}

export function buildVerifyLoginGoal(platform: Platform, expectedHandle: string) {
  const appName = platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook';

  return [
    `Open ${appName}.`,
    'Go to the profile or account area.',
    `Determine the currently logged in username, page name, or profile name. Expected account: ${expectedHandle}.`,
    `If the current account is not ${expectedHandle}, stop immediately and report ACCOUNT_MISMATCH.`,
    'Do not switch accounts and do not publish anything.',
    'Return a concise result with loggedIn, matchedExpectedAccount, detectedUsername, confidence, and visibleError.',
  ].join(' ');
}
