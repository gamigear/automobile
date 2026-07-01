import { getImport, getPost } from './api';

// ----------------------------------------------------------------------
// Thông báo ngược: theo dõi import/publish (in-memory) tới terminal status rồi báo về chat.
// Bot restart -> mất watch đang chờ (chấp nhận; không mất dữ liệu).

type Notify = (chatId: number, text: string, replyMarkup?: any) => Promise<void>;

type WatchItem = {
  chatId: number;
  accountId: string;
  kind: 'import' | 'publish';
  id: string; // importId hoặc postId
  startedAt: number;
  notify?: Notify; // gửi về đúng bot đã nhận lệnh (multi-bot); rỗng -> dùng notifyFn chung
};

const MAX_WATCH_MS = 15 * 60_000; // 15 phút thì ngừng theo dõi
const POLL_INTERVAL_MS = 10_000;

const items: WatchItem[] = [];
let notifyFn: Notify | null = null;
let timer: NodeJS.Timeout | null = null;

export function initWatcher(notify: Notify) {
  notifyFn = notify;
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((error) => console.error('[telegram-watch] tick error', error));
  }, POLL_INTERVAL_MS);
}

export function watchImport(chatId: number, accountId: string, importId: string, notify?: Notify) {
  items.push({ chatId, accountId, kind: 'import', id: importId, startedAt: Date.now(), notify });
}

export function watchPublish(chatId: number, accountId: string, postId: string, notify?: Notify) {
  items.push({ chatId, accountId, kind: 'publish', id: postId, startedAt: Date.now(), notify });
}

// Nút thao tác sau khi tạo nháp xong.
function draftActions(postId: string) {
  return {
    inline_keyboard: [
      [
        { text: '🚀 Đăng ngay', callback_data: `publish:${postId}` },
        { text: '🕒 Lên lịch', callback_data: `sched:${postId}` },
        { text: '✅ Duyệt', callback_data: `approve:${postId}` },
      ],
    ],
  };
}

async function resolveImport(item: WatchItem, send: Notify): Promise<boolean> {
  const res = await getImport(item.accountId, item.id);
  const status = res.data?.status;

  if (status === 'DRAFT_CREATED') {
    const postId = res.data?.postId;
    const title = res.data?.translatedTitle || res.data?.sourceTitle || '(không tên)';
    await send(item.chatId, `✅ Đã tạo nháp: ${title}`, postId ? draftActions(postId) : undefined);

    return true;
  }
  if (status === 'FAILED') {
    await send(item.chatId, `❌ Import lỗi: ${res.data?.errorMessage || 'không rõ'}`);

    return true;
  }

  return false; // còn đang xử lý
}

async function resolvePublish(item: WatchItem, send: Notify): Promise<boolean> {
  const res = await getPost(item.accountId, item.id);
  const status = res.data?.status;

  if (status === 'PUBLISHED') {
    await send(item.chatId, `✅ Đã đăng: ${res.data?.title || item.id}`);

    return true;
  }
  if (status === 'FAILED') {
    await send(item.chatId, `❌ Đăng lỗi: ${res.data?.lastPublishError || 'không rõ'}`);

    return true;
  }

  return false;
}

async function tick() {
  if (!notifyFn || !items.length) return;

  // Lặp ngược để splice an toàn.
  // eslint-disable-next-line no-plusplus
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const send: Notify = item.notify || notifyFn;
    let done = false;

    try {
      // eslint-disable-next-line no-await-in-loop
      done = item.kind === 'import' ? await resolveImport(item, send) : await resolvePublish(item, send);
    } catch {
      done = false;
    }

    if (!done && Date.now() - item.startedAt > MAX_WATCH_MS) {
      // eslint-disable-next-line no-await-in-loop
      await send(item.chatId, `⏳ ${item.kind === 'import' ? 'Import' : 'Bài'} vẫn đang xử lý — xem dashboard để biết kết quả.`);
      done = true;
    }

    if (done) items.splice(i, 1);
  }
}
