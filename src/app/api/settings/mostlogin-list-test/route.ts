import { NextResponse } from 'next/server';
// auth
import { requireRole } from 'src/lib/api-auth';
// server
import { listMostLoginProfiles } from 'src/server/device-adapters';
import { getMostLoginConfig, mostLoginAuthHeaders } from 'src/server/provider-settings';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

function compact(value: unknown) {
  const parsed = JSON.parse(JSON.stringify(value));

  return Array.isArray(parsed) ? parsed.slice(0, 3) : parsed;
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const config = await getMostLoginConfig();

  if (!config.apiKey) {
    return NextResponse.json({ message: 'MOSTLOGIN_API_KEY chưa được cấu hình' }, { status: 400 });
  }

  try {
    const response = await fetch(`${config.baseUrl}${config.listProfilesPath}`, {
      method: config.listProfilesMethod,
      headers: mostLoginAuthHeaders(config),
      body: config.listProfilesMethod === 'POST' ? JSON.stringify({ page: 1, pageSize: 5, limit: 5 }) : undefined,
    });
    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          message: `MostLogin trả HTTP ${response.status}`,
          data: {
            status: response.status,
            baseUrl: config.baseUrl,
            path: config.listProfilesPath,
            method: config.listProfilesMethod,
            rawPreview: raw,
          },
        },
        { status: 400 }
      );
    }

    const profiles = await listMostLoginProfiles();

    return NextResponse.json({
      message: `Đọc được ${profiles.length} profiles`,
      data: {
        status: response.status,
        baseUrl: config.baseUrl,
        path: config.listProfilesPath,
        method: config.listProfilesMethod,
        count: profiles.length,
        normalizedPreview: profiles.slice(0, 3),
        rawPreview: compact(Array.isArray(raw) ? raw : raw?.data || raw?.list || raw?.profiles || raw?.items || raw),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Không thể test list profiles' },
      { status: 400 }
    );
  }
}
