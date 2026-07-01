import { NextResponse } from 'next/server';
import { z } from 'zod';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { encryptSecretToString } from 'src/server/secret-crypto';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

type Params = { params: { botId: string } };

const UpdateSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  botToken: z.string().min(10).optional(), // rỗng -> giữ token cũ
  binding: z.enum(['ACCOUNT', 'DEVICE']).optional(),
  socialAccountId: z.string().nullable().optional(),
  deviceId: z.string().nullable().optional(),
  allowedChatIds: z.string().optional(),
  tzOffset: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  const d = parsed.data;

  const data: any = {};
  if (d.label !== undefined) data.label = d.label;
  if (d.botToken) data.botToken = encryptSecretToString(d.botToken); // rỗng -> giữ nguyên
  if (d.binding !== undefined) data.binding = d.binding;
  if (d.socialAccountId !== undefined) data.socialAccountId = d.socialAccountId;
  if (d.deviceId !== undefined) data.deviceId = d.deviceId;
  if (d.allowedChatIds !== undefined) data.allowedChatIds = d.allowedChatIds;
  if (d.tzOffset !== undefined) data.tzOffset = d.tzOffset;
  if (d.enabled !== undefined) data.enabled = d.enabled;

  // Đồng bộ: nếu đổi binding, dọn field không dùng.
  if (d.binding === 'ACCOUNT') data.deviceId = null;
  if (d.binding === 'DEVICE') data.socialAccountId = null;

  const bot = await prisma.telegramBot.update({ where: { id: params.botId }, data });

  return NextResponse.json({ data: { id: bot.id } });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  await prisma.telegramBot.delete({ where: { id: params.botId } });

  return NextResponse.json({ data: { id: params.botId } });
}
