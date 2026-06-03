import { NextResponse } from 'next/server';
import { AccountDeviceVerificationStatus } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceRow } from 'src/lib/api-formatters';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    accountId: string;
    mappingId: string;
  };
};

const VerifyManualSchema = z.object({
  detectedAccountName: z.string().min(1),
  detectedAccountUrl: z.string().optional().nullable(),
  detectedAccountId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

function formatAccountDevice(mapping: any) {
  return formatDeviceRow({
    ...mapping.device,
    accountMapping: mapping,
    accounts: [
      {
        ...mapping,
        socialAccount: mapping.socialAccount,
      },
    ],
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = VerifyManualSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu xác minh login không hợp lệ' }, { status: 400 });
  }

  const mapping = await prisma.socialAccountDevice.findFirst({
    where: { id: params.mappingId, socialAccountId: params.accountId },
  });

  if (!mapping) return NextResponse.json({ message: 'Không tìm thấy device mapping' }, { status: 404 });

  const updated = await prisma.socialAccountDevice.update({
    where: { id: mapping.id },
    data: {
      verificationStatus: AccountDeviceVerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      detectedAccountName: parsed.data.detectedAccountName,
      detectedAccountUrl: parsed.data.detectedAccountUrl || null,
      detectedAccountId: parsed.data.detectedAccountId || null,
      lastVerificationError: null,
      verificationMetadata: {
        method: 'manual',
        note: parsed.data.note || null,
      },
    },
    include: {
      device: true,
      socialAccount: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'accountDevice.verifyManual',
      entity: 'SocialAccountDevice',
      entityId: updated.id,
      metadata: {
        socialAccountId: updated.socialAccountId,
        deviceId: updated.deviceId,
        detectedAccountName: updated.detectedAccountName,
        detectedAccountUrl: updated.detectedAccountUrl,
      },
    },
  });

  return NextResponse.json({ data: formatAccountDevice(updated) });
}
