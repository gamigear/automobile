import { NextResponse } from 'next/server';
import { z } from 'zod';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { encryptSecretToString } from 'src/server/secret-crypto';

// ----------------------------------------------------------------------
// Quản lý bot Telegram gán theo account/device (CRUD). Token mã hoá, không leak về client.

export const dynamic = 'force-dynamic';

const CreateSchema = z
  .object({
    label: z.string().min(1).max(120),
    botToken: z.string().min(10),
    binding: z.enum(['ACCOUNT', 'DEVICE']),
    socialAccountId: z.string().optional(),
    deviceId: z.string().optional(),
    allowedChatIds: z.string().optional(),
    tzOffset: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => (v.binding === 'ACCOUNT' ? !!v.socialAccountId : !!v.deviceId), {
    message: 'Cần chọn account (ACCOUNT) hoặc device (DEVICE) tương ứng',
  });

function toRow(bot: any) {
  return {
    id: bot.id,
    label: bot.label,
    enabled: bot.enabled,
    binding: bot.binding,
    socialAccountId: bot.socialAccountId,
    accountName: bot.socialAccount?.name || '',
    deviceId: bot.deviceId,
    deviceName: bot.device?.name || '',
    allowedChatIds: bot.allowedChatIds,
    tzOffset: bot.tzOffset,
    tokenConfigured: Boolean(bot.botToken),
    createdAt: bot.createdAt,
  };
}

export async function GET(request: Request) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: [] });

  const bots = await prisma.telegramBot.findMany({
    orderBy: { createdAt: 'asc' },
    include: { socialAccount: { select: { name: true } }, device: { select: { name: true } } },
  });

  return NextResponse.json({ data: bots.map(toRow) });
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' }, { status: 400 });
  }
  const d = parsed.data;

  const bot = await prisma.telegramBot.create({
    data: {
      label: d.label,
      botToken: encryptSecretToString(d.botToken),
      binding: d.binding,
      socialAccountId: d.binding === 'ACCOUNT' ? d.socialAccountId : null,
      deviceId: d.binding === 'DEVICE' ? d.deviceId : null,
      allowedChatIds: d.allowedChatIds ?? '',
      tzOffset: d.tzOffset || '+07:00',
      enabled: d.enabled ?? true,
    },
    include: { socialAccount: { select: { name: true } }, device: { select: { name: true } } },
  });

  return NextResponse.json({ data: toRow(bot) }, { status: 201 });
}
