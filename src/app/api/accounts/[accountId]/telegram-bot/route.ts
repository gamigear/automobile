import { NextResponse } from 'next/server';
import { z } from 'zod';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { encryptSecretToString, decryptSecretFromString } from 'src/server/secret-crypto';
import { getTelegramConfig } from 'src/server/telegram/config';

// ----------------------------------------------------------------------
// Bot Telegram gán cho 1 tài khoản social — nhập/sửa token ngay trong giao diện account.
// Upsert TelegramBot binding=ACCOUNT theo socialAccountId.

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string } };

const PutSchema = z.object({
  label: z.string().max(120).optional(),
  botToken: z.string().optional(), // rỗng -> giữ token cũ
  allowedChatIds: z.string().optional(),
  tzOffset: z.string().optional(),
  enabled: z.boolean().optional(),
});

function toRow(bot: any) {
  return {
    id: bot.id,
    label: bot.label,
    enabled: bot.enabled,
    allowedChatIds: bot.allowedChatIds,
    tzOffset: bot.tzOffset,
    tokenConfigured: Boolean(bot.botToken),
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = requireRole(request, 'EDITOR');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ data: null });

  const bot = await prisma.telegramBot.findFirst({
    where: { binding: 'ACCOUNT', socialAccountId: params.accountId },
  });

  return NextResponse.json({ data: bot ? toRow(bot) : null });
}

export async function PUT(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  const d = parsed.data;

  const account = await prisma.socialAccount.findUnique({ where: { id: params.accountId }, select: { name: true } });
  if (!account) return NextResponse.json({ message: 'Không tìm thấy tài khoản' }, { status: 404 });

  const existing = await prisma.telegramBot.findFirst({
    where: { binding: 'ACCOUNT', socialAccountId: params.accountId },
  });

  // Token bắt buộc khi tạo mới; khi sửa để trống -> giữ token cũ.
  if (!existing && !d.botToken) {
    return NextResponse.json({ message: 'Cần nhập bot token' }, { status: 400 });
  }

  const data: any = {
    label: d.label || existing?.label || `Bot ${account.name}`,
    allowedChatIds: d.allowedChatIds ?? existing?.allowedChatIds ?? '',
    tzOffset: d.tzOffset || existing?.tzOffset || '+07:00',
    enabled: d.enabled ?? existing?.enabled ?? true,
  };
  if (d.botToken) data.botToken = encryptSecretToString(d.botToken);

  const bot = existing
    ? await prisma.telegramBot.update({ where: { id: existing.id }, data })
    : await prisma.telegramBot.create({
        data: { ...data, botToken: data.botToken, binding: 'ACCOUNT', socialAccountId: params.accountId },
      });

  return NextResponse.json({ data: toRow(bot) });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  await prisma.telegramBot.deleteMany({ where: { binding: 'ACCOUNT', socialAccountId: params.accountId } });

  return NextResponse.json({ data: { ok: true } });
}

// Test token của bot account này (getMe).
export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;

  const bot = await prisma.telegramBot.findFirst({
    where: { binding: 'ACCOUNT', socialAccountId: params.accountId },
  });
  if (!bot?.botToken) return NextResponse.json({ data: { ok: false }, message: 'Chưa có token' }, { status: 400 });

  const shared = await getTelegramConfig();
  try {
    const res = await fetch(`${shared.apiBaseUrl}/bot${decryptSecretFromString(bot.botToken)}/getMe`);
    const body = await res.json();
    if (!res.ok || !body.ok) {
      return NextResponse.json({ data: { ok: false }, message: body.description || `HTTP ${res.status}` }, { status: 400 });
    }
    return NextResponse.json({ data: { ok: true, username: body.result?.username } });
  } catch (error) {
    return NextResponse.json({ data: { ok: false }, message: error instanceof Error ? error.message : 'Lỗi' }, { status: 400 });
  }
}
