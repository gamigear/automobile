import { spawn } from 'node:child_process';
// settings
import { getSourceDownloadSettings } from './source-download-settings';
import { getTranslateConfig } from './translate-config';
import { hostToContainer, containerToHost, containerReachable } from './bot-media-path';
import { updateVietsubProgress, type VietsubPhase } from './vietsub-progress';

// ----------------------------------------------------------------------
// Lồng tiếng tiếng Việt: gọi /app/app/video_dub.py trong container bot.
// Tái dụng ASR + dịch của vietsub; thêm edge-tts + ghép giọng (ducking).

const DUB_TIMEOUT_MS = 30 * 60_000;

export type DubResult = { outputHostPath: string; segments: number; duration: number };

export type DubVoice = 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural';

// Map dòng log [dub] (stderr) -> phase + nhãn UI.
function parseProgressLine(line: string): { phase: VietsubPhase; label: string } | null {
  if (line.includes('Load whisper model')) return { phase: 'loading_model', label: 'Đang tải mô hình nhận dạng…' };
  if (line.includes('nhận dạng giọng nói')) return { phase: 'transcribing', label: 'Đang nhận dạng giọng nói…' };
  if (line.includes('Dịch') && line.includes('câu')) return { phase: 'translating', label: 'Đang dịch sang tiếng Việt…' };
  if (line.includes('Tổng hợp giọng')) return { phase: 'synthesizing', label: 'Đang tổng hợp giọng đọc…' };
  if (line.includes('Ghép giọng')) return { phase: 'muxing', label: 'Đang ghép giọng vào video…' };
  if (line.includes('Hoàn tất')) return { phase: 'done', label: 'Hoàn tất.' };

  return null;
}

function runDubProcess(dockerBin: string, args: string[], postId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, args, { env: process.env });

    let stdout = '';
    let stderrTail = '';
    let stderrBuf = '';
    let segments = 0;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Lồng tiếng timeout (30 phút)'));
    }, DUB_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.replace(/^\[dub\]\s*/, '').trim();
        if (!line) continue;
        stderrTail = line;
        if (!postId) continue;

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
      else reject(new Error(stderrTail || `Lồng tiếng thất bại (exit ${code})`));
    });
  });
}

export async function dubVideo(
  hostVideoPath: string,
  postId?: string,
  opts?: { voice?: DubVoice; burnSub?: boolean; contextHint?: string }
): Promise<DubResult> {
  const settings = getSourceDownloadSettings();
  if (!settings.enabled) throw new Error('Source downloader/bot đang bị tắt');

  const containerPath = hostToContainer(hostVideoPath);
  const model = process.env.VIETSUB_WHISPER_MODEL || 'medium';
  const voice = opts?.voice || 'vi-VN-HoaiMyNeural';
  const burnSub = opts?.burnSub ? '1' : '0';
  const contextHint = (opts?.contextHint || '').trim();

  const translateConfig = await getTranslateConfig();

  const stdout = await runDubProcess(
    settings.dockerBin,
    [
      'exec',
      '-e', `VIETSUB_TRANSLATE_BASE_URL=${containerReachable(translateConfig.baseUrl)}`,
      '-e', `VIETSUB_TRANSLATE_API_KEY=${translateConfig.apiKey}`,
      '-e', `VIETSUB_TRANSLATE_MODEL=${translateConfig.model}`,
      '-e', `VIETSUB_CONTEXT_HINT=${contextHint}`,
      '-e', `DUB_VOICE=${voice}`,
      '-e', `DUB_BURN_SUB=${burnSub}`,
      settings.douyinContainer,
      'python',
      '/app/app/video_dub.py',
      containerPath,
      '--model',
      model,
    ],
    postId
  );

  const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
  const body = JSON.parse(lastLine);

  if (body.ok === false) throw new Error(body.error || 'Lồng tiếng thất bại');

  return {
    outputHostPath: containerToHost(String(body.output)),
    segments: Number(body.segments || 0),
    duration: Number(body.duration || 0),
  };
}
