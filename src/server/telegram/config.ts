import { prisma } from 'src/lib/prisma';
// crypto
import { decryptSecret, decryptSecretFromString } from '../secret-crypto';

// ----------------------------------------------------------------------
// Cấu hình Telegram bot từ AppSetting (+ env fallback). Cache 30s, decrypt token on read.
// Bot đọc động mỗi vòng poll -> đổi trong Settings áp dụng không cần restart.

export type TelegramConfig = {
  enabled: boolean;
  botToken: string;
  apiBaseUrl: string;
  appBaseUrl: string;
  defaultAccountId: string;
  allowedChatIds: string[];
  tzOffset: string;
  // Bot gán riêng (multi-bot). Rỗng/undefined = bot chung cũ.
  botId?: string;
  deviceId?: string;
  label?: string;
};

const TELEGRAM_KEYS = [
  'telegramEnabled',
  'telegramBotToken',
  'telegramApiBaseUrl',
  'telegramAppBaseUrl',
  'telegramDefaultAccountId',
  'telegramAllowedChatIds',
  'telegramTzOffset',
] as const;

const DEFAULT_API_BASE = 'https://api.telegram.org';
const DEFAULT_APP_BASE = 'http://localhost:8081';
const DEFAULT_TZ_OFFSET = '+07:00';

const CACHE_TTL_MS = 30_000;

let cache: { value: TelegramConfig; expiresAt: number } | null = null;

export function invalidateTelegramConfigCache() {
  cache = null;
}

function parseChatIds(raw: unknown): string[] {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function envConfig(): TelegramConfig {
  return {
    enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    apiBaseUrl: process.env.TELEGRAM_API_BASE_URL || DEFAULT_API_BASE,
    appBaseUrl: process.env.TELEGRAM_APP_BASE_URL || process.env.NEXTAUTH_URL || DEFAULT_APP_BASE,
    defaultAccountId: process.env.TELEGRAM_DEFAULT_SOCIAL_ACCOUNT_ID || '',
    allowedChatIds: parseChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    tzOffset: process.env.TELEGRAM_TZ_OFFSET || DEFAULT_TZ_OFFSET,
  };
}

async function loadConfig(): Promise<TelegramConfig> {
  if (!process.env.DATABASE_URL) return envConfig();

  const settings = await prisma.appSetting.findMany({ where: { key: { in: [...TELEGRAM_KEYS] } } });
  const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));
  const env = envConfig();

  const botToken = map.telegramBotToken ? decryptSecret(map.telegramBotToken) : env.botToken;
  // Master toggle: ưu tiên giá trị DB nếu đã set, ngược lại bật khi có token.
  const enabled = map.telegramEnabled === undefined ? Boolean(botToken) : Boolean(map.telegramEnabled);

  return {
    enabled,
    botToken,
    apiBaseUrl: String(map.telegramApiBaseUrl || env.apiBaseUrl),
    appBaseUrl: String(map.telegramAppBaseUrl || env.appBaseUrl),
    defaultAccountId: String(map.telegramDefaultAccountId || env.defaultAccountId),
    allowedChatIds: map.telegramAllowedChatIds !== undefined ? parseChatIds(map.telegramAllowedChatIds) : env.allowedChatIds,
    tzOffset: String(map.telegramTzOffset || env.tzOffset),
  };
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const value = await loadConfig();
  cache = { value, expiresAt: now + CACHE_TTL_MS };

  return value;
}

// Chia sẻ apiBaseUrl/appBaseUrl với bot chung; token/binding riêng theo từng TelegramBot.
async function sharedBase(): Promise<Pick<TelegramConfig, 'apiBaseUrl' | 'appBaseUrl'>> {
  const shared = await getTelegramConfig();

  return { apiBaseUrl: shared.apiBaseUrl, appBaseUrl: shared.appBaseUrl };
}

// Dựng TelegramConfig cho 1 bot gán riêng. binding DEVICE -> defaultAccount = account primary của device.
export async function resolveBotConfig(botId: string): Promise<TelegramConfig | null> {
  const bot = await prisma.telegramBot.findUnique({ where: { id: botId } });
  if (!bot || !bot.enabled || !bot.botToken) return null;

  const base = await sharedBase();
  let defaultAccountId = bot.socialAccountId || '';

  if (bot.binding === 'DEVICE' && bot.deviceId) {
    const mapping =
      (await prisma.socialAccountDevice.findFirst({
        where: { deviceId: bot.deviceId, isPrimary: true },
        select: { socialAccountId: true },
      })) ||
      (await prisma.socialAccountDevice.findFirst({
        where: { deviceId: bot.deviceId },
        select: { socialAccountId: true },
      }));
    defaultAccountId = mapping?.socialAccountId || '';
  }

  return {
    enabled: true,
    botToken: decryptSecretFromString(bot.botToken),
    ...base,
    defaultAccountId,
    allowedChatIds: parseChatIds(bot.allowedChatIds),
    tzOffset: bot.tzOffset || DEFAULT_TZ_OFFSET,
    botId: bot.id,
    deviceId: bot.binding === 'DEVICE' ? bot.deviceId || undefined : undefined,
    label: bot.label,
  };
}

// Danh sách id bot đang bật (cho worker khởi động loop).
export async function listEnabledBotIds(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const bots = await prisma.telegramBot.findMany({ where: { enabled: true }, select: { id: true } });

  return bots.map((b) => b.id);
}
