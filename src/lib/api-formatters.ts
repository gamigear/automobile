import { format } from 'date-fns';
import { DeviceProvider, DeviceStatus, DeviceType, Platform, PostStatus } from '@prisma/client';
// data
import { statusLabels } from 'src/sections/social-admin/mock';

const formatDateTime = (value?: Date | null) => (value ? format(value, 'yyyy-MM-dd HH:mm') : '');

function sanitizeMetadata(value: any) {
  if (!value || typeof value !== 'object') return value || null;

  const rest = { ...value };

  delete rest.rawProfile;
  delete rest.cookie;
  delete rest.cookies;

  if (rest.profile && typeof rest.profile === 'object') {
    const profile = { ...rest.profile };

    delete profile.cookie;
    delete profile.cookies;
    delete profile.rawProfile;

    return { ...rest, profile };
  }

  return rest;
}

function proxySummary(proxyInfo: any) {
  if (!proxyInfo || typeof proxyInfo !== 'object') return '';

  const protocol = proxyInfo.protocol || proxyInfo.type || '';
  const host = proxyInfo.host || proxyInfo.ip || proxyInfo.lastIp || '';
  const country = proxyInfo.country || proxyInfo.lastCountry || '';

  return [protocol, host, country].filter(Boolean).join(' · ');
}

function detectedSocialPlatform(mapping: any) {
  const url = String(mapping.detectedAccountUrl || '').toLowerCase();

  if (url.includes('facebook.com') || url.includes('fb.com')) return 'FACEBOOK';
  if (url.includes('instagram.com')) return 'INSTAGRAM';

  return mapping.socialAccount.platform;
}

function deviceOnlineStatus(device: any) {
  if (device.locked) return 'LOCKED';
  if (device.healthStatus === 'OK') return 'ONLINE';
  if (device.healthStatus === 'OFFLINE' || device.status === DeviceStatus.DISCONNECTED) return 'OFFLINE';
  if (device.status === DeviceStatus.INACTIVE) return 'INACTIVE';

  return 'UNKNOWN';
}

export const platformLabel = (platform: Platform) =>
  platform === Platform.FACEBOOK ? 'Facebook' : 'Instagram';

export const postStatusLabel = (status: PostStatus) => statusLabels[status] || status;

export function formatPostRow(post: any) {
  const targetAccounts = post.targets?.map((target: any) => target.socialAccount).filter(Boolean) || [];
  const primaryAccount = post.socialAccount || targetAccounts[0];
  const media = post.media?.map((item: any) => item.mediaAsset).filter(Boolean) || [];

  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    socialAccountId: primaryAccount?.id || '',
    platform:
      targetAccounts.map((account: any) => platformLabel(account.platform)).join(', ') ||
      (primaryAccount ? platformLabel(primaryAccount.platform) : 'Chưa chọn'),
    accounts:
      targetAccounts.map((account: any) => account.name).join(', ') ||
      primaryAccount?.name ||
      'Chưa chọn',
    owner: post.createdBy?.name || '',
    scheduledAt: formatDateTime(post.scheduledAt),
    status: post.status,
    media: media.map(formatMediaRow),
    mediaCount: media.length,
  };
}

export function formatMediaRow(asset: any) {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.mimeType?.startsWith('video/') ? 'Video' : 'Image',
    folder: asset.folderName || '',
    category: asset.category || '',
    account: asset.socialAccount?.name || '',
    updatedAt: formatDateTime(asset.updatedAt),
  };
}

export function formatAccountRow(account: any) {
  const primaryDevice = account.devices?.find((mapping: any) => mapping.isPrimary);

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    platformCode: account.platform,
    platform: account.platform === Platform.FACEBOOK ? 'Facebook Page' : 'Instagram Business',
    primaryDevice: primaryDevice?.device?.name || '',
    deviceHealth: primaryDevice?.device?.healthStatus || '',
    deviceOnlineStatus: primaryDevice?.device ? deviceOnlineStatus(primaryDevice.device) : 'UNKNOWN',
    status: account.active ? 'Đã kết nối' : 'Cần kết nối lại',
    tokenStatus: account.tokenExpiresAt && account.tokenExpiresAt < new Date() ? 'Hết hạn' : 'Hợp lệ',
    approvalRequired: account.approvalRequired ? 'Bật' : 'Tắt',
  };
}

export function formatDeviceRow(device: any) {
  const typeLabels = {
    [DeviceType.ANTIDETECT_PROFILE]: 'Antidetect Profile',
    [DeviceType.ANDROID_DEVICE]: 'Android ADB',
  };
  const providerLabels = {
    [DeviceProvider.MOSTLOGIN]: 'MostLogin',
    [DeviceProvider.DONUT]: 'Donut',
    [DeviceProvider.NSTBROWSER]: 'Nstbrowser',
    [DeviceProvider.ADB]: 'ADB',
    [DeviceProvider.MANUAL]: 'Manual',
  };

  const verifiedMappings =
    device.accounts?.filter((accountMapping: any) => accountMapping.verificationStatus === 'VERIFIED') || [];
  const mapping =
    device.accountMapping?.verificationStatus === 'VERIFIED' ? device.accountMapping : verifiedMappings[0];

  return {
    id: device.id,
    name: device.name,
    typeCode: device.type,
    type: typeLabels[device.type as DeviceType] || device.type,
    providerCode: device.provider,
    provider: providerLabels[device.provider as DeviceProvider] || device.provider,
    externalId: device.externalId || device.adbId || '',
    profileName: device.profileName || '',
    proxyInfo: device.proxyInfo || null,
    proxySummary: proxySummary(device.proxyInfo),
    status: device.status,
    healthStatus: device.healthStatus,
    onlineStatus: deviceOnlineStatus(device),
    canManageContent: !device.locked,
    canRunLiveAction: !device.locked && device.healthStatus === 'OK' && device.status !== DeviceStatus.INACTIVE,
    locked: Boolean(device.locked),
    lockedAt: formatDateTime(device.lockedAt),
    lockedReason: device.lockedReason || '',
    notes: device.notes || '',
    controlStatus: device.locked ? 'LOCKED' : device.status,
    accounts:
      verifiedMappings
        .map((accountMapping: any) => accountMapping.detectedAccountName || accountMapping.socialAccount.name)
        .join(', ') || '',
    verifiedSocialAccounts: verifiedMappings.map((accountMapping: any) => ({
      id: accountMapping.socialAccount.id,
      name: accountMapping.detectedAccountName || accountMapping.socialAccount.name,
      platform: detectedSocialPlatform(accountMapping),
      expectedPlatform: accountMapping.socialAccount.platform,
      type: accountMapping.socialAccount.type,
      verificationStatus: accountMapping.verificationStatus,
    })),
    accountsCount: verifiedMappings.length,
    primaryAccountsCount: verifiedMappings.filter((accountMapping: any) => accountMapping.isPrimary).length,
    mappingId: mapping?.id || '',
    role: mapping?.role || '',
    isPrimary: Boolean(mapping?.isPrimary),
    verificationStatus: mapping?.verificationStatus || 'UNVERIFIED',
    verifiedAt: formatDateTime(mapping?.verifiedAt),
    detectedAccountName: mapping?.detectedAccountName || '',
    detectedAccountUrl: mapping?.detectedAccountUrl || '',
    lastSeenAt: formatDateTime(device.lastSeenAt),
  };
}

export function formatDeviceDetail(device: any) {
  const row = formatDeviceRow(device);

  return {
    ...row,
    adbId: device.adbId || '',
    deviceModel: device.deviceModel || '',
    androidVersion: device.androidVersion || '',
    metadata: sanitizeMetadata(device.metadata),
    locked: Boolean(device.locked),
    lockedAt: formatDateTime(device.lockedAt),
    lockedReason: device.lockedReason || '',
    notes: device.notes || '',
    createdAt: formatDateTime(device.createdAt),
    updatedAt: formatDateTime(device.updatedAt),
  };
}

export function formatDeviceAccountRow(mapping: any, counts?: any) {
  const account = mapping.socialAccount;
  const tokenExpired = account.tokenExpiresAt && account.tokenExpiresAt < new Date();

  return {
    id: mapping.id,
    mappingId: mapping.id,
    accountId: account.id,
    accountName: account.name,
    avatarUrl: account.avatarUrl || '',
    profileUrl: account.profileUrl || mapping.detectedAccountUrl || '',
    platformCode: account.platform,
    platform: account.platform === Platform.FACEBOOK ? 'Facebook' : 'Instagram',
    type: account.type,
    role: mapping.role,
    isPrimary: mapping.isPrimary,
    accountStatus: account.active ? 'Đã kết nối' : 'Cần kết nối lại',
    tokenStatus: tokenExpired ? 'Hết hạn' : 'Hợp lệ',
    approvalRequired: account.approvalRequired,
    verificationStatus: mapping.verificationStatus || 'UNVERIFIED',
    verifiedAt: formatDateTime(mapping.verifiedAt),
    detectedAccountName: mapping.detectedAccountName || '',
    detectedAccountUrl: mapping.detectedAccountUrl || '',
    detectedAccountId: mapping.detectedAccountId || '',
    lastVerificationError: mapping.lastVerificationError || '',
    postsCount: counts?.postsCount || 0,
    scheduledPostsCount: counts?.scheduledPostsCount || 0,
    failedPostsCount: counts?.failedPostsCount || 0,
    mediaCount: counts?.mediaCount || 0,
    lastPublishedAt: formatDateTime(counts?.lastPublishedAt),
  };
}

export function formatSourceRow(source: any) {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider === 'google_drive' ? 'Google Drive' : source.provider,
    status: source.active ? 'Đang hoạt động' : 'Tạm dừng',
    lastSync: formatDateTime(source.lastSyncAt),
  };
}

export function formatJobRow(job: any) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    scheduledAt: formatDateTime(job.createdAt),
    error: job.errorMessage || '',
  };
}

export function formatUserRow(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.active ? 'Active' : 'Inactive',
  };
}
