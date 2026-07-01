import { signAccessToken } from 'src/lib/auth-token';
// config
import { getTelegramConfig } from './config';

// ----------------------------------------------------------------------
// Client gọi API nội bộ Gami với quyền admin (bot thay mặt admin thao tác).

export function adminToken(): string {
  return signAccessToken({
    sub: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@gami.local',
    name: 'Admin',
    role: 'ADMIN',
  });
}

type ApiResult = { ok: boolean; status: number; data?: any; message?: string };

async function call(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const cfg = await getTelegramConfig();
  try {
    const response = await fetch(`${cfg.appBaseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));

    return { ok: response.ok, status: response.status, data: json.data, message: json.message };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : 'Network error' };
  }
}

export function listAccounts() {
  return call('GET', '/api/accounts/');
}

export function getSettings() {
  return call('GET', '/api/settings/');
}

export function listDeviceAccounts(deviceId: string) {
  return call('GET', `/api/devices/${deviceId}/accounts/`);
}

export function listPosts(accountId: string) {
  return call('GET', `/api/accounts/${accountId}/posts/`);
}

export function getPost(accountId: string, postId: string) {
  return call('GET', `/api/accounts/${accountId}/posts/${postId}/`);
}

export function getImport(accountId: string, importId: string) {
  return call('GET', `/api/accounts/${accountId}/source-imports/${importId}/`);
}

export function createImport(accountId: string, url: string, platform: string) {
  return call('POST', `/api/accounts/${accountId}/source-imports/`, { url, platform });
}

export function schedulePost(accountId: string, postId: string, scheduledAt: string) {
  return call('PATCH', `/api/accounts/${accountId}/posts/${postId}/`, { status: 'SCHEDULED', scheduledAt });
}

export function approvePost(accountId: string, postId: string) {
  return call('PATCH', `/api/accounts/${accountId}/posts/${postId}/`, { status: 'APPROVED' });
}

export function editCaption(accountId: string, postId: string, caption: string) {
  return call('PATCH', `/api/accounts/${accountId}/posts/${postId}/`, { caption });
}

export function deletePost(accountId: string, postId: string) {
  return call('DELETE', `/api/accounts/${accountId}/posts/${postId}/`);
}

export function publishPost(accountId: string, postId: string) {
  return call('POST', `/api/accounts/${accountId}/posts/${postId}/publish-android/`, {});
}
