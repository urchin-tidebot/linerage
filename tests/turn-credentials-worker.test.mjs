import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../cloudflare-worker/src/index.mjs';

const allowedOrigin = 'https://urchin-tidebot.github.io';
const env = {
    TURN_KEY_ID: 'test-key-id',
    TURN_KEY_SECRET: 'test-key-secret'
};

test('returns short-lived TURN credentials to the LineRage origin', async () => {
    let upstreamRequest;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        upstreamRequest = new Request(input, init);
        return Response.json({iceServers: [{urls: 'turns:turn.cloudflare.com:5349?transport=tcp'}]});
    };

    try {
        const response = await worker.fetch(new Request('https://worker.example/ice', {
            headers: {Origin: allowedOrigin}
        }), env);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
        assert.deepEqual(await response.json(), {
            iceServers: [{urls: 'turns:turn.cloudflare.com:5349?transport=tcp'}]
        });
        assert.equal(
            upstreamRequest.url,
            'https://rtc.live.cloudflare.com/v1/turn/keys/test-key-id/credentials/generate-ice-servers'
        );
        assert.equal(upstreamRequest.headers.get('Authorization'), 'Bearer test-key-secret');
        assert.deepEqual(await upstreamRequest.json(), {ttl: 3600});
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('rejects credential requests from unrelated browser origins', async () => {
    const response = await worker.fetch(new Request('https://worker.example/ice', {
        headers: {Origin: 'https://attacker.example'}
    }), env);
    assert.equal(response.status, 403);
});
