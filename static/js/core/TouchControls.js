function TouchControls(game) {
    this.game = game;
    this.leftActive = false;
    this.rightActive = false;
    this.bind();
}

TouchControls.prototype = {
    bind: function() {
        var self = this;
        this.bind_button('#touch-left', 'left');
        this.bind_button('#touch-right', 'right');
        $('#touch-start').bind('touchstart mousedown', function(e) {
            if(e.type == 'touchstart') self.lastTouchStart = +new Date();
            if(e.type == 'mousedown' && self.lastTouchStart && (+new Date() - self.lastTouchStart) < 700) {
                return self.stop_event(e);
            }
            self.stop_event(e);
            self.start_or_pause();
        });
    },
    bind_button: function(selector, move) {
        var self = this;
        var button = $(selector);
        var down = function(e) {
            self.stop_event(e);
            self.set_move(move, true);
        };
        var up = function(e) {
            self.stop_event(e);
            self.set_move(move, false);
        };
        button.bind('touchstart mousedown', down);
        button.bind('touchend touchcancel mouseup mouseleave', up);
    },
    stop_event: function(e) {
        if(e && e.preventDefault) e.preventDefault();
        if(e && e.stopPropagation) e.stopPropagation();
        return false;
    },
    start_or_pause: function() {
        if(this.game.multiplayer && this.game.multiplayer.role == 'guest') {
            message('Waiting.');
            return false;
        }
        return this.game.continue_fn();
    },
    set_move: function(move, isDown) {
        if(move == 'left') this.leftActive = isDown;
        if(move == 'right') this.rightActive = isDown;

        var currentMove = null;
        if(this.leftActive && !this.rightActive) currentMove = 'left';
        else if(this.rightActive && !this.leftActive) currentMove = 'right';
        else if(isDown) currentMove = move;

        if(this.game.multiplayer && this.game.multiplayer.role != 'offline') {
            this.game.multiplayer.handle_move(currentMove, true);
        } else {
            var player = this.game.players[0];
            if(player) player.move_buffer = currentMove;
        }
        if(!this.game.is_paused && this.game.game_loop) this.game.game_loop();
    }
};
