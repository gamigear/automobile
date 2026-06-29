import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// settings
import { getSourceDownloadSettings } from './source-download-settings';

const execFileAsync = promisify(execFile);

export type SourcePlatform = 'auto' | 'xiaohongshu' | 'douyin';

export type SourceMediaFile = { containerPath: string; hostPath: string; fileName: string; mimeType: string; size?: number };

export type NormalizedSourceDownload = {
  ok: boolean;
  platform: 'xiaohongshu' | 'douyin';
  jobId: string;
  sourcePostId: string;
  sourceUrl: string;
  resolvedUrl?: string;
  title: string;
  captionRaw: string;
  contentType: 'video' | 'image' | 'mixed';
  files: SourceMediaFile[];
  jobDir?: string;
  postFolder?: string;
  metadata: Record<string, unknown>;
};

export function detectSourcePlatform(url: string): Exclude<SourcePlatform, 'auto'> {
  const value = url.toLowerCase();

  if (value.includes('xhslink.com') || value.includes('xiaohongshu.com')) return 'xiaohongshu';
  if (value.includes('douyin.com') || value.includes('v.douyin.com')) return 'douyin';

  throw new Error('Link nguồn chưa được hỗ trợ. Hiện hỗ trợ Xiaohongshu và Douyin.');
}

function mapContainerPathToHostPath(containerPath: string) {
  const settings = getSourceDownloadSettings();
  if (!containerPath.startsWith('/data/')) return containerPath;

  return path.join(settings.dataRoot, containerPath.replace(/^\/data\//, ''));
}

function guessMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function normalize(raw: any, fallbackUrl: string, platform: 'xiaohongshu' | 'douyin'): NormalizedSourceDownload {
  const normalized = raw.normalized || {};
  const files = (raw.files || []).map((containerPath: string) => {
    const hostPath = mapContainerPathToHostPath(String(containerPath));
    const stat = fs.existsSync(hostPath) ? fs.statSync(hostPath) : null;
    return {
      containerPath: String(containerPath),
      hostPath,
      fileName: path.basename(hostPath),
      mimeType: guessMimeType(hostPath),
      size: stat?.size,
    };
  });

  if (!files.length) throw new Error('Downloader không trả về file media');

  const sourcePostId = String(normalized.source_post_id || raw.source_post_id || '').trim();

  return {
    ok: Boolean(raw.ok ?? true),
    platform,
    jobId: String(raw.job_id || raw.jobId || `${platform}_${Date.now()}`),
    sourcePostId,
    sourceUrl: String(normalized.source_url || raw.original_link || fallbackUrl),
    resolvedUrl: normalized.resolved_url || raw.original_link,
    title: String(normalized.title || '').trim(),
    captionRaw: String(normalized.caption_vi || normalized.caption_raw || normalized.caption_clean || normalized.title || '').trim(),
    contentType: raw.content_type || normalized.media_type || 'mixed',
    files,
    jobDir: raw.job_dir,
    metadata: raw,
  };
}

// Thư mục gốc chứa media đã tổ chức theo post (Gami sở hữu, ổn định, sẵn sàng push ADB).
export function getSourceMediaRoot() {
  const settings = getSourceDownloadSettings();

  return process.env.SOURCE_MEDIA_ROOT || path.join(settings.dataRoot, 'gami-post-media');
}

function sanitizeFolderSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'post';
}

// Copy media của 1 download vào thư mục riêng cho post: <root>/<platform>/<key>/.
// key nên là source_post_id (duy nhất mỗi post) -> tránh đè nhau khi tải hàng loạt.
export function organizeSourceMediaIntoPostFolder(download: NormalizedSourceDownload, key: string): NormalizedSourceDownload {
  const safeKey = sanitizeFolderSegment(key);
  const postFolder = path.join(getSourceMediaRoot(), download.platform, safeKey);

  fs.mkdirSync(postFolder, { recursive: true });

  const files: SourceMediaFile[] = download.files.map((file, index) => {
    const ext = path.extname(file.fileName) || '';
    const destName = file.fileName || `media_${String(index + 1).padStart(2, '0')}${ext}`;
    const destPath = path.join(postFolder, destName);

    if (fs.existsSync(file.hostPath) && file.hostPath !== destPath) {
      fs.copyFileSync(file.hostPath, destPath);
    }

    const stat = fs.existsSync(destPath) ? fs.statSync(destPath) : null;

    return { ...file, hostPath: destPath, fileName: destName, size: stat?.size ?? file.size };
  });

  return { ...download, files, postFolder };
}

// Script bot exit != 0 khi ok:false -> execFile ném lỗi. Lấy stdout từ cả thành công lẫn lỗi để parse JSON.
async function runFetchScript(script: string, url: string): Promise<any> {
  const settings = getSourceDownloadSettings();
  try {
    const { stdout, stderr } = await execFileAsync(
      settings.dockerBin,
      ['exec', settings.douyinContainer, 'python', `/app/app/${script}`, url],
      { timeout: 900000, maxBuffer: 1024 * 1024 * 20 }
    );
    return JSON.parse((stdout.trim() || stderr.trim()) || '{}');
  } catch (error: any) {
    // Non-zero exit: vẫn có JSON trong stdout (vd {ok:false,error:...}).
    const out = (error?.stdout || '').toString().trim();
    if (out) {
      try {
        return JSON.parse(out);
      } catch {
        // không phải JSON -> rơi xuống ném lỗi gốc
      }
    }
    throw error;
  }
}

// Lỗi XHS thường gặp -> thông điệp tiếng Việt rõ ràng.
function friendlyXhsError(raw: string): string {
  if (raw.includes('获取小红书作品数据失败') || raw.includes('提取小红书作品链接失败')) {
    return 'Không lấy được dữ liệu XHS. XHS yêu cầu cookie đăng nhập — cấu hình XHS_COOKIE trong env của bot (lấy cookie từ trình duyệt đã đăng nhập xiaohongshu.com), hoặc link đã bị xoá/giới hạn.';
  }

  return raw;
}

async function downloadFromXhs(url: string) {
  const body = await runFetchScript('xhs_fetch.py', url);

  if (body.ok === false) throw new Error(friendlyXhsError(body.error || 'XHS downloader thất bại'));
  return normalize(body, url, 'xiaohongshu');
}

async function downloadFromDouyin(url: string) {
  const body = await runFetchScript('douyin_fetch.py', url);

  if (body.ok === false) throw new Error(body.error || 'Douyin downloader thất bại');
  return normalize(body, url, 'douyin');
}

// Serialize các lần tải: bot đặt job_id theo timestamp-GIÂY và chỉ nhận URL, nên 2 download
// chạy song song cùng giây sẽ ghi đè cùng thư mục job -> các post lẫn ảnh của nhau.
// Chạy lần lượt đảm bảo mỗi download rơi vào 1 giây khác nhau (mỗi lần fetch mất vài giây).
let downloadChain: Promise<unknown> = Promise.resolve();

function withDownloadLock<T>(task: () => Promise<T>): Promise<T> {
  const run = downloadChain.then(task, task);

  downloadChain = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

export async function downloadSourceContent(input: { url: string; platform?: SourcePlatform }) {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader đang bị tắt');

  const platform = input.platform && input.platform !== 'auto' ? input.platform : detectSourcePlatform(input.url);
  if (platform === 'xiaohongshu') return withDownloadLock(() => downloadFromXhs(input.url));
  if (platform === 'douyin') return withDownloadLock(() => downloadFromDouyin(input.url));

  throw new Error('Platform nguồn chưa được hỗ trợ');
}

// ----------------------------------------------------------------------
// Douyin: liệt kê video của 1 user từ link profile. Cần script douyin_user_fetch.py trong container.

export type DouyinUserVideo = {
  awemeId: string;
  shareUrl: string;
  desc: string;
  createTime: number; // epoch seconds
};

export type DouyinUserListing = {
  secUid: string;
  nickname: string;
  videos: DouyinUserVideo[];
};

// Tách URL http(s) đầu tiên từ tin chia sẻ lộn xộn (vd tin "长按复制... https://v.douyin.com/xxx/ ...").
export function extractFirstUrl(text: string): string {
  return (text || '').match(/https?:\/\/[^\s'"<>]+/)?.[0] || '';
}

async function runDouyinUserFetch(arg: string): Promise<DouyinUserListing> {
  const settings = getSourceDownloadSettings();
  const { stdout, stderr } = await execFileAsync(
    settings.dockerBin,
    ['exec', settings.douyinContainer, 'python', '/app/app/douyin_user_fetch.py', arg],
    { timeout: 900000, maxBuffer: 1024 * 1024 * 40 }
  );
  const output = stdout.trim() || stderr.trim();
  const body = JSON.parse(output);

  if (body.ok === false) throw new Error(body.error || 'Douyin user fetch thất bại');

  const videos: DouyinUserVideo[] = (body.videos || [])
    .map((v: any) => ({
      awemeId: String(v.aweme_id || v.awemeId || ''),
      shareUrl: String(v.share_url || v.shareUrl || ''),
      desc: String(v.desc || v.title || ''),
      createTime: Number(v.create_time || v.createTime || 0),
    }))
    .filter((v: DouyinUserVideo) => v.awemeId && v.shareUrl)
    // Mới nhất trước.
    .sort((a: DouyinUserVideo, b: DouyinUserVideo) => b.createTime - a.createTime);

  return {
    secUid: String(body.sec_uid || body.secUid || ''),
    nickname: String(body.nickname || body.user?.nickname || '').trim(),
    videos,
  };
}

// Liệt kê video user. Input là link profile (share/clean) hoặc sec_uid.
export async function listDouyinUserVideos(input: { url?: string; secUid?: string }): Promise<DouyinUserListing> {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader đang bị tắt');

  const arg = (input.secUid || extractFirstUrl(input.url || '') || input.url || '').trim();
  if (!arg) throw new Error('Thiếu link user hoặc sec_uid');

  return withDownloadLock(() => runDouyinUserFetch(arg));
}
