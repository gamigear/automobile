import path from 'node:path';
import { spawn } from 'node:child_process';
// settings
import { getSourceDownloadSettings } from './source-download-settings';
import { getTranslateConfig } from './translate-config';
import { updateVietsubProgress, type VietsubPhase } from './vietsub-progress';

const VIETSUB_TIMEOUT_MS = 30 * 60_000;

// Map dòng log [vietsub] (stderr) -> phase + nhãn UI. Trả null nếu dòng không đổi phase.
function parseProgressLine(line: string): { phase: VietsubPhase; label: string } | null {
  if (line.includes('Load whisper model')) return { phase: 'loading_model', label: 'Đang tải mô hình nhận dạng…' };
  if (line.includes('nhận dạng giọng nói')) return { phase: 'transcribing', label: 'Đang nhận dạng giọng nói…' };
  if (line.includes('Dịch') && line.includes('câu')) return { phase: 'translating', label: 'Đang dịch phụ đề sang tiếng Việt…' };
  if (line.includes('Burn phụ đề')) return { phase: 'burning', label: 'Đang ghép phụ đề vào video…' };
  if (line.includes('Hoàn tất')) return { phase: 'done', label: 'Hoàn tất.' };

  return null;
}

// Chạy docker exec qua spawn, đọc stderr theo dòng để cập nhật tiến trình (postId), trả stdout (JSON cuối).
function runVietsubProcess(
  dockerBin: string,
  args: string[],
  postId?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, args, { env: process.env });

    let stdout = '';
    let stderrTail = '';
    let segments = 0;
    let stderrBuf = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Vietsub timeout (30 phút)'));
    }, VIETSUB_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || ''; // giữ phần chưa trọn dòng
      for (const raw of lines) {
        // Bỏ tiền tố "[vietsub] " do script python thêm vào mỗi dòng log.
        const line = raw.replace(/^\[vietsub\]\s*/, '').trim();
        if (!line) continue;
        stderrTail = line;
        if (!postId) continue;

        // Đếm câu nhận dạng: dòng dạng "[12.3s] text".
        if (/^\[\d+(\.\d+)?s\]/.test(line)) {
          segments += 1;
          updateVietsubProgress(postId, { segments, label: `Đang nhận dạng giọng nói… (${segments} câu)` });
          continue;
        }

        const parsed = parseProgressLine(line);
        if (parsed) updateVietsubProgress(postId, parsed);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderrTail || `Vietsub thất bại (exit ${code})`));
    });
  });
}

// ----------------------------------------------------------------------
// Vietsub video: gọi script bot /app/app/video_vietsub.py (faster-whisper ASR tiếng Trung
// -> dịch ZH->VI qua LLM endpoint -> ffmpeg burn .ass). Trả file mp4 mới (host path).

export type VietsubResult = {
  outputHostPath: string;
  srtHostPath?: string;
  segments: number;
  duration: number;
};

// host path (dưới dataRoot) -> path container thấy (/data/...). Ngược lại của mapContainerPathToHostPath.
function hostToContainer(hostPath: string): string {
  const { dataRoot } = getSourceDownloadSettings();
  const root = path.resolve(dataRoot);
  const resolved = path.resolve(hostPath);
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    return `/data/${resolved.slice(root.length).replace(/^[/\\]+/, '')}`.replace(/\\/g, '/');
  }

  return hostPath; // ngoài dataRoot -> để nguyên (script có thể không thấy)
}

function containerToHost(containerPath: string): string {
  const { dataRoot } = getSourceDownloadSettings();
  if (containerPath.startsWith('/data/')) {
    return path.join(dataRoot, containerPath.replace(/^\/data\//, ''));
  }

  return containerPath;
}

// Đổi localhost/127.0.0.1 -> host.docker.internal để container gọi được service dịch trên host.
function containerReachable(url: string): string {
  return (url || '').replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
}

export async function vietsubVideo(hostVideoPath: string, postId?: string): Promise<VietsubResult> {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader/bot đang bị tắt');

  const containerPath = hostToContainer(hostVideoPath);
  const model = process.env.VIETSUB_WHISPER_MODEL || 'small';

  // Cấu hình API/model dịch từ Settings (AppSetting) + env fallback.
  const translateConfig = await getTranslateConfig();

  const env = {
    VIETSUB_TRANSLATE_BASE_URL: containerReachable(translateConfig.baseUrl),
    VIETSUB_TRANSLATE_API_KEY: translateConfig.apiKey,
    VIETSUB_TRANSLATE_MODEL: translateConfig.model,
  };

  const stdout = await runVietsubProcess(
    settings.dockerBin,
    [
      'exec',
      '-e',
      `VIETSUB_TRANSLATE_BASE_URL=${env.VIETSUB_TRANSLATE_BASE_URL}`,
      '-e',
      `VIETSUB_TRANSLATE_API_KEY=${env.VIETSUB_TRANSLATE_API_KEY}`,
      '-e',
      `VIETSUB_TRANSLATE_MODEL=${env.VIETSUB_TRANSLATE_MODEL}`,
      settings.douyinContainer,
      'python',
      '/app/app/video_vietsub.py',
      containerPath,
      '--model',
      model,
    ],
    postId
  );

  // Dòng JSON cuối là kết quả (stderr là log tiến trình).
  const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
  const body = JSON.parse(lastLine);

  if (body.ok === false) throw new Error(body.error || 'Vietsub thất bại');

  return {
    outputHostPath: containerToHost(String(body.output)),
    srtHostPath: body.srt ? containerToHost(String(body.srt)) : undefined,
    segments: Number(body.segments || 0),
    duration: Number(body.duration || 0),
  };
}
