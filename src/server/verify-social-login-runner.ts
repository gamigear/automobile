import { chromium } from 'playwright-core';

type Platform = 'FACEBOOK' | 'INSTAGRAM';

type VerificationResult = {
  status: 'VERIFIED' | 'LOGIN_REQUIRED' | 'ERROR';
  platform: Platform;
  detectedAccountName?: string;
  detectedAccountUrl?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));

  return match ? match.slice(prefix.length) : '';
}

function cleanDetectedTitle(title: string) {
  const cleaned = title
    .replace(/\|\s*Facebook.*$/i, '')
    .replace(/\|\s*Instagram.*$/i, '')
    .replace(/\s*•\s*Instagram.*$/i, '')
    .replace(/^\(\d+\)\s*/, '')
    .trim();

  if (/^(facebook|instagram)$/i.test(cleaned)) return '';

  return cleaned;
}

async function readDetectedAccountName(page: any) {
  const values = await page
    .evaluate(() => {
      const read = (selector: string, attr?: string) => {
        const element = document.querySelector(selector);

        if (!element) return '';

        return attr ? element.getAttribute(attr) || '' : element.textContent || '';
      };

      return [
        read('meta[property="og:title"]', 'content'),
        read('meta[name="twitter:title"]', 'content'),
        read('h1'),
        read('[role="main"] h1'),
        document.title,
      ];
    })
    .catch(() => []);

  const candidates = Array.isArray(values) ? values : [];
  const detectedName = candidates.map((candidate) => cleanDetectedTitle(String(candidate || ''))).find(Boolean);

  return detectedName || '';
}

function fallbackNameFromUrl(url: string, platform: Platform) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const reserved = new Set([
      'me',
      'profile.php',
      'login',
      'checkpoint',
      'accounts',
      'stories',
      'reel',
      'reels',
      'watch',
      'marketplace',
    ]);
    const slug = parsed.pathname.split('/').filter(Boolean)[0] || '';

    if (platform === 'FACEBOOK' && !host.includes('facebook.com')) return '';
    if (platform === 'INSTAGRAM' && !host.includes('instagram.com')) return '';
    if (!slug || reserved.has(slug.toLowerCase())) return '';

    return slug;
  } catch {
    return '';
  }
}

function loginRequired(url: string, title: string) {
  const normalizedUrl = url.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  return (
    normalizedUrl.includes('/login') ||
    normalizedUrl.includes('/checkpoint') ||
    normalizedUrl.includes('/accounts/login') ||
    normalizedTitle.includes('log in') ||
    normalizedTitle.includes('login') ||
    normalizedTitle.includes('đăng nhập')
  );
}

function targetUrlFor(platform: Platform) {
  if (platform === 'FACEBOOK') return 'https://www.facebook.com/me';

  return 'https://www.instagram.com/accounts/edit/';
}

async function verify(): Promise<VerificationResult> {
  const cdpUrl = argValue('cdpUrl');
  const platform = (argValue('platform') || 'FACEBOOK') as Platform;

  if (!cdpUrl) {
    return {
      status: 'ERROR',
      platform,
      message: 'Thiếu CDP endpoint để verify profile',
    };
  }

  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    const targetUrl = targetUrlFor(platform);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    const url = page.url();
    const title = await page.title().catch(() => '');

    if (loginRequired(url, title)) {
      return {
        status: 'LOGIN_REQUIRED',
        platform,
        detectedAccountUrl: url,
        message: 'Profile chưa đăng nhập hoặc đang bị checkpoint',
        metadata: { url, title, targetUrl },
      };
    }

    const detectedAccountName = (await readDetectedAccountName(page)) || fallbackNameFromUrl(url, platform);

    if (!detectedAccountName) {
      return {
        status: 'ERROR',
        platform,
        detectedAccountUrl: url,
        message: 'Không đọc được tên Social Account từ profile đang đăng nhập',
        metadata: { url, title, targetUrl },
      };
    }

    return {
      status: 'VERIFIED',
      platform,
      detectedAccountName,
      detectedAccountUrl: url,
      message: 'Đã verify trực tiếp Social Account đang đăng nhập trong profile',
      metadata: { url, title, targetUrl },
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

verify()
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
  })
  .catch((error) => {
    const result: VerificationResult = {
      status: 'ERROR',
      platform: ((argValue('platform') || 'FACEBOOK') as Platform),
      message: error instanceof Error ? error.message : 'Verify trực tiếp thất bại',
      metadata: { error: String(error) },
    };

    process.stdout.write(JSON.stringify(result));
    process.exitCode = 1;
  });
