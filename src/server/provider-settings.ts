import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------

export type MostLoginConfig = {
  baseUrl: string;
  apiKey?: string;
  authHeaderName: string;
  authHeaderPrefix: string;
  listProfilesPath: string;
  listProfilesMethod: 'GET' | 'POST';
  detailProfilePath: string;
  openProfilePath: string;
  closeProfilePath: string;
};

const DEFAULT_MOSTLOGIN_BASE_URL = 'http://127.0.0.1:30898';
const DEFAULT_MOSTLOGIN_LIST_PATH = '/api/profile/getProfiles';
const DEFAULT_MOSTLOGIN_DETAIL_PATH = '/api/profile/detail';
const DEFAULT_MOSTLOGIN_OPEN_PATH = '/api/browser/openBrowser';
const DEFAULT_MOSTLOGIN_CLOSE_PATH = '/api/browser/closeProfiles';

const methodValue = (value: unknown, fallback: 'GET' | 'POST' = 'POST') =>
  value === 'GET' || value === 'POST' ? value : fallback;

export async function getMostLoginConfig(): Promise<MostLoginConfig> {
  if (!process.env.DATABASE_URL) {
    return {
      baseUrl: process.env.MOSTLOGIN_API_BASE_URL || DEFAULT_MOSTLOGIN_BASE_URL,
      apiKey: process.env.MOSTLOGIN_API_KEY || undefined,
      authHeaderName: process.env.MOSTLOGIN_AUTH_HEADER_NAME || 'Authorization',
      authHeaderPrefix: process.env.MOSTLOGIN_AUTH_HEADER_PREFIX || '',
      listProfilesPath: process.env.MOSTLOGIN_LIST_PROFILES_PATH || DEFAULT_MOSTLOGIN_LIST_PATH,
      listProfilesMethod: methodValue(process.env.MOSTLOGIN_LIST_PROFILES_METHOD),
      detailProfilePath: process.env.MOSTLOGIN_DETAIL_PROFILE_PATH || DEFAULT_MOSTLOGIN_DETAIL_PATH,
      openProfilePath: process.env.MOSTLOGIN_OPEN_PROFILE_PATH || DEFAULT_MOSTLOGIN_OPEN_PATH,
      closeProfilePath: process.env.MOSTLOGIN_CLOSE_PROFILE_PATH || DEFAULT_MOSTLOGIN_CLOSE_PATH,
    };
  }

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          'mostLoginApiBaseUrl',
          'mostLoginApiKey',
          'mostLoginAuthHeaderName',
          'mostLoginAuthHeaderPrefix',
          'mostLoginListProfilesPath',
          'mostLoginListProfilesMethod',
          'mostLoginDetailProfilePath',
          'mostLoginOpenProfilePath',
          'mostLoginCloseProfilePath',
        ],
      },
    },
  });
  const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));

  return {
    baseUrl: String(map.mostLoginApiBaseUrl || process.env.MOSTLOGIN_API_BASE_URL || DEFAULT_MOSTLOGIN_BASE_URL),
    apiKey: String(map.mostLoginApiKey || process.env.MOSTLOGIN_API_KEY || '') || undefined,
    authHeaderName: String(map.mostLoginAuthHeaderName || process.env.MOSTLOGIN_AUTH_HEADER_NAME || 'Authorization'),
    authHeaderPrefix: String(map.mostLoginAuthHeaderPrefix || process.env.MOSTLOGIN_AUTH_HEADER_PREFIX || ''),
    listProfilesPath: String(
      map.mostLoginListProfilesPath || process.env.MOSTLOGIN_LIST_PROFILES_PATH || DEFAULT_MOSTLOGIN_LIST_PATH
    ),
    listProfilesMethod: methodValue(map.mostLoginListProfilesMethod || process.env.MOSTLOGIN_LIST_PROFILES_METHOD),
    detailProfilePath: String(
      map.mostLoginDetailProfilePath || process.env.MOSTLOGIN_DETAIL_PROFILE_PATH || DEFAULT_MOSTLOGIN_DETAIL_PATH
    ),
    openProfilePath: String(
      map.mostLoginOpenProfilePath || process.env.MOSTLOGIN_OPEN_PROFILE_PATH || DEFAULT_MOSTLOGIN_OPEN_PATH
    ),
    closeProfilePath: String(
      map.mostLoginCloseProfilePath || process.env.MOSTLOGIN_CLOSE_PROFILE_PATH || DEFAULT_MOSTLOGIN_CLOSE_PATH
    ),
  };
}

export function mostLoginAuthHeaders(config: MostLoginConfig) {
  const token = `${config.authHeaderPrefix ? `${config.authHeaderPrefix} ` : ''}${config.apiKey || ''}`;

  return {
    [config.authHeaderName || 'authorization']: token,
    'content-type': 'application/json',
  };
}
