function Multiplayer(game) {
    this.game = game;
    this.role = 'offline';
    this.peer = null;
    this.hostConn = null;
    this.conns = [];
    this.localIndex = 0;
    this.maxPlayers = 4;
    this.tick = 0;
    this.ready = false;
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

Multiplayer.prototype = {
    draw_ui: function() {
        var self = this;
        var box = $('<div id="network"></div>');
        box.append('<div id="net-controls"><button id="net-host">Host Game</button><button id="net-copy">Copy Invite</button><input id="net-link" readonly="readonly" placeholder="Invite link" /></div>');
        box.append('<div id="net-meta"><span id="net-players">Joined: 1/4</span> <span id="net-status">Offline hotseat mode.</span></div>');
        $('#content').prepend(box);

        $('#net-host').click(function() { self.host(); });
        $('#net-copy').click(function() { self.copy_link(); });
    },
    set_status: function(s) {
        $('#net-status').html(s);
    },
    joined_count: function() {
        return this.role == 'host' ? this.conns.length + 1 : this.game.num_players;
    },
    player_label: function(count) {
        return count == 1 ? '1 player' : count + ' players';
    },
    update_lobby: function(extra) {
        var count = this.joined_count();
        $('#net-players').html('Joined: ' + count + '/' + this.maxPlayers);
        if(this.role == 'host') {
            set_touch_start_label('Start');
            this.set_status('Host: Red. Share invite, then Start.');
        } else if(extra) {
            this.set_status(extra);
        }
    },
    copy_link: function() {
        var link = $('#net-link').val();
        if(!link) return;
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link);
            this.update_lobby('Invite copied.');
        } else {
            $('#net-link')[0].select();
            this.set_status('Invite selected.');
        }
    },
    host: function() {
        if(typeof Peer === 'undefined') {
            this.set_status('PeerJS failed to load. Check your network connection.');
            return;
        }
        var self = this;
        this.role = 'host';
        this.localIndex = 0;
        this.peer = new Peer();
        this.peer.on('open', function(id) {
            var joinUrl = location.href.replace(/#.*$/, '') + '#join=' + encodeURIComponent(id);
            $('#net-link').val(joinUrl);
            self.update_lobby();
            self.prepare_online_game(function() {
                self.ready = true;
            });
        });
        this.peer.on('connection', function(conn) { self.accept(conn); });
        this.peer.on('error', function(err) { self.set_status('Host error: ' + err); });
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
        this.role = 'guest';
        set_touch_start_label('Ready?');
        this.peer = new Peer();
        this.peer.on('open', function() {
            self.set_status('Connecting to host...');
            self.hostConn = self.peer.connect(hostId, {reliable: true});
            self.hostConn.on('open', function() {
                self.send(self.hostConn, {type: 'hello', protocol: Multiplayer.PROTOCOL});
            });
            self.hostConn.on('data', function(msg) { self.receive_from_host(msg); });
            self.hostConn.on('close', function() { self.set_status('Disconnected from host.'); });
            self.hostConn.on('error', function(err) { self.set_status('Connection error: ' + err); });
        });
        this.peer.on('error', function(err) { self.set_status('Join error: ' + err); });
    },
    accept: function(conn) {
        var self = this;
        conn.playerIndex = null;
        conn.on('open', function() {
            if(!self.game.is_paused || !self.game.is_fresh) {
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
            if(msg.type == 'input' && conn.playerIndex !== null) {
                self.apply_input(conn.playerIndex, msg.move);
            }
        });
        conn.on('close', function() {
            for(var i=self.conns.length-1; i>=0; i--) {
                if(self.conns[i] == conn) self.conns.splice(i, 1);
            }
            if(conn.playerIndex !== null && self.game.players[conn.playerIndex]) {
                self.apply_input(conn.playerIndex, null);
                self.game.players[conn.playerIndex].is_active = false;
            }
            self.broadcast_lobby();
            self.update_lobby();
        });
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
            message('Room ready. Share invite, then Start.');
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
        if(e.which == 37) move = 'left';
        else if(e.which == 39) move = 'right';
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
        if(this.role == 'host') this.broadcast({type: 'reset', snapshot: this.snapshot()});
    },
    on_resume: function() {
        if(this.role == 'host') this.broadcast({type: 'resume', snapshot: this.snapshot()});
    },
    on_pause: function() {
        if(this.role == 'host') this.broadcast({type: 'pause'});
    },
    on_end: function() {
        if(this.role == 'host') this.broadcast({type: 'end', snapshot: this.snapshot()});
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
        $('#net-players').html('Joined: ' + snapshot.players.length + '/' + this.maxPlayers);
    },
    receive_from_host: function(msg) {
        if(!msg || typeof msg.type !== 'string') return;
        if(msg.type == 'full') {
            this.set_status('Room is full.');
        } else if(msg.type == 'started') {
            this.set_status('Game already started. Ask the host for a new room.');
        } else if(msg.type == 'welcome') {
            this.localIndex = msg.playerIndex;
            var self = this;
            this.prepare_online_game(function() {
                self.apply_snapshot(msg.snapshot);
                self.ready = true;
                set_touch_start_label('Ready?');
                $('#net-players').html('Joined: ' + msg.players + '/' + msg.maxPlayers);
                self.set_status(self.game.players[self.localIndex].name + '. Waiting.');
            });
        } else if(msg.type == 'lobby') {
            var player = this.game.players[this.localIndex];
            var name = player ? player.name : ('Player ' + (this.localIndex + 1));
            set_touch_start_label('Ready?');
            $('#net-players').html('Joined: ' + msg.players + '/' + msg.maxPlayers);
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
        } else if(msg.type == 'tick') {
            this.draw_segments(msg.segments);
            this.apply_snapshot(msg.snapshot);
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
