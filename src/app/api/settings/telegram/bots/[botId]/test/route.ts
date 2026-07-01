import { NextResponse } from 'next/server';
// db + auth
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';
import { decryptSecretFromString } from 'src/server/secret-crypto';
import { getTelegramConfig } from 'src/server/telegram/config';

// ----------------------------------------------------------------------
// Test token bot gán riêng: getMe -> @username.

export const dynamic = 'force-dynamic';

type Params = { params: { botId: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = requireRole(request, 'ADMIN');
  if (auth.error) return auth.error;
  if (!process.env.DATABASE_URL) return NextResponse.json({ message: 'DATABASE_URL chưa cấu hình' }, { status: 500 });

  const bot = await prisma.telegramBot.findUnique({ where: { id: params.botId } });
  if (!bot?.botToken) return NextResponse.json({ data: { ok: false }, message: 'Bot chưa có token' }, { status: 400 });

  const shared = await getTelegramConfig();
  const token = decryptSecretFromString(bot.botToken);

  try {
    const response = await fetch(`${shared.apiBaseUrl}/bot${token}/getMe`);
    const body = await response.json();

    if (!response.ok || !body.ok) {
      return NextResponse.json(
        { data: { ok: false }, message: body.description || `Telegram trả HTTP ${response.status}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: { ok: true, username: body.result?.username } });
  } catch (error) {
    return NextResponse.json(
      { data: { ok: false }, message: error instanceof Error ? error.message : 'Lỗi gọi Telegram' },
      { status: 400 }
    );
  }
}
