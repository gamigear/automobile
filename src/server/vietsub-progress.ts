// ----------------------------------------------------------------------
// Registry tiến trình vietsub (in-memory, theo postId). Route vietsub chạy trong tiến trình
// Next.js; endpoint progress đọc cùng tiến trình -> chia sẻ Map này. (1 web container.)

export type VietsubPhase =
  | 'queued'
  | 'loading_model'
  | 'transcribing'
  | 'translating'
  | 'burning'
  | 'done'
  | 'error';

export type VietsubProgress = {
  postId: string;
  phase: VietsubPhase;
  label: string; // mô tả tiếng Việt hiển thị UI
  percent: number; // 0..100 (ước lượng theo phase)
  segments: number; // số câu đã nhận dạng (giai đoạn transcribe)
  error?: string;
  startedAt: number;
  updatedAt: number;
};

// % ước lượng theo phase (transcribe chiếm dải rộng vì lâu nhất).
const PHASE_PERCENT: Record<VietsubPhase, number> = {
  queued: 2,
  loading_model: 8,
  transcribing: 35,
  translating: 70,
  burning: 85,
  done: 100,
  error: 100,
};

const store = new Map<string, VietsubProgress>();
const TTL_MS = 5 * 60_000; // dọn entry cũ sau 5 phút kể từ lần cập nhật cuối

function cleanup() {
  const now = Date.now();
  Array.from(store.entries()).forEach(([id, p]) => {
    if (now - p.updatedAt > TTL_MS) store.delete(id);
  });
}

export function startVietsubProgress(postId: string): void {
  const now = Date.now();
  store.set(postId, {
    postId,
    phase: 'queued',
    label: 'Đang chuẩn bị…',
    percent: PHASE_PERCENT.queued,
    segments: 0,
    startedAt: now,
    updatedAt: now,
  });
  cleanup();
}

export function updateVietsubProgress(
  postId: string,
  patch: Partial<Pick<VietsubProgress, 'phase' | 'label' | 'segments' | 'error'>>
): void {
  const prev = store.get(postId);
  if (!prev) return;

  const phase = patch.phase ?? prev.phase;
  store.set(postId, {
    ...prev,
    ...patch,
    phase,
    percent: PHASE_PERCENT[phase] ?? prev.percent,
    updatedAt: Date.now(),
  });
}

export function finishVietsubProgress(postId: string, error?: string): void {
  const prev = store.get(postId);
  const now = Date.now();
  store.set(postId, {
    postId,
    phase: error ? 'error' : 'done',
    label: error ? `Lỗi: ${error}` : 'Hoàn tất.',
    percent: 100,
    segments: prev?.segments ?? 0,
    error,
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
  });
  cleanup();
}

export function getVietsubProgress(postId: string): VietsubProgress | null {
  return store.get(postId) ?? null;
}
