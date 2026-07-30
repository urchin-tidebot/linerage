const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadMultiplayer() {
    const timers = [];
    const intervals = [];
    const clearedIntervals = [];
    const context = {
        console,
        Promise,
        setTimeout(fn) { timers.push(fn); return timers.length; },
        clearTimeout() {},
        setInterval(fn) { intervals.push(fn); return intervals.length; },
        clearInterval(id) { clearedIntervals.push(id); },
        Peer: function Peer() {},
        Level: function Level(value) { return value; },
        set_touch_start_label() {},
        location: {hash: '', href: 'https://example.test/linerage/'},
        window: {}, navigator: {}, Uint8Array, Math,
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
    return {Multiplayer: context.Multiplayer, timers, intervals, clearedIntervals};
}

function fakeConnection() {
    const handlers = {};
    return {
        open: false,
        closeCalls: 0,
        on(event, handler) { handlers[event] = handler; },
        emit(event, value) { if(handlers[event]) handlers[event](value); },
        close() { this.closeCalls++; }
    };
}

(() => {
    const {Multiplayer, timers} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    const connections = [];
    const statuses = [];
    let sends = 0;
    multiplayer.role = 'guest';
    multiplayer.sessionGeneration = 7;
    multiplayer.hostConn = null;
    multiplayer.peer = {
        connect() {
            const conn = fakeConnection();
            connections.push(conn);
            return conn;
        }
    };
    multiplayer.set_status = status => statuses.push(status);
    multiplayer.send = function() { sends++; };
    multiplayer.receive_from_host = function() {};

    assert.equal(typeof multiplayer.connect_to_host, 'function');
    multiplayer.connect_to_host('host-id', 1, 7);
    assert.equal(connections.length, 1);

    connections[0].emit('error', {type: 'webrtc'});
    assert.equal(connections[0].closeCalls, 1, 'failed attempts must be retired before retrying');
    assert.equal(timers.length, 1, 'first failure should schedule a fresh ICE attempt');
    timers.shift()();
    assert.equal(connections.length, 2);
    connections[0].emit('open');
    assert.equal(sends, 0, 'a retired attempt must not open late and register a duplicate guest');

    connections[1].emit('error', {type: 'webrtc'});
    timers.shift()();
    assert.equal(connections.length, 3);

    connections[2].emit('error', {type: 'webrtc'});
    assert.equal(timers.length, 0, 'retry limit must stop after three attempts');
    assert.ok(statuses.some(status => status.includes('Direct P2P blocked')));

    console.log('multiplayer direct retry: ok');
})();

(() => {
    const {Multiplayer} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    const statuses = [];
    multiplayer.role = 'guest';
    multiplayer.sessionGeneration = 9;
    multiplayer.guestConnectActive = false;
    multiplayer.peer = {
        disconnected: true,
        connect() { return undefined; }
    };
    multiplayer.set_status = status => statuses.push(status);

    assert.doesNotThrow(() => multiplayer.connect_to_host('host-id', 2, 9));
    assert.equal(multiplayer.guestConnectActive, false);
    assert.ok(statuses.some(status => status.includes('signaling')));

    console.log('multiplayer retry waits for signaling: ok');
})();

(() => {
    const {Multiplayer, timers} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    const statuses = [];
    const peer = {
        disconnected: true,
        destroyed: false,
        reconnectCalls: 0,
        reconnect() { this.reconnectCalls++; }
    };
    multiplayer.role = 'host';
    multiplayer.sessionGeneration = 4;
    multiplayer.set_status = status => statuses.push(status);

    assert.equal(typeof multiplayer.handle_peer_disconnected, 'function');
    multiplayer.handle_peer_disconnected(peer, 4);
    assert.equal(timers.length, 1);
    timers.shift()();
    assert.equal(peer.reconnectCalls, 1);
    assert.ok(statuses.some(status => status.includes('signaling')));

    multiplayer.sessionGeneration = 5;
    multiplayer.handle_peer_disconnected(peer, 4);
    while(timers.length) timers.shift()();
    assert.equal(peer.reconnectCalls, 1, 'stale sessions must not reconnect');

    console.log('multiplayer signaling reconnect: ok');
})();

(() => {
    const {Multiplayer} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    assert.equal(typeof multiplayer.format_route_stats, 'function');
    assert.equal(
        multiplayer.format_route_stats(
            {candidateType: 'host', protocol: 'udp'},
            {candidateType: 'srflx', protocol: 'udp'},
            {currentRoundTripTime: 0.023}
        ),
        'Direct host↔srflx · UDP · 23 ms'
    );
    assert.equal(
        multiplayer.format_route_stats(
            {candidateType: 'relay', protocol: 'udp'},
            {candidateType: 'prflx', protocol: 'udp'},
            {currentRoundTripTime: 0.225}
        ),
        'Relay relay↔prflx · UDP · 225 ms'
    );
    console.log('multiplayer route diagnostics: ok');
})();

(async () => {
    const {Multiplayer, intervals, clearedIntervals} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    multiplayer.routeDiagnosticTimer = null;
    multiplayer.routeDiagnosticConnection = null;
    const stats = new Map([
        ['transport', {type: 'transport', selectedCandidatePairId: 'pair'}],
        ['pair', {id: 'pair', type: 'candidate-pair', state: 'succeeded', localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: 0.031}],
        ['local', {id: 'local', type: 'local-candidate', candidateType: 'srflx', protocol: 'udp'}],
        ['remote', {id: 'remote', type: 'remote-candidate', candidateType: 'host', protocol: 'udp'}]
    ]);
    const conn = {peerConnection: {getStats: async () => stats}};

    assert.equal(typeof multiplayer.update_route_diagnostics, 'function');
    const text = await multiplayer.update_route_diagnostics(conn);
    assert.equal(text, 'Direct srflx↔host · UDP · 31 ms');

    assert.equal(typeof multiplayer.start_route_diagnostics, 'function');
    multiplayer.start_route_diagnostics(conn);
    assert.equal(intervals.length, 1, 'route diagnostics should refresh periodically');
    assert.equal(multiplayer.routeDiagnosticConnection, conn);

    assert.equal(typeof multiplayer.stop_route_diagnostics, 'function');
    multiplayer.stop_route_diagnostics(conn);
    assert.equal(multiplayer.routeDiagnosticTimer, null);
    assert.equal(multiplayer.routeDiagnosticConnection, null);
    assert.deepEqual(clearedIntervals, [1]);

    let resolveStats;
    const staleConn = {peerConnection: {getStats: () => new Promise(resolve => { resolveStats = resolve; })}};
    const currentConn = {peerConnection: {getStats: async () => stats}};
    multiplayer.routeDiagnosticConnection = staleConn;
    const staleUpdate = multiplayer.update_route_diagnostics(staleConn);
    multiplayer.routeDiagnosticConnection = currentConn;
    resolveStats(stats);
    assert.equal(await staleUpdate, null, 'late stats from an old connection must be ignored');

    console.log('multiplayer live route diagnostics: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

(async () => {
    const {Multiplayer} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    const handlers = {};
    const peer = {
        destroyed: false,
        on(event, handler) { handlers[event] = handler; },
        emit(event, value) { if(handlers[event]) handlers[event](value); },
        destroy() { this.destroyed = true; }
    };
    let preparations = 0;
    multiplayer.role = 'offline';
    multiplayer.sessionGeneration = 0;
    multiplayer.localIndex = 0;
    multiplayer.set_status = function() {};
    multiplayer.random_token = function() { return 'room-code'; };
    multiplayer.close_existing_session = function() { this.sessionGeneration++; };
    multiplayer.create_peer = async function() { return peer; };
    multiplayer.update_lobby = function() {};
    multiplayer.prepare_online_game = function(callback) { preparations++; callback(); };

    multiplayer.host();
    await new Promise(resolve => setImmediate(resolve));
    peer.emit('open', 'room-code');
    peer.emit('open', 'room-code');
    assert.equal(preparations, 1, 'signaling reconnect must not reinitialize the hosted game');

    console.log('multiplayer host signaling recovery: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

(async () => {
    const {Multiplayer} = loadMultiplayer();
    const multiplayer = Object.create(Multiplayer.prototype);
    const handlers = {};
    const peer = {
        destroyed: false,
        on(event, handler) { handlers[event] = handler; },
        emit(event, value) { if(handlers[event]) handlers[event](value); },
        destroy() { this.destroyed = true; }
    };
    let connections = 0;
    multiplayer.role = 'offline';
    multiplayer.sessionGeneration = 0;
    multiplayer.hostConn = null;
    multiplayer.set_status = function() {};
    multiplayer.set_room_code = function() {};
    multiplayer.close_existing_session = function() { this.sessionGeneration++; };
    multiplayer.create_peer = async function() { return peer; };
    multiplayer.connect_to_host = function() {
        connections++;
        this.hostConn = {open: true};
    };

    multiplayer.join('host-id');
    await new Promise(resolve => setImmediate(resolve));
    peer.emit('open');
    peer.emit('open');
    assert.equal(connections, 1, 'signaling reconnect must not duplicate an open guest connection');

    console.log('multiplayer guest signaling recovery: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
