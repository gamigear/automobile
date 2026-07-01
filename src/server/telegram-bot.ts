/* eslint-disable no-await-in-loop */
import {
  getTelegramConfig,
  resolveBotConfig,
  listEnabledBotIds,
  type TelegramConfig,
} from './telegram/config';
import { handleMessage, type BotCtx } from './telegram/commands';
import { handleCallback } from './telegram/callbacks';
import { initWatcher } from './telegram/watch';

// ----------------------------------------------------------------------
// Gami Telegram bot — điều khiển từ xa (tạo nháp / list / lên lịch / đăng / duyệt).
// Cấu hình đọc động từ Settings (AppSetting) + env fallback -> đổi không cần restart.

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string; from?: { username?: string } };
  callback_query?: {
    id: string;
    data?: string;
    from?: { username?: string };
    message?: { chat: { id: number } };
  };
};

// Tài khoản cha (owner): luôn được phép trên MỌI bot, bất kể allowedChatIds.
const OWNER_USERNAME = (process.env.TELEGRAM_OWNER_USERNAME || 'wtfkute').replace(/^@/, '').toLowerCase();

async function telegram(cfg: TelegramConfig, method: string, body: Record<string, unknown>) {
  const response = await fetch(`${cfg.apiBaseUrl}/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);

  return response.json();
}

function makeCtx(cfg: TelegramConfig): BotCtx & { answer: (id: string, text?: string) => Promise<void> } {
  return {
    config: cfg,
    send: async (chatId, text, replyMarkup) => {
      await telegram(cfg, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
    },
    answer: async (callbackId, text) => {
      await telegram(cfg, 'answerCallbackQuery', { callback_query_id: callbackId, text: text || undefined }).catch(
        () => undefined
      );
    },
  };
}

function isAllowed(cfg: TelegramConfig, chatId: number, username?: string): boolean {
  // Tài khoản cha luôn được phép (mọi bot).
  if (username && username.toLowerCase() === OWNER_USERNAME) return true;

  // Rỗng = chưa cấu hình -> chặn (an toàn). Buộc admin set allowed chat ids.
  if (!cfg.allowedChatIds.length) return false;

  return cfg.allowedChatIds.includes(String(chatId));
}

let watcherStarted = false;

async function handleUpdate(cfg: TelegramConfig, update: TelegramUpdate) {
  const ctx = makeCtx(cfg);

  // Callback (nút inline)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id;
    if (chatId === undefined) return;
    if (!isAllowed(cfg, chatId, cq.from?.username)) {
      await ctx.answer(cq.id, 'Chat chưa được cấp quyền.');

      return;
    }
    await handleCallback(ctx, chatId, cq.id, cq.data || '');

    return;
  }

  // Message text
  const { message } = update;
  const text = message?.text || '';
  if (!message || !text) return;

  const chatId = message.chat.id;
  if (!isAllowed(cfg, chatId, message.from?.username)) {
    // Cho phép xem chatId để admin thêm vào allowlist.
    await ctx
      .send(chatId, `Chat chưa được cấp quyền. Chat ID của bạn: ${chatId}\nThêm vào Allowed chat IDs trong Settings.`)
      .catch(() => undefined);

    return;
  }

  await handleMessage(ctx, chatId, text);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Một vòng poll độc lập cho 1 bot (token + offset riêng). Đọc config động mỗi vòng.
// keepRunning() = false -> thoát sau vòng poll hiện tại (dùng để dừng bot bị tắt/xoá).
async function runBotLoop(
  name: string,
  getCfg: () => Promise<TelegramConfig | null>,
  keepRunning: () => boolean
) {
  console.log(`[telegram] loop start: ${name}`);
  let offset = 0;

  while (keepRunning()) {
    let cfg: TelegramConfig | null = null;
    try {
      cfg = await getCfg();
    } catch {
      cfg = null;
    }

    if (!cfg || !cfg.enabled || !cfg.botToken) {
      await sleep(10_000);
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      const response = await telegram(cfg, 'getUpdates', { offset, timeout: 30 });
      const updates = (response.result || []) as TelegramUpdate[];

      // eslint-disable-next-line no-restricted-syntax
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        // eslint-disable-next-line no-await-in-loop
        await handleUpdate(cfg, update).catch((error) => console.error(`handleUpdate ${name}`, error));
      }
    } catch (error) {
      console.error(`[telegram] ${name}`, error);
      await sleep(5000);
    }
  }

  console.log(`[telegram] loop stop: ${name}`);
}

async function main() {
  // Watcher chung: fallback notify qua bot chung (item.notify của từng bot sẽ ưu tiên).
  if (!watcherStarted) {
    initWatcher(async (chatId, text, replyMarkup) => {
      const current = await getTelegramConfig();
      if (!current.botToken) return;
      await telegram(current, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      }).catch(() => undefined);
    });
    watcherStarted = true;
  }

  // Bot chung cũ: luôn có loop (tự idle khi tắt trong Settings).
  runBotLoop('legacy', getTelegramConfig, () => true).catch((e) => console.error('[telegram] legacy', e));

  // Supervisor cho các bot gán riêng: định kỳ nạp danh sách, start loop mới, dừng loop đã tắt/xoá.
  const activeBotIds = new Set<string>();

  const reconcile = async () => {
    let ids: string[] = [];
    try {
      ids = await listEnabledBotIds();
    } catch {
      ids = [];
    }
    const idSet = new Set(ids);

    for (const id of ids) {
      if (!activeBotIds.has(id)) {
        activeBotIds.add(id);
        runBotLoop(`bot:${id}`, () => resolveBotConfig(id), () => activeBotIds.has(id)).catch((e) =>
          console.error(`[telegram] bot:${id}`, e)
        );
      }
    }
    // Bot không còn bật -> bỏ khỏi set để loop tự thoát vòng kế.
    for (const id of Array.from(activeBotIds)) {
      if (!idSet.has(id)) activeBotIds.delete(id);
    }
  };

  await reconcile();
  setInterval(() => reconcile().catch((e) => console.error('[telegram] reconcile', e)), 30_000);

  console.log('Gami Telegram multi-bot started');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
