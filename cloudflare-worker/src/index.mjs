const PRODUCTION_ORIGIN = 'https://urchin-tidebot.github.io';

function allowedOrigin(origin) {
    return origin === PRODUCTION_ORIGIN ||
        /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin || '');
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
        'Vary': 'Origin'
    };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';

        if (url.pathname === '/health') {
            return Response.json({ok: true});
        }

        if (url.pathname !== '/ice') {
            return new Response('Not found', {status: 404});
        }

        if (!allowedOrigin(origin)) {
            return new Response('Forbidden', {status: 403});
        }

        if (request.method === 'OPTIONS') {
            return new Response(null, {status: 204, headers: corsHeaders(origin)});
        }

        if (request.method !== 'GET') {
            return new Response('Method not allowed', {status: 405});
        }

        const upstream = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.TURN_KEY_SECRET}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ttl: 3600})
            }
        );

        if (!upstream.ok) {
            return Response.json(
                {error: 'TURN credentials unavailable'},
                {status: 502, headers: corsHeaders(origin)}
            );
        }

        const credentials = await upstream.json();
        return Response.json(credentials, {headers: corsHeaders(origin)});
    }
};
