import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

// Only this configured issuer is contacted, never a URL supplied in a JWT.
export async function authenticateAdmin(request, env, keyResolver) {
  if (env.ACCESS_TEAM_DOMAIN || env.ACCESS_AUD) {
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') || !env.ACCESS_AUD) return null;
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token || token.length > 16384) return null;
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    try {
      if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
      const { payload } = await jwtVerify(token, keyResolver || keySets.get(issuer), {
        issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email']
      });
      if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;
      return { actor: payload.email, method: 'access' };
    } catch { return null; }
  }
  // Optional development-only fallback. Never bypass configured Access.
  if (env.ADMIN_API_TOKEN && request.headers.get('authorization') === `Bearer ${env.ADMIN_API_TOKEN}`) return { actor: 'admin', method: 'token' };
  return null;
}
