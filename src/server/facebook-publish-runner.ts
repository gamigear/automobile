import { chromium } from 'playwright-core';

type PublishResult = {
  status: 'PUBLISHED' | 'LOGIN_REQUIRED' | 'ERROR';
  message: string;
  externalPostId?: string;
  publishedUrl?: string;
  metadata?: Record<string, unknown>;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));

  return match ? match.slice(prefix.length) : '';
}

function loginRequired(url: string, title: string) {
  const normalizedUrl = url.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  return (
    normalizedUrl.includes('/login') ||
    normalizedUrl.includes('/checkpoint') ||
    normalizedTitle.includes('log in') ||
    normalizedTitle.includes('login') ||
    normalizedTitle.includes('đăng nhập')
  );
}

async function clickFirstVisible(page: any, locators: any[], timeout = 5000) {
  for (const locator of locators) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout });
      await locator.first().click({ timeout });
      return true;
    } catch {
      // Try next locator.
    }
  }

  return false;
}

async function domClickButtonByText(page: any, pattern: string) {
  return page
    .evaluate((source: string) => {
      const regex = new RegExp(source, 'i');
      const buttons = Array.from(document.querySelectorAll('[role="button"], button')) as HTMLElement[];
      const button = buttons.find((element) => {
        const text = (element.textContent || '').trim();
        const aria = element.getAttribute('aria-label') || '';
        const disabled = element.getAttribute('aria-disabled') === 'true' || (element as HTMLButtonElement).disabled;

        return !disabled && (regex.test(text) || regex.test(aria));
      });

      if (!button) return false;

      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
      return true;
    }, pattern)
    .catch(() => false);
}

async function domClickExactButton(page: any, labels: string[]) {
  return page
    .evaluate((inputLabels: string[]) => {
      const normalizedLabels = inputLabels.map((label) => label.toLowerCase());
      const buttons = Array.from(document.querySelectorAll('[role="button"], button')) as HTMLElement[];
      const button = buttons.find((element) => {
        const text = (element.textContent || '').trim().toLowerCase();
        const aria = (element.getAttribute('aria-label') || '').trim().toLowerCase();
        const disabled = element.getAttribute('aria-disabled') === 'true' || (element as HTMLButtonElement).disabled;

        return !disabled && (normalizedLabels.includes(text) || normalizedLabels.includes(aria));
      });

      if (!button) return false;

      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
      return true;
    }, labels)
    .catch(() => false);
}

async function domClickComposerEntry(page: any) {
  return page
    .evaluate(() => {
      const regex = /Bạn đang nghĩ gì|What's on your mind|Tạo bài viết|Create post/i;
      const elements = Array.from(document.querySelectorAll('span, div, [role="button"], button')) as HTMLElement[];
      const element = elements.find((item) => regex.test((item.textContent || '').trim()) || regex.test(item.getAttribute('aria-label') || ''));

      if (!element) return false;

      const button = (element.closest('[role="button"], button') || element) as HTMLElement;

      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
      return true;
    })
    .catch(() => false);
}

async function clickFacebookPostButton(page: any) {
  const dialog = page.locator('[role="dialog"]').first();
  for (let index = 0; index < 2; index += 1) {
    const clickedNext =
      (await clickFirstVisible(page, [
        dialog.getByRole('button', { name: /^(Tiếp|Next)$/i }),
        dialog.locator('[role="button"]').filter({ hasText: /^Tiếp$|^Next$/i }),
      ], 3000)) || (await domClickButtonByText(page, '^(Tiếp|Next)$'));

    if (!clickedNext) break;

    await page.waitForTimeout(3500);
  }

  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    const clicked = (await domClickExactButton(page, ['Đăng', 'Post', 'Chia sẻ', 'Share'])) || await clickFirstVisible(page, [
      dialog.getByRole('button', { name: /^(Đăng|Post|Chia sẻ|Share)$/i }),
      dialog.locator('[role="button"][aria-label*="Đăng"], [role="button"][aria-label*="Post"], [role="button"][aria-label*="Share"]'),
      page.getByRole('button', { name: /^(Đăng|Post|Chia sẻ|Share)$/i }),
    ], 3000);

    if (clicked) return true;

    await page.waitForTimeout(1500);
  }

  const buttonTexts = await dialog
    .locator('[role="button"]')
    .evaluateAll((elements: any[]) => elements.map((element) => ({
      text: (element.textContent || '').trim(),
      ariaLabel: element.getAttribute('aria-label') || '',
      ariaDisabled: element.getAttribute('aria-disabled') || '',
    })).slice(-12))
    .catch(() => []);

  throw new Error(`Không tìm thấy nút Đăng/Post trong composer. Buttons: ${JSON.stringify(buttonTexts)}`);
}

async function findComposer(page: any) {
  const existingDialog = page.locator('[role="dialog"]').first();
  if (await existingDialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(800);
    await clickFirstVisible(page, [
      page.getByRole('button', { name: /Đóng|Close|Hủy|Cancel/i }),
      page.locator('[role="dialog"] [aria-label*="Đóng"], [role="dialog"] [aria-label*="Close"]'),
    ], 1500).catch(() => undefined);
    await page.waitForTimeout(1200);
  }

  const opened =
    (await clickFirstVisible(page, [
      page.getByRole('button', { name: /Bạn đang nghĩ gì|What's on your mind|Tạo bài viết|Create post/i }),
      page.locator('[role="button"]').filter({ hasText: /Bạn đang nghĩ gì|What's on your mind|Tạo bài viết|Create post/i }),
    ], 6000)) || (await domClickComposerEntry(page));

  if (!opened) throw new Error('Không mở được khung tạo bài viết Facebook');

  await page.waitForTimeout(2500);

  const textbox = page
    .locator(
      [
        '[role="dialog"] [role="textbox"]',
        '[role="dialog"] [contenteditable="true"]',
        '[aria-label*="Bạn đang nghĩ gì"]',
        "[aria-label*=\"What's on your mind\"]",
        '[contenteditable="true"]',
      ].join(', ')
    )
    .first();

  try {
    await textbox.waitFor({ state: 'visible', timeout: 15000 });
  } catch (error) {
    const debug = await page
      .evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"]')).map((element) => ({
          text: (element.textContent || '').slice(0, 80),
          ariaLabel: element.getAttribute('aria-label') || '',
          role: element.getAttribute('role') || '',
        }));

        return {
          url: location.href,
          title: document.title,
          dialogText: (dialog?.textContent || '').slice(0, 500),
          editables,
        };
      })
      .catch(() => null);

    throw new Error(`Không tìm thấy ô nhập nội dung Facebook composer: ${JSON.stringify(debug)}`);
  }

  return textbox;
}

async function uploadMedia(page: any, mediaPaths: string[]) {
  if (!mediaPaths.length) return;

  await clickFirstVisible(page, [
    page.getByRole('button', { name: /Ảnh\/video|Photo\/video|Photo|Video/i }),
    page.locator('[role="dialog"] [aria-label*="Ảnh"], [role="dialog"] [aria-label*="Photo"]'),
  ], 4000).catch(() => undefined);

  const input = page.locator('[role="dialog"] input[type="file"], input[type="file"]').first();
  await input.setInputFiles(mediaPaths, { timeout: 30000 });
  await page.waitForTimeout(5000);
}

async function publish(): Promise<PublishResult> {
  const cdpUrl = argValue('cdpUrl');
  const caption = Buffer.from(argValue('captionBase64'), 'base64').toString('utf8');
  const mediaPaths = JSON.parse(Buffer.from(argValue('mediaBase64') || 'W10=', 'base64').toString('utf8')) as string[];

  if (!cdpUrl) return { status: 'ERROR', message: 'Thiếu CDP endpoint để đăng Facebook' };
  if (!caption.trim() && !mediaPaths.length) return { status: 'ERROR', message: 'Bài đăng không có nội dung hoặc media' };

  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = await context.newPage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(800);

    const url = page.url();
    const title = await page.title().catch(() => '');

    if (loginRequired(url, title)) {
      return { status: 'LOGIN_REQUIRED', message: 'Facebook profile chưa đăng nhập hoặc đang checkpoint', metadata: { url, title } };
    }

    const textbox = await findComposer(page);
    await textbox.click();
    await page.keyboard.insertText(caption);
    await uploadMedia(page, mediaPaths);
    await clickFacebookPostButton(page);

    await page.waitForTimeout(8000);

    const dialogVisible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);

    if (dialogVisible) {
      const disabledPostButton = await page
        .locator('[role="dialog"] [role="button"][aria-disabled="true"]')
        .filter({ hasText: /^Đăng$|^Post$/i })
        .count()
        .catch(() => 0);

      if (disabledPostButton) {
        return { status: 'ERROR', message: 'Facebook chưa cho đăng: nút Post đang disabled', metadata: { url: page.url() } };
      }
    }

    return {
      status: 'PUBLISHED',
      message: 'Đã gửi bài đăng lên Facebook qua browser profile',
      externalPostId: `facebook-browser:${Date.now()}`,
      publishedUrl: page.url(),
      metadata: { url: page.url(), mediaCount: mediaPaths.length },
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

publish()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stdout.write(
      JSON.stringify({
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Đăng Facebook thất bại',
        metadata: { error: String(error) },
      } satisfies PublishResult)
    );
    process.exitCode = 1;
  });
