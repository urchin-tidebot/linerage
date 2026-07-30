function Multiplayer(game) {
    this.game = game;
    this.role = 'offline';
    this.peer = null;
    this.hostConn = null;
    this.conns = [];
    this.localIndex = 0;
    this.maxPlayers = 4;
    this.tick = 0;
    this.lastTick = 0;
    this.ready = false;
    this.sessionGeneration = 0;
    this.routeDiagnosticTimer = null;
    this.routeDiagnosticConnection = null;
    this.guestConnectActive = false;
    this.onlineLevel = new Level({
        "name": "Online Deathmatch",
        "url": "levels/deathmatch/blank.png",
        "description": "",
        "is_deathmatch": true,
        "max_players": 4,
        "min_players": 1
    });

    this.draw_ui();
    this.autojoin_from_hash();
}

Multiplayer.PROTOCOL = 1;
Multiplayer.ICE_SERVERS = [
    {urls: 'stun:stun.cloudflare.com:3478'},
    {urls: 'stun:stun.l.google.com:19302'}
];

Multiplayer.prototype = {
    draw_ui: function() {
        var self = this;
        var box = $('<div id="network"></div>');
        box.append('<div id="net-controls"><button id="net-host">Host Game</button><button id="net-copy" class="online-only">Copy Invite</button><input id="net-link" class="online-only" readonly="readonly" aria-label="Invite link" title="Click to select invite link" placeholder="Invite link" /></div>');
        box.append('<div id="net-meta"><span id="net-room" class="online-only">Room: —</span><span id="net-players">Joined: 1/4</span><span id="net-route" class="online-only">Route: checking…</span><span id="net-status">Offline hotseat mode.</span></div>');
        $('#content').prepend(box);

        $('#net-host').click(function() { self.host(); });
        $('#net-copy').click(function() { self.copy_link(); });
        $('#net-link').focus(function() { this.select(); });
        $('#net-link').click(function() { this.select(); });
    },
    set_status: function(s) {
        $('#net-status').text(s);
    },
    format_route_stats: function(local, remote, pair) {
        var localType = local && local.candidateType || '?';
        var remoteType = remote && remote.candidateType || '?';
        var route = localType == 'relay' || remoteType == 'relay' ? 'Relay' : 'Direct';
        var protocol = String(local && local.protocol || remote && remote.protocol || '?').toUpperCase();
        var rtt = pair && typeof pair.currentRoundTripTime == 'number'
            ? Math.round(pair.currentRoundTripTime * 1000) + ' ms'
            : 'RTT unavailable';
        return route + ' ' + localType + '↔' + remoteType + ' · ' + protocol + ' · ' + rtt;
    },
    update_route_diagnostics: function(conn) {
        var self = this;
        var ownedAtStart = this.routeDiagnosticConnection === conn;
        if(this.routeDiagnosticConnection && !ownedAtStart) return Promise.resolve(null);
        if(!conn || !conn.peerConnection || !conn.peerConnection.getStats) return Promise.resolve(null);
        return conn.peerConnection.getStats().then(function(stats) {
            if(ownedAtStart && self.routeDiagnosticConnection !== conn) return null;
            var values = [];
            stats.forEach(function(value) { values.push(value); });
            var transport = null;
            var pair = null;
            for(var i=0; i<values.length; i++) {
                if(values[i].type == 'transport' && values[i].selectedCandidatePairId) transport = values[i];
            }
            if(transport) pair = stats.get(transport.selectedCandidatePairId);
            if(!pair) {
                for(var j=0; j<values.length; j++) {
                    if(values[j].type == 'candidate-pair' && values[j].state == 'succeeded' &&
                        (values[j].nominated || values[j].selected)) pair = values[j];
                }
            }
            if(!pair) return null;
            var local = stats.get(pair.localCandidateId);
            var remote = stats.get(pair.remoteCandidateId);
            var text = self.format_route_stats(local, remote, pair);
            $('#net-route').text('Route: ' + text);
            return text;
        }, function() { return null; });
    },
    start_route_diagnostics: function(conn) {
        var self = this;
        this.stop_route_diagnostics();
        this.routeDiagnosticConnection = conn;
        this.update_route_diagnostics(conn);
        this.routeDiagnosticTimer = setInterval(function() {
            self.update_route_diagnostics(conn);
        }, 2000);
    },
    stop_route_diagnostics: function(conn) {
        if(conn && this.routeDiagnosticConnection !== conn) return;
        if(this.routeDiagnosticTimer) clearInterval(this.routeDiagnosticTimer);
        this.routeDiagnosticTimer = null;
        this.routeDiagnosticConnection = null;
        $('#net-route').text('Route: checking…');
    },
    direct_error_status: function(err, fallback) {
        var text = String(err || '');
        if(err && err.type == 'peer-unavailable') {
            return 'Host unavailable. Ask the host for a new invite.';
        }
        if((err && err.type == 'webrtc') || /negotiation|ice|connection.*failed/i.test(text)) {
            return 'Direct P2P blocked by this network. Try a hotspot or another network.';
        }
        return fallback + ': ' + text;
    },
    handle_peer_disconnected: function(peer, sessionGeneration) {
        if(this.sessionGeneration != sessionGeneration || peer.destroyed) return;
        if(peer._linerageReconnectScheduled) return;
        var self = this;
        peer._linerageReconnectScheduled = true;
        this.set_status('PeerJS signaling disconnected. Reconnecting...');
        setTimeout(function() {
            peer._linerageReconnectScheduled = false;
            if(self.sessionGeneration != sessionGeneration || peer.destroyed || !peer.disconnected) return;
            try {
                peer.reconnect();
            } catch(err) {
                self.set_status('Signaling reconnect failed: ' + err.message);
            }
        }, 750);
    },
    joined_count: function() {
        return this.role == 'host' ? this.conns.length + 1 : this.game.num_players;
    },
    player_label: function(count) {
        return count == 1 ? '1 player' : count + ' players';
    },
    random_token: function() {
        var alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var token = '';
        if(window.crypto && window.crypto.getRandomValues) {
            var bytes = new Uint8Array(8);
            window.crypto.getRandomValues(bytes);
            for(var i=0; i<bytes.length; i++) token += alphabet.charAt(bytes[i] % alphabet.length);
        } else {
            for(var j=0; j<8; j++) token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
        return token;
    },
    invite_url: function(hostId) {
        return location.href.replace(/#.*$/, '') + '#join=' + encodeURIComponent(hostId);
    },
    create_peer: function(peerId) {
        return Promise.resolve().then(function() {
            return new Peer(peerId, {
                config: {
                    iceServers: Multiplayer.ICE_SERVERS,
                    iceTransportPolicy: 'all',
                    sdpSemantics: 'unified-plan'
                }
            });
        });
    },
    set_room_code: function(hostId) {
        $('#net-room').text('Room: ' + hostId);
    },
    update_lobby: function(extra) {
        var count = this.joined_count();
        $('#net-players').text('Joined: ' + count + '/' + this.maxPlayers);
        if(this.role == 'host') {
            set_touch_start_label('Start');
            this.set_status('Red host. Share link, then Start.');
        } else if(extra) {
            this.set_status(extra);
        }
    },
    copy_link: function() {
        var link = $('#net-link').val();
        if(!link) return;
        var self = this;
        var copied = function() {
            $('#net-copy').text('Copied');
            self.set_status('Invite copied.');
        };
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(copied, function() {
                self.set_status('Copy failed. Select the invite link.');
            });
        } else {
            $('#net-link')[0].select();
            if(document.execCommand && document.execCommand('copy')) copied();
            else this.set_status('Invite selected.');
        }
    },
    host: function() {
        if(typeof Peer === 'undefined') {
            this.set_status('PeerJS failed to load. Check your network connection.');
            return;
        }
        var self = this;
        this.close_existing_session();
        var sessionGeneration = this.sessionGeneration;
        this.role = 'host';
        this.localIndex = 0;
        $('#network').addClass('online');
        $('#net-copy').text('Copy Invite');
        this.set_status('Preparing direct P2P...');
        this.create_peer(this.random_token()).then(function(peer) {
            if(self.role != 'host' || self.sessionGeneration != sessionGeneration) {
                peer.destroy();
                return;
            }
            self.peer = peer;
            var initialized = false;
            peer.on('open', function(id) {
                if(initialized) {
                    self.set_status('PeerJS signaling restored.');
                    return;
                }
                initialized = true;
                self.set_room_code(id);
                $('#net-link').val(self.invite_url(id));
                self.update_lobby();
                self.prepare_online_game(function() {
                    self.ready = true;
                });
            });
            peer.on('connection', function(conn) { self.accept(conn); });
            peer.on('disconnected', function() {
                self.handle_peer_disconnected(peer, sessionGeneration);
            });
            peer.on('error', function(err) {
                if(err && err.type == 'unavailable-id') self.set_status('Room token taken. Try Host Game again.');
                else self.set_status(self.direct_error_status(err, 'Host error'));
            });
        }).catch(function(err) {
            if(self.role == 'host' && self.sessionGeneration == sessionGeneration) {
                self.set_status('Direct P2P setup failed: ' + err.message);
            }
        });
    },
    autojoin_from_hash: function() {
        var m = String(location.hash || '').match(/join=([^&]+)/);
        if(m) this.join(decodeURIComponent(m[1]));
    },
    join: function(hostId) {
        if(typeof Peer === 'undefined') {
            this.set_status('PeerJS failed to load. Check your network connection.');
            return;
        }
        var self = this;
        this.close_existing_session();
        var sessionGeneration = this.sessionGeneration;
        this.role = 'guest';
        $('#network').addClass('online');
        $('#net-copy').text('Copy Invite');
        this.set_room_code(hostId);
        $('#net-link').val(this.invite_url(hostId));
        set_touch_start_label('Ready?');
        this.set_status('Preparing direct P2P...');
        this.create_peer().then(function(peer) {
            if(self.role != 'guest' || self.sessionGeneration != sessionGeneration) {
                peer.destroy();
                return;
            }
            self.peer = peer;
            peer.on('open', function() {
                if(self.hostConn && self.hostConn.open) {
                    self.set_status('PeerJS signaling restored.');
                    return;
                }
                if(self.guestConnectActive) return;
                self.connect_to_host(hostId, 1, sessionGeneration);
            });
            peer.on('disconnected', function() {
                self.handle_peer_disconnected(peer, sessionGeneration);
            });
            peer.on('error', function(err) {
                self.set_status(self.direct_error_status(err, 'Join error'));
            });
        }).catch(function(err) {
            if(self.role == 'guest' && self.sessionGeneration == sessionGeneration) {
                self.set_status('Direct P2P setup failed: ' + err.message);
            }
        });
    },
    connect_to_host: function(hostId, attempt, sessionGeneration) {
        if(this.role != 'guest' || this.sessionGeneration != sessionGeneration) return;
        this.guestConnectActive = true;
        var self = this;
        var retryScheduled = false;
        var opened = false;
        if(!this.peer || this.peer.disconnected) {
            this.guestConnectActive = false;
            this.set_status('Waiting for PeerJS signaling to reconnect...');
            return;
        }
        this.set_status('Connecting directly to host (attempt ' + attempt + '/3)...');
        var conn = null;
        try {
            conn = this.peer.connect(hostId, {reliable: true});
        } catch(err) {
            this.guestConnectActive = false;
            this.set_status('Waiting for PeerJS signaling to reconnect...');
            return;
        }
        if(!conn || !conn.on) {
            this.guestConnectActive = false;
            this.set_status('Waiting for PeerJS signaling to reconnect...');
            return;
        }
        this.hostConn = conn;

        var retry = function(err) {
            if(retryScheduled || opened) return;
            retryScheduled = true;
            if(conn.close) conn.close();
            if(self.role != 'guest' || self.sessionGeneration != sessionGeneration) return;
            if(attempt >= 3) {
                self.guestConnectActive = false;
                self.set_status(self.direct_error_status(err, 'Connection error'));
                return;
            }
            self.set_status('Direct connection failed. Retrying with fresh ICE...');
            setTimeout(function() {
                if(self.role == 'guest' && self.sessionGeneration == sessionGeneration) {
                    self.connect_to_host(hostId, attempt + 1, sessionGeneration);
                }
            }, attempt * 500);
        };

        conn.on('open', function() {
            if(retryScheduled || self.hostConn !== conn) {
                if(conn.close) conn.close();
                return;
            }
            opened = true;
            self.start_route_diagnostics(conn);
            self.send(conn, {type: 'hello', protocol: Multiplayer.PROTOCOL});
        });
        conn.on('data', function(msg) { self.receive_from_host(msg); });
        conn.on('close', function() {
            if(opened) {
                self.guestConnectActive = false;
                self.stop_route_diagnostics(conn);
                self.set_status('Disconnected from host.');
            } else retry(new Error('Direct connection closed before opening'));
        });
        conn.on('error', function(err) {
            if(opened) self.set_status(self.direct_error_status(err, 'Connection error'));
            else retry(err);
        });
    },
    accept: function(conn) {
        var self = this;
        conn.playerIndex = null;
        conn.on('open', function() {
            if(!self.game.is_paused || (!self.game.is_fresh && !self.game.is_ended)) {
                self.send(conn, {type: 'started'});
                conn.close();
                return;
            }
            if(self.conns.length >= self.maxPlayers - 1) {
                self.send(conn, {type: 'full'});
                conn.close();
                return;
            }
            conn.playerIndex = self.next_player_index();
            self.conns.push(conn);
            self.start_route_diagnostics(conn);
            if(self.game.is_paused) self.game.set_player_count(self.conns.length + 1);
            self.send(conn, {
                type: 'welcome',
                protocol: Multiplayer.PROTOCOL,
                playerIndex: conn.playerIndex,
                players: self.conns.length + 1,
                maxPlayers: self.maxPlayers,
                snapshot: self.snapshot()
            });
            self.broadcast_lobby();
            self.update_lobby();
        });
        conn.on('data', function(msg) {
            if(!msg || typeof msg.type !== 'string') return;
            if(msg.type == 'hello' && msg.protocol !== Multiplayer.PROTOCOL) {
                self.send(conn, {type: 'protocol', protocol: Multiplayer.PROTOCOL});
                conn.close();
                return;
            }
            if(msg.type == 'input' && conn.playerIndex !== null) {
                self.apply_input(conn.playerIndex, msg.move);
            }
        });
        conn.on('close', function() {
            for(var i=self.conns.length-1; i>=0; i--) {
                if(self.conns[i] == conn) self.conns.splice(i, 1);
            }
            if(self.routeDiagnosticConnection === conn) {
                self.stop_route_diagnostics(conn);
                if(self.conns.length) self.start_route_diagnostics(self.conns[0]);
            }
            if(conn.playerIndex !== null && self.game.players[conn.playerIndex]) {
                self.eliminate_player(conn.playerIndex, 'disconnected.');
            }
            if(self.game.is_paused && !self.game.is_ended) self.game.set_player_count(self.conns.length + 1);
            self.broadcast_lobby();
            self.update_lobby();
        });
    },
    close_existing_session: function() {
        this.sessionGeneration++;
        this.stop_route_diagnostics();
        this.guestConnectActive = false;
        if(this.hostConn && this.hostConn.close) this.hostConn.close();
        for(var i=0; i<this.conns.length; i++) {
            if(this.conns[i] && this.conns[i].close) this.conns[i].close();
        }
        this.conns = [];
        this.hostConn = null;
        if(this.peer && this.peer.destroy) this.peer.destroy();
        this.peer = null;
        this.ready = false;
        this.lastTick = 0;
    },
    next_player_index: function() {
        for(var i=1; i<this.maxPlayers; i++) {
            var used = false;
            for(var j=0; j<this.conns.length; j++) {
                if(this.conns[j].playerIndex == i) used = true;
            }
            if(!used) return i;
        }
        return this.conns.length + 1;
    },
    prepare_online_game: function(callback) {
        var self = this;
        this.game.is_ready = false;
        this.game.load_level(this.onlineLevel, function() {
            self.game.is_ready = true;
            self.game.set_player_count(self.maxPlayers);
            self.game.reset();
            self.game.continue_fn = function() { return self.start_game(); };
            if(self.role == 'host') set_touch_start_label('Start');
            else set_touch_start_label('Ready?');
            hud.hide();
            message('');
            if(callback) callback();
        });
    },
    start_game: function() {
        if(this.role != 'host') return false;
        var count = this.joined_count();
        this.game.set_player_count(count);
        this.game.reset();
        this.game.continue_fn = this.game.resume;
        this.set_status('Started: ' + this.player_label(count) + '.');
        return this.game.resume();
    },
    broadcast_lobby: function() {
        this.broadcast({type: 'lobby', players: this.conns.length + 1, maxPlayers: this.maxPlayers});
    },
    handle_key: function(e, isDown) {
        if(this.role == 'offline') return false;

        if(e.which == 32) {
            if(this.role == 'guest') {
                e.preventDefault();
                return true;
            }
            return false;
        }

        var move = null;
        if(e.which == 37 || e.which == 65) move = 'left';
        else if(e.which == 39 || e.which == 68) move = 'right';
        else return false;

        this.handle_move(move, isDown);
        e.preventDefault();
        return true;
    },
    handle_move: function(move, isDown) {
        if(this.role == 'offline') return false;
        if(!isDown) move = null;
        if(this.role == 'guest') {
            this.apply_input(this.localIndex, move);
            this.send(this.hostConn, {type: 'input', move: move});
        } else if(this.role == 'host') {
            this.apply_input(0, move);
        }
        return true;
    },
    apply_input: function(index, move) {
        var player = this.game.players[index];
        if(!player) return;
        player.move_buffer = move;
    },
    send: function(conn, msg) {
        if(conn && conn.open) conn.send(msg);
    },
    broadcast: function(msg) {
        for(var i=0; i<this.conns.length; i++) this.send(this.conns[i], msg);
    },
    on_reset: function() {
        this.tick = 0;
        this.lastTick = 0;
        if(this.role == 'host') this.broadcast({type: 'reset', snapshot: this.snapshot()});
    },
    on_resume: function() {
        if(this.role == 'host') this.broadcast({type: 'resume', snapshot: this.snapshot()});
    },
    on_pause: function() {
        if(this.role == 'host') this.broadcast({type: 'pause'});
    },
    on_end: function() {
        if(this.role == 'host') {
            var self = this;
            setTimeout(function() {
                set_touch_start_label('Start');
                self.game.continue_fn = function() { return self.start_game(); };
                self.broadcast({type: 'end', snapshot: self.snapshot(), message: $('#messages').text()});
            }, 0);
        }
    },
    after_tick: function(segments) {
        if(this.role != 'host' || !segments || !segments.length) return;
        this.broadcast({type: 'tick', tick: ++this.tick, segments: segments, snapshot: this.snapshot()});
    },
    snapshot: function() {
        var players = [];
        for(var i=0; i<this.game.players.length; i++) {
            var p = this.game.players[i];
            players.push({
                pos: [p.pos[0], p.pos[1]],
                angle: p.angle,
                active: p.is_active,
                move: p.move_buffer,
                score: p.score,
                deaths: p.num_deaths,
                wins: p.num_wins
            });
        }
        return {
            paused: this.game.is_paused,
            ended: this.game.is_ended,
            players: players
        };
    },
    apply_snapshot: function(snapshot) {
        if(!snapshot || !snapshot.players) return;
        this.game.set_player_count(snapshot.players.length);
        this.game.num_active = 0;
        for(var i=0; i<snapshot.players.length; i++) {
            var src = snapshot.players[i];
            var p = this.game.players[i];
            if(!p || !src) continue;
            p.pos = [src.pos[0], src.pos[1]];
            p.angle = src.angle;
            p.is_active = src.active;
            p.move_buffer = src.move;
            p.score = src.score || 0;
            p.num_deaths = src.deaths || 0;
            p.num_wins = src.wins || 0;
            if(p.is_active) this.game.num_active++;
        }
        this.game.is_paused = snapshot.paused;
        this.game.is_ended = snapshot.ended;
        set_touch_turn_color(this.game.players[this.localIndex]);
        $('#net-players').text('Joined: ' + snapshot.players.length + '/' + this.maxPlayers);
    },
    receive_from_host: function(msg) {
        if(!msg || typeof msg.type !== 'string') return;
        if(msg.type == 'full') {
            this.set_status('Room is full.');
        } else if(msg.type == 'started') {
            this.set_status('Game already started. Ask the host for a new room.');
        } else if(msg.type == 'protocol') {
            this.set_status('Protocol mismatch. Reload the page and try again.');
        } else if(msg.type == 'welcome') {
            if(msg.protocol !== Multiplayer.PROTOCOL) {
                this.set_status('Protocol mismatch. Reload the page and try again.');
                if(this.hostConn && this.hostConn.close) this.hostConn.close();
                return;
            }
            this.localIndex = msg.playerIndex;
            var self = this;
            this.prepare_online_game(function() {
                self.apply_snapshot(msg.snapshot);
                self.ready = true;
                set_touch_start_label('Ready?');
                $('#net-players').text('Joined: ' + msg.players + '/' + msg.maxPlayers);
                self.set_status(self.game.players[self.localIndex].name + '. Waiting.');
            });
        } else if(msg.type == 'lobby') {
            var player = this.game.players[this.localIndex];
            var name = player ? player.name : ('Player ' + (this.localIndex + 1));
            set_touch_start_label('Ready?');
            $('#net-players').text('Joined: ' + msg.players + '/' + msg.maxPlayers);
            this.set_status(name + '. Waiting.');
        } else if(msg.type == 'reset') {
            var self = this;
            this.prepare_online_game(function() { self.apply_snapshot(msg.snapshot); });
        } else if(msg.type == 'resume') {
            hud.hide();
            message('');
            set_touch_start_visible(false);
            this.apply_snapshot(msg.snapshot);
            var player = this.game.players[this.localIndex];
            var name = player ? player.name : ('Player ' + (this.localIndex + 1));
            this.set_status('Playing: ' + name + '.');
        } else if(msg.type == 'pause') {
            message('Host paused.');
            this.game.is_paused = true;
        } else if(msg.type == 'end') {
            this.apply_snapshot(msg.snapshot);
            this.game.is_paused = true;
            set_touch_start_label('Ready?');
            set_touch_start_visible(true);
            if(msg.message) message_text(msg.message);
        } else if(msg.type == 'tick') {
            if(msg.tick && msg.tick <= this.lastTick) return;
            this.lastTick = msg.tick || this.lastTick;
            this.draw_segments(msg.segments);
            this.apply_snapshot(msg.snapshot);
        }
    },
    eliminate_player: function(index, suffix) {
        var player = this.game.players[index];
        if(!player) return;
        this.apply_input(index, null);
        if(!player.is_active) return;
        player.is_active = false;
        if(!this.game.is_paused && !this.game.is_ended) {
            this.game.num_active = Math.max(0, this.game.num_active - 1);
            if(this.game.num_active <= this.game.num_end) {
                $(window).trigger('lose', [player]);
            } else if(suffix) {
                message_text(player.name + ' ' + suffix);
            }
        }
    },
    draw_segments: function(segments) {
        var ctx = this.game.contexts.entities;
        for(var i=0; i<segments.length; i++) {
            var s = segments[i];
            if(!s || !s.old_pos || !s.new_pos) continue;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s.old_pos[0], s.old_pos[1]);
            ctx.lineTo(s.new_pos[0], s.new_pos[1]);
            ctx.stroke();
        }
    }
};
