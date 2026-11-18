import { betterAuth } from 'better-auth';
import { importPKCS8, SignJWT } from 'jose';

const BASE_URL = 'https://legis.le-comrade.org';

const cleanPrivateKey = value =>
  String(value ?? '').replaceAll('\\n', '\n').trim();

async function appleClientSecret(env) {
  const key = await importPKCS8(cleanPrivateKey(env.APPLE_PRIVATE_KEY), 'ES256');
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg:'ES256', kid:env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

export const authProviders = env => ({
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  apple: Boolean(
    env.APPLE_CLIENT_ID &&
    env.APPLE_TEAM_ID &&
    env.APPLE_KEY_ID &&
    env.APPLE_PRIVATE_KEY
  )
});

export async function createAuth(env) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not configured');
  }

  const providers = authProviders(env);
  const socialProviders = {};

  if (providers.google) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    };
  }

  if (providers.apple) {
    socialProviders.apple = async () => ({
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: await appleClientSecret(env)
    });
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: BASE_URL,
    basePath: '/api/auth',
    socialProviders,
    trustedOrigins: [
      BASE_URL,
      'https://appleid.apple.com'
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      }
    }
  });
}

export async function getSession(env, request) {
  if (!env.BETTER_AUTH_SECRET) return null;

  try {
    const auth = await createAuth(env);
    return await auth.api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}

export async function beginSocialSignIn(env, request, provider, callbackURL = '/account') {
  const providers = authProviders(env);
  if (!providers[provider]) {
    return new Response(`${provider} sign-in is not configured.`, { status:503 });
  }

  const auth = await createAuth(env);
  const result = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL
    },
    headers: request.headers
  });

  if (result instanceof Response) return result;
  if (result?.url) return Response.redirect(result.url, 302);

  return new Response('Unable to begin sign-in.', { status:500 });
}
