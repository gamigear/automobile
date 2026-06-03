import { signAccessToken } from 'src/lib/auth-token';

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
};

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const apiBaseUrl = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';
const appBaseUrl = process.env.TELEGRAM_APP_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:8081';
const defaultAccountId = process.env.TELEGRAM_DEFAULT_SOCIAL_ACCOUNT_ID || '';
const allowedChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function adminToken() {
  return signAccessToken({
    sub: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@gami.local',
    name: 'Admin',
    role: 'ADMIN',
  });
}

function extractUrl(text: string) {
  return text.match(/https?:\/\/\S+/)?.[0] || '';
}

function detectPlatform(url: string) {
  if (/xhslink|xiaohongshu|xhscdn/i.test(url)) return 'xsh';
  if (/douyin|iesdouyin|tiktok/i.test(url)) return 'douyin';

  return 'auto';
}

async function telegram(method: string, body: Record<string, unknown>) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const response = await fetch(`${apiBaseUrl}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);

  return response.json();
}

async function sendMessage(chatId: number, text: string) {
  await telegram('sendMessage', { chat_id: chatId, text });
}

async function createSourceImport(accountId: string, url: string) {
  const response = await fetch(`${appBaseUrl}/api/accounts/${accountId}/source-imports/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify({ url, platform: detectPlatform(url) }),
  });
  const body = await response.json();

  if (!response.ok) throw new Error(body.message || 'Không thể tạo nháp từ link');

  return body;
}

async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text || '';

  if (!message || !text) return;
  if (allowedChatIds.length && !allowedChatIds.includes(String(message.chat.id))) return;

  const url = extractUrl(text);

  if (!url) {
    await sendMessage(message.chat.id, 'Gửi link XSH hoặc Douyin để tạo bài nháp.');
    return;
  }

  const accountMatch = text.match(/account[:=]\s*([a-zA-Z0-9_-]+)/i);
  const accountId = accountMatch?.[1] || defaultAccountId;

  if (!accountId) {
    await sendMessage(message.chat.id, 'Chưa cấu hình TELEGRAM_DEFAULT_SOCIAL_ACCOUNT_ID hoặc account:<id>.');
    return;
  }

  await sendMessage(message.chat.id, 'Đang tải nguồn và tạo bài nháp...');

  try {
    const result = await createSourceImport(accountId, url);
    const status = result.data?.status || 'UNKNOWN';
    const postId = result.postId || result.data?.postId || '';

    await sendMessage(message.chat.id, postId ? `Đã tạo nháp: ${postId}` : `Import kết thúc với trạng thái: ${status}`);
  } catch (error) {
    await sendMessage(message.chat.id, error instanceof Error ? error.message : 'Import thất bại');
  }
}

async function poll() {
  let offset = 0;

  console.log('Gami Telegram bot started');

  while (true) {
    try {
      const response = await telegram('getUpdates', { offset, timeout: 30 });
      const updates = (response.result || []) as TelegramUpdate[];

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        await handleUpdate(update);
      }
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

if (!token) {
  console.log('TELEGRAM_BOT_TOKEN is empty, telegram bot is disabled');
} else {
  poll().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
