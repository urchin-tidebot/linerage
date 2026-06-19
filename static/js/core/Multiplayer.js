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
        "description": "<p>Online deathmatch: each browser controls one line with Left/Right arrows or the on-screen buttons. Host creates a join link and starts with Space or Start.</p>",
        "is_deathmatch": true,
        "max_players": 4,
        "min_players": 4
    });

    this.draw_ui();
    this.autojoin_from_hash();
}

Multiplayer.PROTOCOL = 1;

Multiplayer.prototype = {
    draw_ui: function() {
        var self = this;
        var box = $('<div id="network"></div>');
        box.append('<button id="net-host">Host online game</button> ');
        box.append('<input id="net-link" readonly="readonly" placeholder="Join link will appear here" /> ');
        box.append('<button id="net-copy">Copy link</button>');
        box.append('<div id="net-status">Offline hotseat mode.</div>');
        $('#content').prepend(box);

        $('#net-host').click(function() { self.host(); });
        $('#net-copy').click(function() { self.copy_link(); });
    },
    set_status: function(s) {
        $('#net-status').html(s);
    },
    copy_link: function() {
        var link = $('#net-link').val();
        if(!link) return;
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link);
            this.set_status('Join link copied. Waiting for players...');
        } else {
            $('#net-link')[0].select();
            this.set_status('Copy the selected join link.');
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
            self.set_status('Hosting as Red Player. Share the join link. Players: 1/4. Press Space or Start when ready.');
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
            if(self.conns.length >= self.maxPlayers - 1) {
                self.send(conn, {type: 'full'});
                conn.close();
                return;
            }
            conn.playerIndex = self.conns.length + 1;
            self.conns.push(conn);
            self.send(conn, {
                type: 'welcome',
                protocol: Multiplayer.PROTOCOL,
                playerIndex: conn.playerIndex,
                snapshot: self.snapshot()
            });
            self.broadcast_lobby();
            self.set_status('Hosting as Red Player. Players: ' + (self.conns.length + 1) + '/4. Press Space or Start.');
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
            self.set_status('Player disconnected. Players: ' + (self.conns.length + 1) + '/4.');
        });
    },
    prepare_online_game: function(callback) {
        var self = this;
        this.game.is_ready = false;
        this.game.load_level(this.onlineLevel, function() {
            self.game.is_ready = true;
            while(self.game.num_players < 4) self.game.add_player();
            self.game.reset();
            self.game.continue_fn = self.game.resume;
            hud.show('description');
            $(hud.description).html(self.onlineLevel.description);
            message('Online room ready. Share the join link, then press Space or Start.');
            if(callback) callback();
        });
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
        }
        this.game.is_paused = snapshot.paused;
        this.game.is_ended = snapshot.ended;
    },
    receive_from_host: function(msg) {
        if(!msg || typeof msg.type !== 'string') return;
        if(msg.type == 'full') {
            this.set_status('Room is full.');
        } else if(msg.type == 'welcome') {
            this.localIndex = msg.playerIndex;
            var self = this;
            this.prepare_online_game(function() {
                self.apply_snapshot(msg.snapshot);
                self.ready = true;
                self.set_status('Joined as ' + self.game.players[self.localIndex].name + '. Use arrows or on-screen buttons. Waiting for host.');
            });
        } else if(msg.type == 'lobby') {
            var player = this.game.players[this.localIndex];
            var name = player ? player.name : ('Player ' + (this.localIndex + 1));
            this.set_status('Joined as ' + name + '. Players: ' + msg.players + '/' + msg.maxPlayers + '. Waiting for host.');
        } else if(msg.type == 'reset') {
            var self = this;
            this.prepare_online_game(function() { self.apply_snapshot(msg.snapshot); });
        } else if(msg.type == 'resume') {
            hud.hide();
            message('');
            this.apply_snapshot(msg.snapshot);
        } else if(msg.type == 'pause') {
            message('Host paused.');
            this.game.is_paused = true;
        } else if(msg.type == 'end') {
            this.apply_snapshot(msg.snapshot);
            this.game.is_paused = true;
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
