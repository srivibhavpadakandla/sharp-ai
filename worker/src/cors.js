export function corsHeaders(env, request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.SITE_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin)
    || /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.sharp-ai\.pages\.dev$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.sharpftc\.pages\.dev$/.test(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] || '*'),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

