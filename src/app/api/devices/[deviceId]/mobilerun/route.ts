import { NextResponse } from 'next/server';
import { Platform } from '@prisma/client';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
// server
import {
  buildVerifyLoginGoal,
  captureScreenshotWithMobileRun,
  openSocialAppWithMobileRun,
  pingMobileRunDevice,
  readUiWithMobileRun,
  runMobileRunTask,
} from 'src/server/mobilerun-adapter';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    deviceId: string;
  };
};

const MobileRunActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ping') }),
  z.object({ action: z.literal('screenshot') }),
  z.object({ action: z.literal('ui') }),
  z.object({ action: z.literal('openApp'), platform: z.nativeEnum(Platform) }),
  z.object({
    action: z.literal('verifyLogin'),
    platform: z.nativeEnum(Platform),
    expectedHandle: z.string().min(1),
    steps: z.number().int().min(1).max(60).optional(),
    reasoning: z.boolean().optional(),
    vision: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('runTask'),
    goal: z.string().min(8).max(4000),
    steps: z.number().int().min(1).max(60).optional(),
    reasoning: z.boolean().optional(),
    vision: z.boolean().optional(),
    visionOnly: z.boolean().optional(),
    debug: z.boolean().optional(),
  }),
]);

function jobTypeForAction(action: string) {
  return `device.mobilerun.${action}`;
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa được cấu hình' }, { status: 500 });

  const parsed = MobileRunActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu MobileRun action không hợp lệ' }, { status: 400 });
  }

  const device = await prisma.device.findUnique({ where: { id: params.deviceId } });

  if (!device) return NextResponse.json({ message: 'Không tìm thấy device' }, { status: 404 });
  if (device.locked && parsed.data.action !== 'ping') {
    return NextResponse.json({ message: 'Device đang bị khóa, không thể chạy MobileRun action' }, { status: 400 });
  }

  const startedAt = new Date();
  const result = await (async () => {
    if (parsed.data.action === 'ping') return pingMobileRunDevice(device);
    if (parsed.data.action === 'screenshot') return captureScreenshotWithMobileRun(device);
    if (parsed.data.action === 'ui') return readUiWithMobileRun(device);
    if (parsed.data.action === 'openApp') return openSocialAppWithMobileRun(device, parsed.data.platform);
    if (parsed.data.action === 'verifyLogin') {
      return runMobileRunTask({
        device,
        goal: buildVerifyLoginGoal(parsed.data.platform, parsed.data.expectedHandle),
        steps: parsed.data.steps || 20,
        reasoning: parsed.data.reasoning ?? true,
        vision: parsed.data.vision ?? true,
      });
    }

    return runMobileRunTask({
      device,
      goal: parsed.data.goal,
      steps: parsed.data.steps,
      reasoning: parsed.data.reasoning,
      vision: parsed.data.vision,
      visionOnly: parsed.data.visionOnly,
      debug: parsed.data.debug,
    });
  })();

  const finishedAt = new Date();
  const status = result.status === 'OK' ? 'completed' : 'failed';
  const metadata = JSON.parse(JSON.stringify(result.metadata || {}));

  await prisma.$transaction(async (tx) => {
    await tx.jobLog.create({
      data: {
        type: jobTypeForAction(parsed.data.action),
        status,
        deviceId: device.id,
        payload: JSON.parse(JSON.stringify(parsed.data)),
        attempts: 1,
        errorMessage: result.status === 'OK' ? null : result.message,
        startedAt,
        finishedAt,
      },
    });

    await tx.deviceHealthLog.create({
      data: {
        deviceId: device.id,
        status: result.status,
        message: result.message,
        metadata,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.user?.sub === 'admin' ? null : auth.user?.sub,
        action: jobTypeForAction(parsed.data.action),
        entity: 'Device',
        entityId: device.id,
        metadata: {
          status: result.status,
          message: result.message,
          action: parsed.data.action,
        },
      },
    });
  });

  return NextResponse.json({ data: { deviceId: device.id }, result });
}
