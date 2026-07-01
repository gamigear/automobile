import type { TelegramConfig } from './config';
import * as api from './api';
import { getChatAccount } from './state';
import { watchImport } from './watch';

// ----------------------------------------------------------------------
// Router lệnh text + builder inline keyboard cho bot Telegram.

export type BotCtx = {
  config: TelegramConfig;
  send: (chatId: number, text: string, replyMarkup?: any) => Promise<void>;
};

const HELP = [
  '🤖 *Gami bot* — điều khiển từ xa:',
  '',
  '• Gửi *link XSH/Douyin* → tạo bài nháp',
  '• `/accounts` — chọn tài khoản mặc định',
  '• `/list` — danh sách bài gần đây + nút thao tác',
  '• `/draft account:<id> <link>` — tạo nháp cho account chỉ định',
  '',
  'Sau khi có bài, dùng nút: 🚀 Đăng · 🕒 Lên lịch · ✅ Duyệt · 🗑 Xóa',
].join('\n');

function detectPlatform(url: string): string {
  if (/xhslink|xiaohongshu|xhscdn/i.test(url)) return 'xsh';
  if (/douyin|iesdouyin|tiktok/i.test(url)) return 'douyin';

  return 'auto';
}

function extractUrl(text: string): string {
  return text.match(/https?:\/\/\S+/)?.[0] || '';
}

function resolveAccount(ctx: BotCtx, chatId: number, explicit?: string): string {
  return explicit || getChatAccount(chatId) || ctx.config.defaultAccountId || '';
}

function postActions(postId: string) {
  return {
    inline_keyboard: [
      [
        { text: '🚀 Đăng', callback_data: `publish:${postId}` },
        { text: '🕒 Lịch', callback_data: `sched:${postId}` },
        { text: '✅ Duyệt', callback_data: `approve:${postId}` },
        { text: '🗑', callback_data: `del:${postId}` },
      ],
    ],
  };
}

async function cmdAccounts(ctx: BotCtx, chatId: number) {
  // Bot gán theo device -> chỉ hiện account thuộc device đó.
  const deviceId = ctx.config.deviceId;
  const res = deviceId ? await api.listDeviceAccounts(deviceId) : await api.listAccounts();
  const rows: any[] = Array.isArray(res.data) ? res.data : [];

  if (!rows.length) {
    await ctx.send(chatId, deviceId ? 'Thiết bị này chưa có tài khoản nào.' : 'Chưa có tài khoản nào.');

    return;
  }

  const buttons = rows.slice(0, 20).map((acc) => {
    const id = acc.accountId || acc.id;
    const name = acc.accountName || acc.name;
    const platform = acc.platform || acc.platformCode || '';
    return [{ text: `${name} · ${platform}`.trim(), callback_data: `pick:${id}` }];
  });
  await ctx.send(chatId, 'Chọn tài khoản mặc định cho chat này:', { inline_keyboard: buttons });
}

async function cmdList(ctx: BotCtx, chatId: number, accountArg?: string) {
  const accountId = resolveAccount(ctx, chatId, accountArg);
  if (!accountId) {
    await ctx.send(chatId, 'Chưa chọn tài khoản. Dùng /accounts để chọn.');

    return;
  }

  const res = await api.listPosts(accountId);
  const rows: any[] = Array.isArray(res.data) ? res.data : [];
  const recent = rows.slice(0, 8);

  if (!recent.length) {
    await ctx.send(chatId, 'Chưa có bài nào cho tài khoản này.');

    return;
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const post of recent) {
    const line = `📝 *${post.title || '(không tên)'}*\nTrạng thái: ${post.status}${post.scheduledAt ? ` · ⏰ ${post.scheduledAt}` : ''}`;
    // eslint-disable-next-line no-await-in-loop
    await ctx.send(chatId, line, postActions(post.id));
  }
}

async function cmdDraft(ctx: BotCtx, chatId: number, text: string) {
  const url = extractUrl(text);
  if (!url) {
    await ctx.send(chatId, 'Gửi link XSH hoặc Douyin để tạo bài nháp.');

    return;
  }

  const accountMatch = text.match(/account[:=]\s*([a-zA-Z0-9_-]+)/i);
  const accountId = resolveAccount(ctx, chatId, accountMatch?.[1]);
  if (!accountId) {
    await ctx.send(chatId, 'Chưa chọn tài khoản. Dùng /accounts hoặc account:<id>.');

    return;
  }

  await ctx.send(chatId, '⏳ Đang tải nguồn và tạo bài nháp…');
  const res = await api.createImport(accountId, url, detectPlatform(url));

  if (!res.ok) {
    await ctx.send(chatId, `❌ ${res.message || 'Không thể tạo nháp từ link'}`);

    return;
  }

  // Import chạy nền -> theo dõi để báo ngược khi xong.
  const importId = res.data?.id;
  if (importId) {
    watchImport(chatId, accountId, importId, ctx.send);
  } else if (res.data?.postId) {
    await ctx.send(chatId, '✅ Đã tạo nháp.', postActions(res.data.postId));
  }
}

export async function handleMessage(ctx: BotCtx, chatId: number, text: string) {
  const trimmed = text.trim();

  if (/^\/(start|help)\b/i.test(trimmed)) {
    await ctx.send(chatId, `${HELP}\n\nChat ID của bạn: \`${chatId}\``);

    return;
  }
  if (/^\/accounts\b/i.test(trimmed)) {
    await cmdAccounts(ctx, chatId);

    return;
  }
  if (/^\/list\b/i.test(trimmed)) {
    const arg = trimmed.replace(/^\/list\s*/i, '').trim();
    await cmdList(ctx, chatId, arg || undefined);

    return;
  }
  if (/^\/draft\b/i.test(trimmed) || extractUrl(trimmed)) {
    await cmdDraft(ctx, chatId, trimmed);

    return;
  }

  await ctx.send(chatId, 'Lệnh không rõ. Gõ /help để xem hướng dẫn.');
}

export { postActions };
