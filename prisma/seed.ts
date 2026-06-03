import bcrypt from 'bcryptjs';
import {
  AccountMemberRole,
  DeviceProvider,
  DeviceRole,
  DeviceStatus,
  DeviceType,
  Platform,
  PostStatus,
  PrismaClient,
  SocialAccountType,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@gami.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      role: UserRole.ADMIN,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'approvalRequiredByDefault' },
    update: { value: true },
    create: { key: 'approvalRequiredByDefault', value: true },
  });

  await prisma.appSetting.upsert({
    where: { key: 'timezone' },
    update: { value: 'Asia/Ho_Chi_Minh' },
    create: { key: 'timezone', value: 'Asia/Ho_Chi_Minh' },
  });

  const facebook = await prisma.socialAccount.upsert({
    where: { platform_externalId: { platform: Platform.FACEBOOK, externalId: 'gami-studio-page' } },
    update: {
      type: SocialAccountType.FANPAGE,
      defaultScheduleSlots: ['09:00', '12:00', '20:00'],
    },
    create: {
      name: 'Gami Studio',
      platform: Platform.FACEBOOK,
      type: SocialAccountType.FANPAGE,
      externalId: 'gami-studio-page',
      approvalRequired: true,
      defaultScheduleSlots: ['09:00', '12:00', '20:00'],
    },
  });

  const instagram = await prisma.socialAccount.upsert({
    where: { platform_externalId: { platform: Platform.INSTAGRAM, externalId: 'gami-ig-business' } },
    update: {
      type: SocialAccountType.INSTAGRAM_BUSINESS,
      defaultScheduleSlots: ['09:00', '20:00'],
    },
    create: {
      name: 'Gami IG',
      platform: Platform.INSTAGRAM,
      type: SocialAccountType.INSTAGRAM_BUSINESS,
      externalId: 'gami-ig-business',
      approvalRequired: true,
      defaultScheduleSlots: ['09:00', '20:00'],
    },
  });

  const mostLoginDevice = await prisma.device.upsert({
    where: {
      provider_externalId: {
        provider: DeviceProvider.MOSTLOGIN,
        externalId: 'mostlogin-profile-gami-studio',
      },
    },
    update: {},
    create: {
      name: 'MostLogin - Gami Studio',
      type: DeviceType.ANTIDETECT_PROFILE,
      provider: DeviceProvider.MOSTLOGIN,
      externalId: 'mostlogin-profile-gami-studio',
      profileName: 'Gami Studio Main',
      status: DeviceStatus.ACTIVE,
      healthStatus: 'OK',
      locked: false,
      notes: 'MostLogin profile chính',
      proxyInfo: {
        mode: 'profile_proxy',
        status: 'active',
      },
    },
  });

  const androidDevice = await prisma.device.upsert({
    where: {
      provider_adbId: {
        provider: DeviceProvider.ADB,
        adbId: 'emulator-5554',
      },
    },
    update: {},
    create: {
      name: 'Android Emulator - Gami Backup',
      type: DeviceType.ANDROID_DEVICE,
      provider: DeviceProvider.ADB,
      externalId: 'adb-emulator-5554',
      adbId: 'emulator-5554',
      deviceModel: 'Pixel Emulator',
      androidVersion: '14',
      status: DeviceStatus.INACTIVE,
      healthStatus: 'UNKNOWN',
      locked: false,
      notes: 'Android backup device',
    },
  });

  await prisma.socialAccountDevice.upsert({
    where: {
      socialAccountId_deviceId_role: {
        socialAccountId: facebook.id,
        deviceId: mostLoginDevice.id,
        role: DeviceRole.PRIMARY,
      },
    },
    update: { isPrimary: true },
    create: {
      socialAccountId: facebook.id,
      deviceId: mostLoginDevice.id,
      role: DeviceRole.PRIMARY,
      isPrimary: true,
    },
  });

  await prisma.socialAccountDevice.upsert({
    where: {
      socialAccountId_deviceId_role: {
        socialAccountId: facebook.id,
        deviceId: androidDevice.id,
        role: DeviceRole.BACKUP,
      },
    },
    update: {},
    create: {
      socialAccountId: facebook.id,
      deviceId: androidDevice.id,
      role: DeviceRole.BACKUP,
      isPrimary: false,
    },
  });

  await prisma.socialAccountMember.upsert({
    where: {
      socialAccountId_userId: {
        socialAccountId: facebook.id,
        userId: admin.id,
      },
    },
    update: { role: AccountMemberRole.OWNER },
    create: {
      socialAccountId: facebook.id,
      userId: admin.id,
      role: AccountMemberRole.OWNER,
    },
  });

  await prisma.contentSource.upsert({
    where: { provider_externalId: { provider: 'google_drive', externalId: 'drive-campaigns-june' } },
    update: { socialAccountId: facebook.id, lastSyncAt: new Date('2026-06-01T01:00:00.000Z') },
    create: {
      name: 'Google Drive - Campaigns',
      provider: 'google_drive',
      externalId: 'drive-campaigns-june',
      socialAccountId: facebook.id,
      lastSyncAt: new Date('2026-06-01T01:00:00.000Z'),
    },
  });

  await prisma.contentSource.upsert({
    where: { provider_externalId: { provider: 'google_drive', externalId: 'drive-reels' } },
    update: { socialAccountId: instagram.id, lastSyncAt: new Date('2026-05-31T14:00:00.000Z') },
    create: {
      name: 'Google Drive - Reels',
      provider: 'google_drive',
      externalId: 'drive-reels',
      socialAccountId: instagram.id,
      lastSyncAt: new Date('2026-05-31T14:00:00.000Z'),
    },
  });

  const cover = await prisma.mediaAsset.upsert({
    where: { provider_externalId: { provider: 'google_drive', externalId: 'drive-file-launch-cover' } },
    update: {},
    create: {
      name: 'launch-cover.jpg',
      mimeType: 'image/jpeg',
      provider: 'google_drive',
      externalId: 'drive-file-launch-cover',
      folderName: 'Drive / Campaigns / June',
      category: 'Campaign',
      socialAccountId: facebook.id,
    },
  });

  const reel = await prisma.mediaAsset.upsert({
    where: { provider_externalId: { provider: 'google_drive', externalId: 'drive-file-bts-reel' } },
    update: {},
    create: {
      name: 'behind-the-scenes.mp4',
      mimeType: 'video/mp4',
      provider: 'google_drive',
      externalId: 'drive-file-bts-reel',
      folderName: 'Drive / Reels',
      category: 'Short video',
      socialAccountId: instagram.id,
    },
  });

  const launchPost = await prisma.post.upsert({
    where: { id: 'post_001' },
    update: { socialAccountId: facebook.id },
    create: {
      id: 'post_001',
      socialAccountId: facebook.id,
      title: 'Ra mắt bộ sưu tập tháng 6',
      caption: 'Bộ sưu tập tháng 6 đã sẵn sàng. Theo dõi Gami để xem các nội dung mới nhất.',
      status: PostStatus.WAITING_APPROVAL,
      scheduledAt: new Date('2026-06-01T02:00:00.000Z'),
      createdById: admin.id,
    },
  });

  const reelPost = await prisma.post.upsert({
    where: { id: 'post_002' },
    update: { socialAccountId: instagram.id },
    create: {
      id: 'post_002',
      socialAccountId: instagram.id,
      title: 'Video hậu trường sản xuất',
      caption: 'Một góc hậu trường từ đội sản xuất Gami.',
      status: PostStatus.SCHEDULED,
      scheduledAt: new Date('2026-06-01T13:00:00.000Z'),
      createdById: admin.id,
    },
  });

  await prisma.postMedia.upsert({
    where: { postId_mediaAssetId: { postId: launchPost.id, mediaAssetId: cover.id } },
    update: {},
    create: { postId: launchPost.id, mediaAssetId: cover.id },
  });

  await prisma.postMedia.upsert({
    where: { postId_mediaAssetId: { postId: reelPost.id, mediaAssetId: reel.id } },
    update: {},
    create: { postId: reelPost.id, mediaAssetId: reel.id },
  });

  await prisma.postTarget.upsert({
    where: { id: 'target_001' },
    update: {},
    create: {
      id: 'target_001',
      postId: launchPost.id,
      socialAccountId: facebook.id,
      status: PostStatus.WAITING_APPROVAL,
    },
  });

  await prisma.postTarget.upsert({
    where: { id: 'target_002' },
    update: {},
    create: {
      id: 'target_002',
      postId: reelPost.id,
      socialAccountId: instagram.id,
      status: PostStatus.SCHEDULED,
    },
  });

  await prisma.jobLog.upsert({
    where: { id: 'job_001' },
    update: { socialAccountId: facebook.id, deviceId: mostLoginDevice.id },
    create: {
      id: 'job_001',
      type: 'drive.syncFolder',
      status: 'completed',
      socialAccountId: facebook.id,
      deviceId: mostLoginDevice.id,
      attempts: 1,
      finishedAt: new Date('2026-06-01T01:01:00.000Z'),
    },
  });

  await prisma.jobLog.upsert({
    where: { id: 'job_002' },
    update: { socialAccountId: facebook.id, deviceId: mostLoginDevice.id },
    create: {
      id: 'job_002',
      type: 'post.publishTarget',
      status: 'failed',
      socialAccountId: facebook.id,
      deviceId: mostLoginDevice.id,
      attempts: 3,
      errorMessage: 'Meta API rejected media format',
      finishedAt: new Date('2026-06-01T05:00:00.000Z'),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
