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
    context.fetch = async function() {
        throw new Error('P2P-only setup must not fetch TURN credentials');
    };

    assert.equal(typeof context.Multiplayer.prototype.create_peer, 'function');

    const hostPeer = await context.Multiplayer.prototype.create_peer('room-code');
    assert.equal(hostPeer.id, 'room-code');
    const iceConfig = created[0].options.config;
    assert.equal(iceConfig.iceTransportPolicy, 'all');
    assert.ok(iceConfig.iceServers.length > 0, 'STUN servers must be configured');
    assert.ok(
        iceConfig.iceServers.every(server =>
            [].concat(server.urls).every(url => url.startsWith('stun:'))
        ),
        'P2P-only mode must never configure a TURN relay'
    );
    assert.ok(
        iceConfig.iceServers.every(server => !server.username && !server.credential),
        'P2P-only mode must not include relay credentials'
    );

    const guestPeer = await context.Multiplayer.prototype.create_peer();
    assert.equal(guestPeer.id, undefined);
    assert.deepEqual(created[1].options.config.iceServers, iceConfig.iceServers);
    assert.match(
        context.Multiplayer.prototype.direct_error_status({type: 'webrtc'}, 'Join error'),
        /Direct P2P blocked/
    );
    assert.match(
        context.Multiplayer.prototype.direct_error_status({type: 'peer-unavailable'}, 'Join error'),
        /Host unavailable/
    );

    const multiplayer = Object.create(context.Multiplayer.prototype);
    multiplayer.game = {};
    multiplayer.role = 'offline';
    multiplayer.peer = null;
    multiplayer.hostConn = null;
    multiplayer.conns = [];
    multiplayer.sessionGeneration = 0;
    multiplayer.lastTick = 0;
    const statuses = [];
    multiplayer.set_status = function(status) { statuses.push(status); };
    multiplayer.random_token = function() { return 'room-code'; };
    const pending = [];
    multiplayer.create_peer = function() {
        return new Promise((resolve, reject) => pending.push({resolve, reject}));
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
    pending[0].resolve(stalePeer);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(stalePeer.destroyed, true, 'superseded host setup must destroy its Peer');

    const currentPeer = fakePeer();
    pending[1].resolve(currentPeer);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(multiplayer.peer, currentPeer, 'latest host setup must remain active');

    statuses.length = 0;
    multiplayer.host();
    multiplayer.host();
    pending[2].reject(new Error('stale setup failed'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(
        !statuses.some(status => status.indexOf('stale setup failed') >= 0),
        'failure from a superseded setup must not overwrite current status'
    );

    console.log('multiplayer P2P configuration: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
