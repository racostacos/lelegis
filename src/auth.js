import { betterAuth } from 'better-auth';

const BASE_URL = 'https://legis.le-comrade.org';

export const authProviders = env => ({
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
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

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: BASE_URL,
    basePath: '/api/auth',
    socialProviders,
    trustedOrigins: [BASE_URL],
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

export async function beginGoogleSignIn(env, request, callbackURL = '/account') {
  const providers = authProviders(env);

  if (!providers.google) {
    return new Response('Google sign-in is not configured.', { status:503 });
  }

  const auth = await createAuth(env);

  // Ask Better Auth for the full Response so its Set-Cookie header
  // containing OAuth state/PKCE data is preserved.
  const authResponse = await auth.api.signInSocial({
    body: {
      provider: 'google',
      callbackURL
    },
    headers: request.headers,
    asResponse: true
  });

  const data = await authResponse.json();

  if (!data?.url) {
    return new Response('Unable to begin Google sign-in.', { status:500 });
  }

  // Preserve Better Auth's headers, especially Set-Cookie, while
  // converting its JSON redirect instruction into a real browser redirect.
  const headers = new Headers(authResponse.headers);
  headers.set('Location', data.url);
  headers.delete('Content-Type');
  headers.delete('Content-Length');

  return new Response(null, {
    status: 302,
    headers
  });
}
