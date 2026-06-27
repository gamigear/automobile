import { DeviceRole, type SocialAccountDevice } from '@prisma/client';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------
// Chọn mapping account↔device DUY NHẤT & XÁC ĐỊNH cho việc đăng bài.
// Lý do: @@unique([socialAccountId, deviceId, role]) cho phép nhiều dòng VERIFIED
// trên cùng (account, device) khác role. findFirst() KHÔNG orderBy bốc ngẫu nhiên
// -> sai packageName/androidUserId -> đăng nhầm account. Ở đây sắp xếp tất định.

// Role nào ưu tiên đăng trước: PUBLISHING là role dành riêng cho đăng, rồi tới PRIMARY.
export const PUBLISH_ROLE_PRIORITY: DeviceRole[] = [
  DeviceRole.PUBLISHING,
  DeviceRole.PRIMARY,
  DeviceRole.BACKUP,
  DeviceRole.RECOVERY,
  DeviceRole.SYNC_ONLY,
];

function roleIndex(role: DeviceRole): number {
  const idx = PUBLISH_ROLE_PRIORITY.indexOf(role);

  return idx === -1 ? PUBLISH_ROLE_PRIORITY.length : idx;
}

function hasPackageName(mapping: SocialAccountDevice): boolean {
  const meta = (mapping.verificationMetadata as any) || {};

  return Boolean(meta.packageName);
}

// So sánh tất định: role priority -> isPrimary -> có packageName -> verifiedAt mới hơn -> id.
function comparePublishMapping(a: SocialAccountDevice, b: SocialAccountDevice): number {
  const byRole = roleIndex(a.role) - roleIndex(b.role);
  if (byRole !== 0) return byRole;

  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;

  const aPkg = hasPackageName(a);
  const bPkg = hasPackageName(b);
  if (aPkg !== bPkg) return aPkg ? -1 : 1;

  const aVerified = a.verifiedAt?.getTime() ?? 0;
  const bVerified = b.verifiedAt?.getTime() ?? 0;
  if (aVerified !== bVerified) return bVerified - aVerified; // mới hơn trước

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Trả về mapping VERIFIED tốt nhất (tất định) cho (account, device), hoặc null nếu không có.
export async function resolvePublishMapping(
  socialAccountId: string,
  deviceId: string
): Promise<SocialAccountDevice | null> {
  const mappings = await prisma.socialAccountDevice.findMany({
    where: { socialAccountId, deviceId, verificationStatus: 'VERIFIED' },
  });

  if (mappings.length === 0) return null;

  return mappings.sort(comparePublishMapping)[0];
}
