import { spawn } from 'node:child_process';
// settings
import { getSourceDownloadSettings } from './source-download-settings';
import { hostToContainer, containerToHost } from './bot-media-path';

// ----------------------------------------------------------------------
// Nối nhiều video thành 1 file: gọi /app/app/video_concat.py trong container bot
// (đã có ffmpeg + mount gami-post-media). Trả host path của file đã nối.

const CONCAT_TIMEOUT_MS = 30 * 60_000;

export type ConcatResult = {
  outputHostPath: string;
  count: number;
  duration: number;
};

// Khung video nối -> kích thước chuẩn hoá (chiều rộng nhỏ nhất 1080).
export type ConcatAspectRatio = '16:9' | '9:16' | '1:1' | '3:4';

const ASPECT_DIMENSIONS: Record<ConcatAspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
};

export function resolveConcatDimensions(aspect?: ConcatAspectRatio): { width: number; height: number } {
  return ASPECT_DIMENSIONS[aspect || '9:16'] || ASPECT_DIMENSIONS['9:16'];
}

function runConcatProcess(dockerBin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, args, { env: process.env });

    let stdout = '';
    let stderrTail = '';
    let stderrBuf = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Nối video timeout (30 phút)'));
    }, CONCAT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.replace(/^\[concat\]\s*/, '').trim();
        if (line) stderrTail = line;
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderrTail || `Nối video thất bại (exit ${code})`));
    });
  });
}

// Nối các video (host paths, đã nằm dưới dataRoot) -> ghi ra hostOutputPath.
export async function concatVideos(
  hostInputPaths: string[],
  hostOutputPath: string,
  opts?: { aspectRatio?: ConcatAspectRatio }
): Promise<ConcatResult> {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader/bot đang bị tắt');
  if (hostInputPaths.length < 2) throw new Error('Cần ít nhất 2 video để nối');

  const outContainer = hostToContainer(hostOutputPath);
  const inContainers = hostInputPaths.map((p) => hostToContainer(p));
  const { width, height } = resolveConcatDimensions(opts?.aspectRatio);

  const stdout = await runConcatProcess(settings.dockerBin, [
    'exec',
    '-e',
    `CONCAT_TARGET_W=${width}`,
    '-e',
    `CONCAT_TARGET_H=${height}`,
    settings.douyinContainer,
    'python',
    '/app/app/video_concat.py',
    outContainer,
    ...inContainers,
  ]);

  const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
  const body = JSON.parse(lastLine);

  if (body.ok === false) throw new Error(body.error || 'Nối video thất bại');

  return {
    outputHostPath: containerToHost(String(body.output)),
    count: Number(body.count || hostInputPaths.length),
    duration: Number(body.duration || 0),
  };
}
