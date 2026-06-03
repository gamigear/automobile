import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { AccountDeviceVerificationStatus, Platform } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { formatDeviceAccountRow } from 'src/lib/api-formatters';
// server
import { openDevice } from 'src/server/device-adapters';
import { createNotification } from 'src/server/notifications';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

type DirectVerifyResult = {
  status: 'VERIFIED' | 'LOGIN_REQUIRED' | 'ERROR';
  platform: Platform;
  detectedAccountName?: string;
  detectedAccountUrl?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type Params = {
  params: {
    deviceId: string;
  };
};

const VerifyLoginSchema = z.object({
  mappingId: z.string().min(1),
  platform: z.nativeEnum(Platform).optional(),
});

function verificationStatusFromResult(status: DirectVerifyResult['status']) {
  if (status === 'VERIFIED') return AccountDeviceVerificationStatus.VERIFIED;
  if (status === 'LOGIN_REQUIRED') return AccountDeviceVerificationStatus.LOGIN_REQUIRED;

  return AccountDeviceVerificationStatus.ERROR;
}

async function verifyThroughBrowserProfile(cdpUrl: string, platform: Platform): Promise<DirectVerifyResult> {
  const runnerPath = path.join(process.cwd(), 'src/server/verify-social-login-runner.ts');
  const tsxPath = path.join(process.cwd(), 'node_modules/.bin/tsx');
  let stdout = '';

  try {
    const { stdout: runnerStdout } = await execFileAsync(tsxPath, [runnerPath, `--cdpUrl=${cdpUrl}`, `--platform=${platform}`], {
      timeout: 70000,
      maxBuffer: 1024 * 1024,
    });

    stdout = runnerStdout;
  } catch (error: any) {
    stdout = String(error?.stdout || '');

    if (!stdout) throw error;
  }

  return JSON.parse(stdout) as DirectVerifyResult;
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = VerifyLoginSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu verify login không hợp lệ' }, { status: 400 });
  }

  const mapping = await prisma.socialAccountDevice.findFirst({
    where: { id: parsed.data.mappingId, deviceId: params.deviceId },
    include: { device: true, socialAccount: true },
  });

  if (!mapping) return NextResponse.json({ message: 'Không tìm thấy Social Account trong profile' }, { status: 404 });
  if (mapping.device.locked) return NextResponse.json({ message: 'Device đang bị khóa, không thể verify trực tiếp' }, { status: 400 });

  const platform = parsed.data.platform || mapping.socialAccount.platform;
  const openResult = await openDevice(mapping.device);
  const cdpUrl = String((openResult.metadata as any)?.http || '');

  if (!cdpUrl) {
    return NextResponse.json(
      {
        message: 'MostLogin không trả về CDP endpoint để verify trực tiếp',
        metadata: openResult.metadata || {},
      },
      { status: 400 }
    );
  }

  const result = await verifyThroughBrowserProfile(cdpUrl, platform);
  const status = verificationStatusFromResult(result.status);
  const updated = await prisma.socialAccountDevice.update({
    where: { id: mapping.id },
    data: {
      verificationStatus: status,
      verifiedAt: result.status === 'VERIFIED' ? new Date() : null,
      detectedAccountName: result.detectedAccountName || null,
      detectedAccountUrl: result.detectedAccountUrl || null,
      lastVerificationError: result.status === 'VERIFIED' ? null : result.message,
      verificationMetadata: {
        method: 'browser_cdp',
        platform,
        verifiedFromProfile: true,
        ...(result.metadata || {}),
      },
    },
    include: { socialAccount: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
      action: 'accountDevice.verifyDirect',
      entity: 'SocialAccountDevice',
      entityId: updated.id,
      metadata: {
        socialAccountId: updated.socialAccountId,
        deviceId: params.deviceId,
        status,
        detectedAccountName: updated.detectedAccountName,
        detectedAccountUrl: updated.detectedAccountUrl,
        message: result.message,
      },
    },
  });

  await createNotification({
    title: status === AccountDeviceVerificationStatus.VERIFIED ? 'Đã verify Social Account trong profile' : 'Verify Social Account chưa thành công',
    message:
      status === AccountDeviceVerificationStatus.VERIFIED
        ? `${updated.detectedAccountName || updated.socialAccount.name} trong profile đã được xác minh trực tiếp.`
        : result.message,
    category: 'Xác minh',
    type: 'verify.socialLogin',
    severity: status === AccountDeviceVerificationStatus.VERIFIED ? 'success' : 'warning',
    entity: 'SocialAccountDevice',
    entityId: updated.id,
    href: `/dashboard/devices/${params.deviceId}`,
    metadata: {
      socialAccountId: updated.socialAccountId,
      deviceId: params.deviceId,
      status,
      detectedAccountUrl: updated.detectedAccountUrl,
    },
  });

  return NextResponse.json({ data: formatDeviceAccountRow(updated), result });
}
