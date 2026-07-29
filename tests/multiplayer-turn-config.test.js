const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const created = [];
function Peer(id, options) {
    created.push({id, options});
    this.id = id;
}

const context = {
    console,
    Peer,
    Level: function Level(value) { return value; },
    location: {hash: '', href: 'https://example.test/linerage/'},
    window: {},
    navigator: {},
    Uint8Array,
    Math,
    $: function() {
        return {
            prepend() {}, append() {}, click() {}, focus() {}, val() {},
            text() {}, addClass() {}, removeClass() {}, hide() {}, show() {}
        };
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync('static/js/core/Multiplayer.js', 'utf8'),
    context,
    {filename: 'Multiplayer.js'}
);

(async () => {
    const iceServers = [
        {urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53']},
        {
            urls: [
                'turn:turn.cloudflare.com:3478?transport=udp',
                'turn:turn.cloudflare.com:80?transport=tcp',
                'turns:turn.cloudflare.com:443?transport=tcp'
            ],
            username: 'test-user',
            credential: 'test-credential'
        }
    ];
    let requestedUrl = null;
    context.fetch = async function(url) {
        requestedUrl = url;
        return {ok: true, json: async () => ({iceServers})};
    };

    assert.equal(typeof context.Multiplayer.prototype.create_peer, 'function');

    const hostPeer = await context.Multiplayer.prototype.create_peer('room-code');
    assert.equal(hostPeer.id, 'room-code');
    assert.match(requestedUrl, /^https:\/\//);
    assert.ok(!requestedUrl.includes('API_KEY'), 'deployed URL must contain a configured key');
    assert.deepEqual(created[0].options.config.iceServers, iceServers);
    assert.ok(
        created[0].options.config.iceServers.some(server =>
            [].concat(server.urls).some(url => url.startsWith('turns:') && url.includes(':443'))
        ),
        'TURN/TLS on port 443 must be available for restrictive networks'
    );

    const guestPeer = await context.Multiplayer.prototype.create_peer();
    assert.equal(guestPeer.id, undefined);
    assert.deepEqual(created[1].options.config.iceServers, iceServers);

    const multiplayer = Object.create(context.Multiplayer.prototype);
    multiplayer.game = {};
    multiplayer.role = 'offline';
    multiplayer.peer = null;
    multiplayer.hostConn = null;
    multiplayer.conns = [];
    multiplayer.sessionGeneration = 0;
    multiplayer.lastTick = 0;
    multiplayer.set_status = function() {};
    multiplayer.random_token = function() { return 'room-code'; };
    const pending = [];
    multiplayer.create_peer = function() {
        return new Promise(resolve => pending.push(resolve));
    };
    const fakePeer = function() {
        return {
            destroyed: false,
            destroy() { this.destroyed = true; },
            on() {}
        };
    };

    multiplayer.host();
    multiplayer.host();
    const stalePeer = fakePeer();
    pending[0](stalePeer);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(stalePeer.destroyed, true, 'superseded host setup must destroy its Peer');

    const currentPeer = fakePeer();
    pending[1](currentPeer);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(multiplayer.peer, currentPeer, 'latest host setup must remain active');

    console.log('multiplayer TURN configuration: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
