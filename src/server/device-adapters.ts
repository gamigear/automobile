import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DeviceProvider, DeviceStatus, DeviceType, type Device } from '@prisma/client';
// server
import { getMostLoginConfig, mostLoginAuthHeaders, type MostLoginConfig } from './provider-settings';

const execFileAsync = promisify(execFile);

export type DeviceActionResult = {
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type AntidetectProfile = {
  externalId: string;
  name: string;
  profileName: string;
  proxyInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

async function callMostLogin(
  path: string,
  body: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'POST',
  inputConfig?: MostLoginConfig
) {
  const config = inputConfig || (await getMostLoginConfig());

  if (!config.apiKey) {
    throw new Error('MOSTLOGIN_API_KEY chưa được cấu hình');
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: mostLoginAuthHeaders(config),
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`MostLogin API lỗi ${response.status}`);
  }

  if (response.status === 204) return {};

  return response.json().catch(() => ({}));
}

function profileListFromMostLoginResponse(response: any) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.list)) return response.data.list;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.list)) return response.list;
  if (Array.isArray(response?.profiles)) return response.profiles;
  if (Array.isArray(response?.items)) return response.items;

  return [];
}

function normalizeMostLoginProfile(profile: any): AntidetectProfile | null {
  const externalId = String(profile.id || profile.profileId || profile.profile_id || profile.uuid || '');

  if (!externalId) return null;

  const profileName = String(profile.title || profile.name || profile.profileName || profile.profile_name || externalId);
  const proxyInfo =
    profile.proxy || profile.proxyInfo || profile.proxy_info
      ? {
          ...(profile.proxy || profile.proxyInfo || profile.proxy_info),
        }
      : undefined;

  return {
    externalId,
    name: `MostLogin - ${profileName}`,
    profileName,
    proxyInfo,
    metadata: {
      lastSyncSource: 'mostlogin.local',
      rawProfile: profile,
    },
  };
}

function detailFromMostLoginResponse(response: any) {
  if (response?.data && !Array.isArray(response.data)) return response.data;
  if (response?.profile) return response.profile;

  return response;
}

function safeMostLoginProfileMetadata(profile: any) {
  return {
    id: profile?.id,
    title: profile?.title,
    name: profile?.name,
    status: profile?.status,
    started: profile?.started,
    seq: profile?.seq,
    os: profile?.os,
    product: profile?.product,
    coreVersion: profile?.coreVersion,
    openTime: profile?.openTime,
    createdTime: profile?.createdTime,
    profileFolder: profile?.profileFolder,
    proxy: profile?.proxy,
  };
}

export async function listMostLoginProfiles(): Promise<AntidetectProfile[]> {
  const config = await getMostLoginConfig();
  const configuredPath = config.listProfilesPath;
  const candidates = configuredPath
    ? [{ path: configuredPath, method: config.listProfilesMethod }]
    : [
        { path: '/api/profile/getProfiles', method: 'POST' as const },
        { path: '/api/browser/listBrowser', method: 'POST' as const },
        { path: '/api/profile/list', method: 'POST' as const },
        { path: '/api/profile/getProfiles', method: 'GET' as const },
      ];

  const tryCandidate = async (index: number, errors: string[]): Promise<AntidetectProfile[]> => {
    const candidate = candidates[index];

    if (!candidate) {
      throw new Error(`Không thể đồng bộ MostLogin profiles. ${errors.join(' | ')}`);
    }

    try {
      const response = await callMostLogin(candidate.path, { page: 1, pageSize: 1000 }, candidate.method, config);

      return profileListFromMostLoginResponse(response)
        .map(normalizeMostLoginProfile)
        .filter(Boolean) as AntidetectProfile[];
    } catch (error) {
      return tryCandidate(index + 1, [
        ...errors,
        `${candidate.method} ${candidate.path}: ${error instanceof Error ? error.message : 'failed'}`,
      ]);
    }
  };

  return tryCandidate(0, []);
}

export async function getMostLoginProfile(externalId: string) {
  const config = await getMostLoginConfig();
  const response = await callMostLogin(
    config.detailProfilePath,
    { id: externalId, profileId: externalId },
    'POST',
    config
  );
  const detail = detailFromMostLoginResponse(response);
  const normalized = normalizeMostLoginProfile(detail);

  if (!normalized) {
    throw new Error('MostLogin không trả về chi tiết profile hợp lệ');
  }

  return { detail, normalized };
}

export async function listAntidetectProfiles(provider: DeviceProvider): Promise<AntidetectProfile[]> {
  if (provider === DeviceProvider.MOSTLOGIN) return listMostLoginProfiles();

  throw new Error('MVP hiện chỉ hỗ trợ sync profile MostLogin');
}

async function runAdb(args: string[]) {
  const adbPath = process.env.ADB_PATH || 'adb';
  const { stdout, stderr } = await execFileAsync(adbPath, args, { timeout: 15000 });

  return { stdout, stderr };
}

async function runAdbBuffer(args: string[]) {
  const adbPath = process.env.ADB_PATH || 'adb';
  const { stdout, stderr } = await execFileAsync(adbPath, args, {
    timeout: 15000,
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
  });

  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr).toString('utf8') };
}

function parseAdbDevices(output: string) {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [adbId, state] = line.split(/\s+/);
      const model = line.match(/model:([^\s]+)/)?.[1] || '';
      const product = line.match(/product:([^\s]+)/)?.[1] || '';
      const device = line.match(/device:([^\s]+)/)?.[1] || '';

      return { adbId, state, model, product, device, raw: line };
    })
    .filter((item) => item.adbId && item.state === 'device');
}

export async function listAdbDevices() {
  const { stdout } = await runAdb(['devices', '-l']);

  return Promise.all(
    parseAdbDevices(stdout).map(async (item) => {
      const [{ stdout: modelOut }, { stdout: versionOut }] = await Promise.all([
        runAdb(['-s', item.adbId, 'shell', 'getprop', 'ro.product.model']).catch(() => ({ stdout: item.model, stderr: '' })),
        runAdb(['-s', item.adbId, 'shell', 'getprop', 'ro.build.version.release']).catch(() => ({ stdout: '', stderr: '' })),
      ]);

      const model = modelOut.trim() || item.model || item.device || item.adbId;

      return {
        adbId: item.adbId,
        name: `Android ${model}`,
        deviceModel: model,
        androidVersion: versionOut.trim(),
        metadata: { adb: item },
      };
    })
  );
}

function parseAndroidUsers(output: string) {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/UserInfo\{(\d+):([^:}]+):/);
      if (!match) return null;

      return { id: match[1], name: match[2], isDualApp: match[1] !== '0' || /dual/i.test(match[2]) };
    })
    .filter(Boolean) as Array<{ id: string; name: string; isDualApp: boolean }>;
}

function accountSectionForUser(output: string, userId: string) {
  const marker = `User UserInfo{${userId}:`;
  const start = output.indexOf(marker);

  if (start < 0) return output;

  const nextUser = output.indexOf('\nUser UserInfo{', start + marker.length);

  return output.slice(start, nextUser > start ? nextUser : undefined);
}

function parseAndroidAccounts(output: string, androidUserId = '0') {
  const accounts: Array<{ name: string; type: string; platform: 'FACEBOOK' | 'INSTAGRAM' | 'UNKNOWN'; androidUserId: string }> = [];
  const regex = /Account \{name=([^,}]+),\s*type=([^}]+)\}/g;
  let match = regex.exec(output);

  while (match) {
    const type = match[2].toLowerCase();
    const platform = type.includes('facebook') ? 'FACEBOOK' : type.includes('instagram') ? 'INSTAGRAM' : 'UNKNOWN';

    accounts.push({ name: match[1], type: match[2], platform, androidUserId });
    match = regex.exec(output);
  }

  return accounts.filter((account) => account.platform !== 'UNKNOWN' && !account.type.toLowerCase().includes('messenger'));
}

export async function scanAndroidSocialLogins(device: Device) {
  const adbId = getAdbId(device);
  const socialPackages = [
    { platform: 'FACEBOOK', packageName: 'com.facebook.katana', label: 'Facebook' },
    { platform: 'FACEBOOK', packageName: 'com.facebook.lite', label: 'Facebook Lite' },
    { platform: 'FACEBOOK', packageName: 'com.facebook.pages.app', label: 'Meta Business Suite' },
    { platform: 'INSTAGRAM', packageName: 'com.instagram.android', label: 'Instagram' },
  ] as const;
  const [{ stdout: usersOut }, { stdout: accountsOut }] = await Promise.all([
    runAdb(['-s', adbId, 'shell', 'pm', 'list', 'users']).catch(() => ({ stdout: 'UserInfo{0:Owner:13}', stderr: '' })),
    runAdb(['-s', adbId, 'shell', 'dumpsys', 'account']).catch(() => ({ stdout: '', stderr: '' })),
  ]);
  const users = parseAndroidUsers(usersOut);
  const scanUsers = users.length ? users : [{ id: '0', name: 'Owner', isDualApp: false }];
  const userScans = await Promise.all(
    scanUsers.map(async (user) => {
      const { stdout: packagesOut } = await runAdb(['-s', adbId, 'shell', 'pm', 'list', 'packages', '--user', user.id]).catch(() => ({ stdout: '', stderr: '' }));
      const installedApps = socialPackages
        .filter((item) => packagesOut.includes(`package:${item.packageName}`))
        .map((item) => ({ ...item, installed: true, androidUserId: user.id, androidUserName: user.name, isDualApp: user.isDualApp }));
      const accounts = parseAndroidAccounts(accountSectionForUser(accountsOut, user.id), user.id).map((account) => ({
        ...account,
        androidUserName: user.name,
        isDualApp: user.isDualApp,
      }));

      return { androidUserId: user.id, androidUserName: user.name, isDualApp: user.isDualApp, installedApps, detectedAccounts: accounts };
    })
  );
  const installed = userScans.flatMap((scan) => scan.installedApps);
  const accounts = userScans.flatMap((scan) => scan.detectedAccounts);

  return {
    adbId,
    androidUsers: scanUsers,
    userScans,
    installedApps: installed,
    detectedAccounts: accounts,
    canReadAccountManager: accounts.length > 0,
    message: accounts.length
      ? 'Đã đọc được account social từ Android AccountManager'
      : 'Đã quét app social đã cài; Android không lộ tên account qua ADB thường',
  };
}

export async function getAndroidCurrentScreenText(device: Device) {
  if (device.type !== DeviceType.ANDROID_DEVICE) {
    throw new Error('Chỉ Android ADB device mới hỗ trợ đọc màn hình');
  }

  const adbId = getAdbId(device);
  const { stdout } = await runAdb(['-s', adbId, 'exec-out', 'uiautomator', 'dump', '/dev/tty']).catch(() => ({ stdout: '', stderr: '' }));
  const xml = stdout.slice(stdout.indexOf('<?xml'));

  if (!xml) return { adbId, xml: '', text: '' };

  const text = Array.from(xml.matchAll(/(?:text|content-desc)="([^"]+)"/g))
    .map((match) => match[1])
    .filter(Boolean)
    .join(' ');

  return { adbId, xml, text };
}

export async function captureAndroidAccountThumbnailIfCurrentProfile(device: Device, outputName: string, accountName: string) {
  const screen = await getAndroidCurrentScreenText(device);
  const normalizedText = screen.text.toLowerCase();
  const normalizedName = accountName.trim().toLowerCase();

  if (!normalizedName || !normalizedText.includes(normalizedName)) {
    return {
      captured: false,
      reason: 'Màn hình hiện tại chưa khớp tên account, không lưu thumbnail để tránh gắn sai ảnh.',
      screenTextSample: screen.text.slice(0, 300),
    };
  }

  return {
    captured: true,
    ...(await captureAndroidScreenshot(device, outputName)),
  };
}

export async function captureAndroidScreenshot(device: Device, outputName: string) {
  if (device.type !== DeviceType.ANDROID_DEVICE) {
    throw new Error('Chỉ Android ADB device mới hỗ trợ chụp screenshot');
  }

  const adbId = getAdbId(device);
  const { stdout } = await runAdbBuffer(['-s', adbId, 'exec-out', 'screencap', '-p']);

  if (!stdout.length) {
    throw new Error('ADB không trả về dữ liệu screenshot');
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngStart = stdout.indexOf(pngSignature);

  if (pngStart < 0) {
    throw new Error('ADB screenshot không có dữ liệu PNG hợp lệ');
  }

  const pngBuffer = stdout.subarray(pngStart);

  const safeOutputName = outputName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'account-thumbnails');
  const fileName = `${safeOutputName}.png`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), pngBuffer);

  return {
    adbId,
    avatarUrl: `/uploads/account-thumbnails/${fileName}`,
    fileName,
    bytes: pngBuffer.length,
    strippedBytes: pngStart,
  };
}

function getMostLoginProfileId(device: Device) {
  if (!device.externalId) throw new Error('Device chưa có MostLogin profile externalId');

  return device.externalId;
}

function getAdbId(device: Device) {
  if (!device.adbId) throw new Error('Device chưa có ADB ID');

  return device.adbId;
}

export async function healthCheckDevice(device: Device): Promise<DeviceActionResult> {
  if (device.type === DeviceType.ANTIDETECT_PROFILE && device.provider === DeviceProvider.MOSTLOGIN) {
    const config = await getMostLoginConfig();

    if (!config.apiKey) {
      return {
        status: 'CONFIG_MISSING',
        message: 'MOSTLOGIN_API_KEY chưa được cấu hình',
      };
    }

    const profileId = getMostLoginProfileId(device);
    const profile = await getMostLoginProfile(profileId);

    return {
      status: 'OK',
      message: 'MostLogin Local API OK và profile còn tồn tại',
      metadata: {
        baseUrl: config.baseUrl,
        profileId,
        profileName: profile.normalized.profileName,
        profile: safeMostLoginProfileMetadata(profile.detail),
      },
    };
  }

  if (device.type === DeviceType.ANDROID_DEVICE) {
    const adbId = getAdbId(device);
    const { stdout } = await runAdb(['devices', '-l']);
    const online = stdout
      .split('\n')
      .some((line) => line.startsWith(adbId) && /\sdevice(\s|$)/.test(line));

    return {
      status: online ? 'OK' : 'OFFLINE',
      message: online ? 'ADB device online' : 'Không thấy ADB device online',
      metadata: { adbId, output: stdout.trim() },
    };
  }

  return {
    status: 'UNSUPPORTED',
    message: 'Provider chưa có adapter health-check',
  };
}

export async function openDevice(device: Device): Promise<DeviceActionResult> {
  if (device.type === DeviceType.ANTIDETECT_PROFILE && device.provider === DeviceProvider.MOSTLOGIN) {
    const profileId = getMostLoginProfileId(device);
    const config = await getMostLoginConfig();
    const metadata = await callMostLogin(config.openProfilePath, {
      profileId,
      ignoreStartUrls: false,
      urls: [],
    }, 'POST', config);

    return {
      status: 'OK',
      message: 'Đã gửi lệnh mở MostLogin profile',
      metadata,
    };
  }

  if (device.type === DeviceType.ANDROID_DEVICE) {
    const adbId = getAdbId(device);
    await runAdb(['-s', adbId, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);

    return {
      status: 'OK',
      message: 'Đã gửi lệnh wake Android device qua ADB',
      metadata: { adbId },
    };
  }

  throw new Error('Provider chưa hỗ trợ open');
}

export async function closeDevice(device: Device): Promise<DeviceActionResult> {
  if (device.type === DeviceType.ANTIDETECT_PROFILE && device.provider === DeviceProvider.MOSTLOGIN) {
    const profileId = getMostLoginProfileId(device);
    const config = await getMostLoginConfig();
    const metadata = await callMostLogin(config.closeProfilePath, {
      profileIds: [profileId],
    }, 'POST', config);

    return {
      status: 'OK',
      message: 'Đã gửi lệnh đóng MostLogin profile',
      metadata,
    };
  }

  if (device.type === DeviceType.ANDROID_DEVICE) {
    const adbId = getAdbId(device);
    await runAdb(['-s', adbId, 'shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);

    return {
      status: 'OK',
      message: 'Đã gửi lệnh sleep Android device qua ADB',
      metadata: { adbId },
    };
  }

  throw new Error('Provider chưa hỗ trợ close');
}

export function deviceStatusFromHealth(healthStatus: string) {
  if (healthStatus === 'OK') return DeviceStatus.ACTIVE;
  if (healthStatus === 'OFFLINE') return DeviceStatus.DISCONNECTED;
  if (['CONFIG_MISSING', 'UNSUPPORTED'].includes(healthStatus)) return DeviceStatus.INACTIVE;

  return DeviceStatus.ERROR;
}
