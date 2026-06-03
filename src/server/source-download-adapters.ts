import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// settings
import { getSourceDownloadSettings } from './source-download-settings';

const execFileAsync = promisify(execFile);

export type SourcePlatform = 'auto' | 'xiaohongshu' | 'douyin';

export type NormalizedSourceDownload = {
  ok: boolean;
  platform: 'xiaohongshu' | 'douyin';
  jobId: string;
  sourceUrl: string;
  resolvedUrl?: string;
  title: string;
  captionRaw: string;
  contentType: 'video' | 'image' | 'mixed';
  files: Array<{ containerPath: string; hostPath: string; fileName: string; mimeType: string; size?: number }>;
  jobDir?: string;
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

  return {
    ok: Boolean(raw.ok ?? true),
    platform,
    jobId: String(raw.job_id || raw.jobId || `${platform}_${Date.now()}`),
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

async function downloadFromXhs(url: string) {
  const settings = getSourceDownloadSettings();
  const { stdout, stderr } = await execFileAsync(
    settings.dockerBin,
    ['exec', settings.douyinContainer, 'python', '/app/app/xhs_fetch.py', url],
    { timeout: 900000, maxBuffer: 1024 * 1024 * 20 }
  );
  const output = stdout.trim() || stderr.trim();
  const body = JSON.parse(output);

  if (body.ok === false) throw new Error(body.error || 'XHS downloader thất bại');
  return normalize(body, url, 'xiaohongshu');
}

async function downloadFromDouyin(url: string) {
  const settings = getSourceDownloadSettings();
  const { stdout, stderr } = await execFileAsync(
    settings.dockerBin,
    ['exec', settings.douyinContainer, 'python', '/app/app/douyin_fetch.py', url],
    { timeout: 900000, maxBuffer: 1024 * 1024 * 20 }
  );
  const output = stdout.trim() || stderr.trim();
  const body = JSON.parse(output);

  if (body.ok === false) throw new Error(body.error || 'Douyin downloader thất bại');
  return normalize(body, url, 'douyin');
}

export async function downloadSourceContent(input: { url: string; platform?: SourcePlatform }) {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader đang bị tắt');

  const platform = input.platform && input.platform !== 'auto' ? input.platform : detectSourcePlatform(input.url);
  if (platform === 'xiaohongshu') return downloadFromXhs(input.url);
  if (platform === 'douyin') return downloadFromDouyin(input.url);

  throw new Error('Platform nguồn chưa được hỗ trợ');
}
