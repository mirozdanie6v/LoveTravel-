const DEMO_ORIGIN = 'https://max-tour-demo.viiversion.com';
const PROD_ORIGIN = 'https://max-tour.viiversion.com';

const PRODUCTION_POLISH = `
<style id="max-tour-production-polish">
  *, *::before, *::after {
    word-break: normal !important;
    overflow-wrap: normal !important;
    hyphens: none !important;
    -webkit-hyphens: none !important;
  }

  button,
  [role="button"],
  input[type="button"],
  input[type="submit"],
  nav a,
  a[class*="btn"],
  a[class*="button"],
  .btn,
  .button,
  .cta {
    text-align: center !important;
  }

  button,
  button *,
  [role="button"],
  [role="button"] *,
  nav a,
  nav a *,
  .chip,
  .pill,
  .badge,
  .tag {
    word-break: keep-all !important;
    overflow-wrap: normal !important;
    hyphens: none !important;
    -webkit-hyphens: none !important;
  }
</style>`;

function rewriteUrl(value: string | null) {
  if (!value) return value;
  return value.split(DEMO_ORIGIN).join(PROD_ORIGIN);
}

function productionHeaders(source: Headers) {
  const headers = new Headers(source);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-max-tour-production-source', 'live-demo-v28');
  headers.delete('content-length');

  const location = headers.get('location');
  if (location) headers.set('location', rewriteUrl(location) ?? location);

  const cookie = headers.get('set-cookie');
  if (cookie) {
    headers.set(
      'set-cookie',
      cookie
        .split('max-tour-demo.viiversion.com').join('max-tour.viiversion.com')
        .split('Domain=.viiversion.com').join('Domain=.viiversion.com'),
    );
  }

  return headers;
}

async function proxyToLiveDemo(request: Request) {
  if (request.headers.get('x-max-tour-production-proxy') === '1') {
    return new Response('Proxy loop blocked', { status: 508 });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, DEMO_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set('x-max-tour-production-proxy', '1');
  headers.delete('host');

  const upstreamRequest = new Request(upstream.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const response = await fetch(upstreamRequest);
  const responseHeaders = productionHeaders(response.headers);
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = html.split(DEMO_ORIGIN).join(PROD_ORIGIN);
    html = html.includes('</head>')
      ? html.replace('</head>', `${PRODUCTION_POLISH}</head>`)
      : `${PRODUCTION_POLISH}${html}`;

    return new Response(request.method === 'HEAD' ? null : html, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    return proxyToLiveDemo(request);
  },
};
