const SUPABASE_URL = 'https://ayrrpaqvwfeacowmosgv.supabase.co/functions/v1/myresult-search-v5';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5cnJwYXF2d2ZlYWNvd21vc2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDYyMzMsImV4cCI6MjEwODA4MjIzM30.xLvhRTDA7MSrYiGF7n5e_dGFPw4sxohq-5tWuBSp95E';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/api/myresult-search-v5', '/api/tracking-lists'].includes(url.pathname)) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(url.origin) });
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors(url.origin) });
      const headers = new Headers(request.headers);
      headers.set('apikey', SUPABASE_KEY);
      headers.set('Authorization', `Bearer ${SUPABASE_KEY}`);
      const upstream = url.pathname === '/api/tracking-lists' ? SUPABASE_URL.replace('myresult-search-v5', 'tracking-lists') : SUPABASE_URL;
      const response = await fetch(upstream, { method: 'POST', headers, body: request.body });
      const out = new Response(response.body, response);
      if (url.pathname === '/api/tracking-lists') out.headers.set('Cache-Control', 'no-store');
      Object.entries(cors(url.origin)).forEach(([key, value]) => out.headers.set(key, value));
      return out;
    }
    return env.ASSETS.fetch(request);
  }
};

function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
