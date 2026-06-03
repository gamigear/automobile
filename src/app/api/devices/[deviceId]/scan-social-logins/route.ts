import { NextResponse } from 'next/server';
import { AccountDeviceVerificationStatus, Platform, SocialAccountType } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import { captureAndroidAccountThumbnailIfCurrentProfile, scanAndroidSocialLogins } from 'src/server/device-adapters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { deviceId: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy Android device' }, { status: 404 });
  if (device.type !== 'ANDROID_DEVICE') return NextResponse.json({ message: 'Chỉ quét login trên Android device' }, { status: 400 });
  if (device.status === 'DISCONNECTED' || device.healthStatus === 'OFFLINE') {
    return NextResponse.json(
      { message: 'Android device đang offline. Vẫn giữ danh sách Social Account đã quét trước đó, nhưng chưa thể quét lại.' },
      { status: 409 }
    );
  }

  const result = await scanAndroidSocialLogins(device);

  const mappedAccounts = await prisma.$transaction(async (tx) => {
    const mappings: Array<{ mappingId: string; socialAccountId: string; accountName: string }> = [];

    await tx.device.update({
      where: { id: device.id },
      data: {
        healthStatus: 'OK',
        lastSeenAt: new Date(),
        metadata: {
          ...((device.metadata as any) || {}),
          lastAndroidSocialScan: result,
        },
      },
    });

    for (const detected of result.detectedAccounts) {
      const platform = detected.platform as Platform;
      const androidUserId = detected.androidUserId || '0';
      const externalId = `android:${device.adbId}:user:${androidUserId}:${detected.type}:${detected.name}`;
      const displayName = detected.isDualApp ? `${detected.name} (Facebook nhân bản)` : detected.name;
      const account = await tx.socialAccount.upsert({
        where: { platform_externalId: { platform, externalId } },
        update: { name: displayName, active: true },
        create: {
          name: displayName,
          platform,
          type: platform === Platform.INSTAGRAM ? SocialAccountType.INSTAGRAM_CREATOR : SocialAccountType.PROFILE,
          externalId,
          active: true,
        },
      });

      const mapping = await tx.socialAccountDevice.upsert({
        where: { socialAccountId_deviceId_role: { socialAccountId: account.id, deviceId: device.id, role: 'PRIMARY' } },
        update: {
          isPrimary: true,
          verificationStatus: AccountDeviceVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          detectedAccountName: displayName,
          verificationMetadata: { method: 'android_adb_account_manager', androidUserId, detected },
        },
        create: {
          socialAccountId: account.id,
          deviceId: device.id,
          role: 'PRIMARY',
          isPrimary: true,
          verificationStatus: AccountDeviceVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          detectedAccountName: displayName,
          verificationMetadata: { method: 'android_adb_account_manager', androidUserId, detected },
        },
      });

      mappings.push({ mappingId: mapping.id, socialAccountId: account.id, accountName: displayName });
    }

    await tx.jobLog.create({
      data: {
        type: 'android.scanSocialLogins',
        status: 'completed',
        deviceId: device.id,
        attempts: 1,
        payload: JSON.parse(JSON.stringify(result)),
        finishedAt: new Date(),
      },
    });

    return mappings;
  });

  const thumbnailResults = await Promise.all(
    mappedAccounts.map(async (mapping) => {
      const thumbnail = await captureAndroidAccountThumbnailIfCurrentProfile(device, mapping.mappingId, mapping.accountName).catch((error) => ({
        captured: false,
        reason: error instanceof Error ? error.message : 'Không thể kiểm tra/chụp thumbnail',
      }));

      if (thumbnail.captured && 'avatarUrl' in thumbnail) {
        await prisma.socialAccount.update({
          where: { id: mapping.socialAccountId },
          data: { avatarUrl: `${thumbnail.avatarUrl}?v=${Date.now()}` },
        });
      }

      return { mappingId: mapping.mappingId, accountName: mapping.accountName, thumbnail };
    })
  );

  return NextResponse.json({ data: { ...result, thumbnailResults } });
}
