import { NextResponse } from 'next/server';
import { z } from 'zod';
// db
import { prisma } from 'src/lib/prisma';
import { requireRole } from 'src/lib/api-auth';

// ----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

const SettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  approvalRequiredByDefault: z.boolean().optional(),
  approverRole: z.enum(['ADMIN', 'APPROVER']).optional(),
  defaultScheduleSlots: z.array(z.string().min(1)).optional(),
  mostLoginApiBaseUrl: z.string().url().optional(),
  mostLoginApiKey: z.string().optional(),
  mostLoginAuthHeaderName: z.string().min(1).optional(),
  mostLoginAuthHeaderPrefix: z.string().optional(),
  mostLoginListProfilesPath: z.string().min(1).optional(),
  mostLoginListProfilesMethod: z.enum(['GET', 'POST']).optional(),
  mostLoginDetailProfilePath: z.string().min(1).optional(),
  mostLoginOpenProfilePath: z.string().min(1).optional(),
  mostLoginCloseProfilePath: z.string().min(1).optional(),
});

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      data: {
        timezone: 'Asia/Ho_Chi_Minh',
        approvalRequiredByDefault: true,
        defaultScheduleSlots: ['09:00', '12:00', '20:00'],
        mostLoginApiBaseUrl: process.env.MOSTLOGIN_API_BASE_URL || 'http://127.0.0.1:30898',
        mostLoginApiKeyConfigured: Boolean(process.env.MOSTLOGIN_API_KEY),
        mostLoginAuthHeaderName: process.env.MOSTLOGIN_AUTH_HEADER_NAME || 'Authorization',
        mostLoginAuthHeaderPrefix: process.env.MOSTLOGIN_AUTH_HEADER_PREFIX || '',
        mostLoginListProfilesPath: process.env.MOSTLOGIN_LIST_PROFILES_PATH || '/api/profile/getProfiles',
        mostLoginListProfilesMethod: process.env.MOSTLOGIN_LIST_PROFILES_METHOD || 'POST',
        mostLoginDetailProfilePath: process.env.MOSTLOGIN_DETAIL_PROFILE_PATH || '/api/profile/detail',
        mostLoginOpenProfilePath: process.env.MOSTLOGIN_OPEN_PROFILE_PATH || '/api/browser/openBrowser',
        mostLoginCloseProfilePath: process.env.MOSTLOGIN_CLOSE_PROFILE_PATH || '/api/browser/closeProfiles',
      },
    });
  }

  const settings = await prisma.appSetting.findMany();
  const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));

  return NextResponse.json({
    data: {
      timezone: map.timezone || 'Asia/Ho_Chi_Minh',
      approvalRequiredByDefault: map.approvalRequiredByDefault ?? true,
      defaultScheduleSlots: map.defaultScheduleSlots || ['09:00', '12:00', '20:00'],
      mostLoginApiBaseUrl: map.mostLoginApiBaseUrl || process.env.MOSTLOGIN_API_BASE_URL || 'http://127.0.0.1:30898',
      mostLoginApiKeyConfigured: Boolean(map.mostLoginApiKey || process.env.MOSTLOGIN_API_KEY),
      mostLoginAuthHeaderName: map.mostLoginAuthHeaderName || process.env.MOSTLOGIN_AUTH_HEADER_NAME || 'Authorization',
      mostLoginAuthHeaderPrefix: map.mostLoginAuthHeaderPrefix || process.env.MOSTLOGIN_AUTH_HEADER_PREFIX || '',
      mostLoginListProfilesPath:
        map.mostLoginListProfilesPath || process.env.MOSTLOGIN_LIST_PROFILES_PATH || '/api/profile/getProfiles',
      mostLoginListProfilesMethod:
        map.mostLoginListProfilesMethod || process.env.MOSTLOGIN_LIST_PROFILES_METHOD || 'POST',
      mostLoginDetailProfilePath:
        map.mostLoginDetailProfilePath || process.env.MOSTLOGIN_DETAIL_PROFILE_PATH || '/api/profile/detail',
      mostLoginOpenProfilePath:
        map.mostLoginOpenProfilePath || process.env.MOSTLOGIN_OPEN_PROFILE_PATH || '/api/browser/openBrowser',
      mostLoginCloseProfilePath:
        map.mostLoginCloseProfilePath || process.env.MOSTLOGIN_CLOSE_PROFILE_PATH || '/api/browser/closeProfiles',
    },
  });
}

export async function PATCH(request: Request) {
  const auth = requireRole(request, 'ADMIN');

  if (auth.error) return auth.error;

  const parsed = SettingsSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu cài đặt không hợp lệ' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: parsed.data });
  }

  const entries = Object.entries(parsed.data).filter(([key, value]) => {
    if (key === 'mostLoginApiKey' && !value) return false;

    return value !== undefined;
  });

  await Promise.all(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  return NextResponse.json({ data: parsed.data });
}
