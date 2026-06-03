import { NextResponse } from 'next/server';
// auth
import { requireRole } from 'src/lib/api-auth';
// server
import { getMostLoginConfig, mostLoginAuthHeaders } from 'src/server/provider-settings';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const config = await getMostLoginConfig();

  if (!config.apiKey) {
    return NextResponse.json(
      {
        message: 'MOSTLOGIN_API_KEY chưa được cấu hình trong quản trị hoặc .env',
        data: { ok: false, baseUrl: config.baseUrl },
      },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${config.baseUrl}${config.listProfilesPath}`, {
      method: config.listProfilesMethod,
      headers: mostLoginAuthHeaders(config),
      body: config.listProfilesMethod === 'POST' ? JSON.stringify({ page: 1, pageSize: 1 }) : undefined,
    });

    return NextResponse.json({
      data: {
        ok: response.ok,
        status: response.status,
        baseUrl: config.baseUrl,
        listProfilesPath: config.listProfilesPath,
        listProfilesMethod: config.listProfilesMethod,
      },
      message: response.ok ? 'MostLogin connection OK' : `MostLogin trả HTTP ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Không thể kết nối MostLogin Local API',
        data: { ok: false, baseUrl: config.baseUrl },
      },
      { status: 400 }
    );
  }
}
