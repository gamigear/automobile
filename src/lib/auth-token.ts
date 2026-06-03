import crypto from 'crypto';

type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: string;
  exp: number;
};

const base64Url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');

const secret = () => process.env.NEXTAUTH_SECRET || 'local-development-secret';

export function signAccessToken(payload: Omit<TokenPayload, 'exp'>) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3,
    })
  );
  const signature = crypto.createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', secret())
    .update(`${header}.${body}`)
    .digest('base64url');

  if (signature.length !== expectedSignature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;

  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export function authUserFromPayload(payload: TokenPayload) {
  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.name,
    role: payload.role,
    photoURL: null,
  };
}
