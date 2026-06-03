import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type FacebookBrowserPublishResult = {
  status: 'PUBLISHED' | 'LOGIN_REQUIRED' | 'ERROR';
  message: string;
  externalPostId?: string;
  publishedUrl?: string;
  metadata?: Record<string, unknown>;
};

export async function publishFacebookViaBrowser(input: {
  cdpUrl: string;
  caption: string;
  mediaPaths: string[];
}): Promise<FacebookBrowserPublishResult> {
  const runnerPath = path.join(process.cwd(), 'src/server/facebook-publish-runner.ts');
  const tsxPath = path.join(process.cwd(), 'node_modules/.bin/tsx');
  const captionBase64 = Buffer.from(input.caption || '', 'utf8').toString('base64');
  const mediaBase64 = Buffer.from(JSON.stringify(input.mediaPaths || []), 'utf8').toString('base64');
  let stdout = '';

  try {
    const result = await execFileAsync(
      tsxPath,
      [runnerPath, `--cdpUrl=${input.cdpUrl}`, `--captionBase64=${captionBase64}`, `--mediaBase64=${mediaBase64}`],
      { timeout: Number(process.env.FACEBOOK_BROWSER_PUBLISH_TIMEOUT_MS || 180000), maxBuffer: 1024 * 1024 * 2 }
    );

    stdout = result.stdout;
  } catch (error: any) {
    stdout = String(error?.stdout || '');

    if (!stdout) throw error;
  }

  return JSON.parse(stdout) as FacebookBrowserPublishResult;
}
