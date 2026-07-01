import type { BotCtx } from './commands';
import * as api from './api';
import { getChatAccount, setChatAccount } from './state';
import { watchPublish } from './watch';
import { buildSlotOptions, formatLocal } from './time';

// ----------------------------------------------------------------------
// Xử lý callback_query (nút inline). callback_data ngắn để khớp giới hạn 64 bytes.
//   pick:<accountId>           chọn account mặc định cho chat
//   publish:<postId>           đăng ngay
//   sched:<postId>             hiện nút slot lên lịch
//   slot:<postId>:<iso>        lên lịch theo slot đã chọn
//   approve:<postId>           duyệt
//   del:<postId> / delok:<postId>  xóa (xác nhận)

export type CallbackCtx = BotCtx & {
  answer: (callbackId: string, text?: string) => Promise<void>;
};

function accountOf(ctx: CallbackCtx, chatId: number): string {
  return getChatAccount(chatId) || ctx.config.defaultAccountId || '';
}

export async function handleCallback(
  ctx: CallbackCtx,
  chatId: number,
  callbackId: string,
  data: string
) {
  const [action, ...rest] = data.split(':');

  // pick account
  if (action === 'pick') {
    const accountId = rest.join(':');
    setChatAccount(chatId, accountId);
    await ctx.answer(callbackId, 'Đã chọn tài khoản');
    await ctx.send(chatId, '✅ Đã đặt tài khoản mặc định cho chat này.');

    return;
  }

  const accountId = accountOf(ctx, chatId);
  if (!accountId) {
    await ctx.answer(callbackId);
    await ctx.send(chatId, 'Chưa chọn tài khoản. Dùng /accounts để chọn.');

    return;
  }

  const postId = rest.join(':');

  if (action === 'publish') {
    await ctx.answer(callbackId, 'Đang đăng…');
    const res = await api.publishPost(accountId, postId);
    if (!res.ok) {
      await ctx.send(chatId, `❌ ${res.message || 'Không đăng được'}`);

      return;
    }
    await ctx.send(chatId, '🚀 Đang đăng bài qua app…');
    watchPublish(chatId, accountId, postId, ctx.send);

    return;
  }

  if (action === 'approve') {
    await ctx.answer(callbackId);
    const res = await api.approvePost(accountId, postId);
    await ctx.send(chatId, res.ok ? '✅ Đã duyệt bài.' : `❌ ${res.message || 'Không duyệt được'}`);

    return;
  }

  if (action === 'del') {
    await ctx.answer(callbackId);
    await ctx.send(chatId, '⚠️ Xác nhận xóa bài?', {
      inline_keyboard: [[{ text: 'Xóa', callback_data: `delok:${postId}` }, { text: 'Hủy', callback_data: 'noop' }]],
    });

    return;
  }

  if (action === 'delok') {
    await ctx.answer(callbackId);
    const res = await api.deletePost(accountId, postId);
    await ctx.send(chatId, res.ok ? '🗑 Đã xóa bài.' : `❌ ${res.message || 'Không xóa được'}`);

    return;
  }

  if (action === 'sched') {
    await ctx.answer(callbackId);
    const settings = await api.getSettings();
    const slots: string[] = settings.data?.defaultScheduleSlots || ['09:00', '12:00', '20:00'];
    const options = buildSlotOptions(slots, ctx.config.tzOffset);

    if (!options.length) {
      await ctx.send(chatId, 'Không có slot khả dụng. Gửi giờ dạng `HH:mm` hoặc `YYYY-MM-DD HH:mm` (chưa hỗ trợ nhập tự do qua nút).');

      return;
    }

    const buttons = options.map((opt) => [{ text: opt.label, callback_data: `slot:${postId}:${opt.iso}` }]);
    await ctx.send(chatId, 'Chọn thời gian lên lịch:', { inline_keyboard: buttons });

    return;
  }

  if (action === 'slot') {
    // rest = [postId, iso...] — iso chứa dấu ':' nên ghép lại phần sau postId.
    const realPostId = rest[0];
    const iso = rest.slice(1).join(':');
    await ctx.answer(callbackId);
    const res = await api.schedulePost(accountId, realPostId, iso);
    await ctx.send(
      chatId,
      res.ok ? `🕒 Đã lên lịch lúc ${formatLocal(iso, ctx.config.tzOffset)}` : `❌ ${res.message || 'Không lên lịch được'}`
    );

    return;
  }

  // noop / unknown
  await ctx.answer(callbackId);
}
