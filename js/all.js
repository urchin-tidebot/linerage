// OO - Class - Copyright TJ Holowaychuk <tj@vision-media.ca> (MIT Licensed)
// Based on http://ejohn.org/blog/simple-javascript-inheritance/
// which is based on implementations by Prototype / base2

(function(){

  var global = this, initialize = true
  var referencesSuper = /xyz/.test(function(){ xyz }) ? /\b__super__\b/ : /.*/

  /**
   * Shortcut for Class.extend()
   *
   * @param  {hash} props
   * @return {function}
   * @api public
   */

  Class = function(props){
    if (this == global)
      return Class.extend(props)
  }

  // --- Version

  Class.version = '1.2.0'

  /**
   * Create a new Class.
   *
   *   User = Class({
   *     init: function(name){
   *       this.name = name
   *     }
   *   })
   *
   * Classes may be subClassed using the .extend() method, and
   * the associated superClass method via this.__super__().
   *
   *   Admin = User.extend({
   *     init: function(name, password) {
   *       this.__super__(name)
   *       // or this.__super__.apply(this, arguments)
   *       this.password = password
   *     }
   *   })
   *
   * @param  {hash} props
   * @return {function}
   * @api public
   */

  Class.extend = function(props) {
    var __super__ = this.prototype

    initialize = false
    var prototype = new this
    initialize = true

    function Class() {
      if (initialize && this.init)
        this.init.apply(this, arguments)
    }

    function extend(props) {
      for (var key in props)
        if (props.hasOwnProperty(key))
          Class[key] = props[key]
    }

    Class.include = function(props) {
      for (var name in props)
        if (name == 'include')
          if (props[name] instanceof Array)
            for (var i = 0, len = props[name].length; i < len; ++i)
              Class.include(props[name][i])
          else
            Class.include(props[name])
        else if (name == 'extend')
          if (props[name] instanceof Array)
            for (var i = 0, len = props[name].length; i < len; ++i)
              extend(props[name][i])
          else
            extend(props[name])
        else if (props.hasOwnProperty(name))
          prototype[name] =
            typeof props[name] == 'function' &&
            typeof __super__[name] == 'function' &&
            referencesSuper.test(props[name]) ?
              (function(name, fn){
                return function() {
                  this.__super__ = __super__[name]
                  return fn.apply(this, arguments)
                }
              })(name, props[name])
            : props[name]
    }

    Class.include(props)
    Class.prototype = prototype
    Class.constructor = Class
    Class.extend = arguments.callee

    return Class
  }

})();
var Dom = window.Dom = {
    select: function(selector) {
        return selector.charAt(0) == '#' ? document.getElementById(selector.substr(1)) : document.getElementsByTagName(selector);
    },
    create: function(name, attrs) {
        var e = document.createElement(name);
        for(var k in attrs) {
            e.setAttribute(k, attrs[k]);
        }
        return e;
    }
}
Function.prototype.bind = function(bind) {
    var self = this;
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return self.apply(bind || null, args);
    };
};

/** Geometry and vectors **/

function in_boundary(pos, box) {
    return pos[0] >= box[0] && // x1
           pos[1] >= box[1] && // y1
           pos[0] <= box[2] && // x2
           pos[1] <= box[3];   // y2
}

function in_radius(pos, circle_pos, circle_radius) {
    var dx = pos[0] - circle_pos[0], dy = pos[1] - circle_pos[1];
    return circle_radius*circle_radius >= dx*dx + dy*dy;
}

function boundary_center(box) {
    return [box[0] - (box[0]-box[2]) / 2, box[1] - (box[1]-box[3]) / 2];
}

function bounding_square(pos, size) {
    /* Given pos [x1, y1] with size scalar,
 [x1, y1, x2: "   * Returns boundary", y2] */
    return [pos[0], pos[1]+size, pos[1], pos[1]+size];
}

function rotate(vector, angle) {
    // Rotate vector by angle (in radians)
    var x = vector[0], y = vector[1];
    var sin = Math.sin(angle), cos = Math.cos(angle);
    return [x * cos - y * sin, x * sin + y * cos];
}


/** Binary Search **/

var binary_search = function(a, val, compare_fn) {
    // Returns (positive) index of element if found (not necessarily the first),
    // otherwise (negative) negated index of insertion point.

    var left = 0, right = a.length;

    // Tight loop optimization
    if(compare_fn) {
        while(left < right) {
            var middle = (left + right) >> 1;
            compare_fn(a[middle], val) ? left = middle + 1 : right = middle;
        }
        return compare_fn(a[left], val) ? left : ~left;
    } else {
        while(left < right) {
            var middle = (left + right) >> 1;
            a[middle] < val ? left = middle + 1 : right = middle;
        }
        return a[left] == val ? left : ~left;
    }
}

var binary_insert = function(a, val, compare_fn) {
    // Returns position of insertion

    var i = binary_search(a, val, compare_fn);
    if(i < 0) i = ~i;
    a.splice(i, 0, val);
    return i;
}

var binary_remove = function(a, val, compare_fn) {
    // Returns removed element

    var i= binary_search(a, val, compare_fn);
    return (i >= 0) ? a.splice(i, 1)[0] : false;
}



/****/

function Cycle(a) {
    var i = 0, stop = a.length;
    return function() {
        if(i==stop) i = 0;
        return a[i++];
    }
}

function CounterCallback(count, callback) {
    return function() {
        if(--count == 0) callback();
    }
}


function make_grid(size, fn) {
    // size -> [dx, dy]
    // fn -> Value to use based on position.
    // Returns a 2d grid of dimensions `size`.
    var grid = [];
    for (var x=0, width=size[0]; x<width; x++) {
        var row = [];
        for(var y=0, height=size[1]; y<height; y++) row.push(fn([x,y]));
        grid.push(row);
    }
    return grid;
}

function make_grid_fast(size, value) {
    var grid = [];
    var w = size[0]-1, h = size[1]-1;
    for (var x=w; x>=0; x--) {
        var row = [];
        for(var y=h; y>=0; y--) row.push(value);
        grid.push(row);
    }
    return grid;
}

function iter_box(box, fn) {
    // Given a box, call fn with the position of each element.
    var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];

    for(var x=x1; x<x2; x++) {
        for(var y=y1; y<y2; y++) {
            fn([x, y]);
        }
    }
}

function iter_line(A, B, fn) {
    // Supercover line algorithm from point A to point B.
    // Visits every integer cell touched by the continuous segment.

    var x = A[0], y = A[1];
    var x2 = B[0], y2 = B[1];

    var dx = x2 - x, dy = y2 - y;
    var nx = Math.abs(dx), ny = Math.abs(dy);
    var sx = dx > 0 ? 1 : -1;
    var sy = dy > 0 ? 1 : -1;

    var ix = 0, iy = 0;
    var r;

    r = fn([x, y]);
    if(r==false) return false;

    while(ix < nx || iy < ny) {
        var decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;

        if(decision == 0) {
            // The segment goes exactly through a grid corner. Visit both
            // adjacent cells before advancing diagonally.
            if(ix < nx) {
                r = fn([x + sx, y]);
                if(r==false) return false;
            }
            if(iy < ny) {
                r = fn([x, y + sy]);
                if(r==false) return false;
            }

            x += sx;
            y += sy;
            ix++;
            iy++;

        } else if(decision < 0) {
            x += sx;
            ix++;

        } else {
            y += sy;
            iy++;
        }

        r = fn([x, y]);
        if(r==false) return false;
    }
}

function draw_grid_to_ctx(grid, ctx, box) {
    ctx.fillStyle = 'rgb(255,255,255)';
    iter_box(box, function(pos) {
        if(!grid[pos[0]][pos[1]]) return;
        ctx.fillRect(pos[0], pos[1], 1, 1);
    });
}

function ctx_xy_to_rgb(ctx, xy) {
    var img=ctx.getImageData(xy[0],xy[1],1,1);
    return [img.data[0], img.data[1], img.data[2]];
}


function flat_idx(dim, pos) {
    return (pos[0] * dim[0] * dim[2]) + (pos[1] * dim[2]) + pos[2];
}

function message(s) {
    if(message._target===undefined) message._target = document.getElementById("messages");
    message._target.innerHTML = s;
    return message;
}

function inverse_lookup(o) {
    var r = {};
    for(var k in o) {
        r[o[k]] = k;
    }
    return r;
}
var Clock = Class({
    init: function() {
        this.num_ticks = 0;
        this.time_ticked = Clock.now;
    },
    tick: function() {
        var delta = Clock.now - this.time_ticked;
        this.time_ticked = Clock.now;
        this.num_ticks++;
        return delta;
    },
    delta: function() {
        return Clock.now - this.time_ticked;
    }
});
Clock.update = function() {
    Clock.now = +new Date();
}
Clock.update();
/*

There's a good amount of repetitive code in this module for the sake of execution optimization.

*/


var CircleEntity = function(pos, radius) {
    this.pos = pos;
    this.radius = radius;
}



var BoxEntity = function(box) {
    this.box = box;
}


var PositionCollider = function(size) {
    this.size = size;
}
PositionCollider.prototype = {
    init: function() {
        this.grid = make_grid_fast(this.size, 0);
    },
    set: function(pos, value) {
        this.grid[pos[0]][pos[1]] = value;
    },
    set_box: function(box, value) {
        var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];

        var grid = this.grid;
        for(var x=x1; x<x2; x++) {
            for(var y=y1; y<y2; y++) {
                grid[x][y] = value;
            }
        }
    },
    set_from_canvas: function(ctx, box) {
        var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];
        var dx = x2-x1, dy = y2-y1;

        var data = ctx.getImageData(x1, y1, dx, dy).data;
        var grid = this.grid;

        var i = 3;
        for(var y=y1; y<y2; y++) {
            for(var x=x1; x<x2; x++) {
                grid[x][y] = data[i] == 255;
                i+= 4;
            }
        }
    },
    get: function(pos) {
        return this.grid[pos[0]][pos[1]] != false;
    }
}



var EntityCollider = function(size) {
    this.size = size;
}
EntityCollider.prototype = {
    init: function() {
        this.circles = [];
        this.boxes = [];
        this.collider = new PositionCollider(this.size);
        this.collider.init();
    },
    add: function(entity) {
        // XXX: Add entity to this.collider
        if(entity.box) {
            this.boxes.push(entity);
        } else if(entity.pos && entity.radius) {
            this.circles.push(entity);
        }
    },
    remove: function(entity) {
        var boxes = this.boxes;
        for(var i=boxes.length-1; i>=0; i--) {
            if(entity==boxes[i]) {
                boxes.splice(i, 1);
                return true;
            }
        }

        var circles = this.circles;
        for(var i=circles.length-1; i>=0; i--) {
            if(entity==circles[i]) {
                circles.splice(i, 1);
                return true;
            }
        }

    },
    get: function(pos) {
        if(!this.collider.get(pos)) return false;
        // FIXME: Should this be callback-based to handle multiple collisions?

        // Check boxes
        var boxes = this.boxes;
        for(var i=boxes.length-1; i>=0; i--) {
            var entity = boxes[i];
            if(in_boundary(pos, entity.box)) return entity;
        }

        // FIXME: No circles for now.
        return true;
        /*
        // Check circles
        var circles = this.circles;
        for(var i=circles.length-1; i>=0; i--) {
            var entity = circles[i];
            if(in_radius(pos, entity.pos, entity.radius)) return entity;
        }

        return true;
        */
    }
}

var Input = Class({
    bindings: {},
    pressed: {},
    queued: {},

    _handler_keydown: null,
    _handler_keyup: null,

    init: function() {
        var self = this;
        this._handler_keydown = function(e) { self.keydown(e); };
        this._handler_keyup = function(e) { self.keyup(e); };

        this.start_listening();
    },

    start_listening: function() {
        window.addEventListener('keydown', this._handler_keydown, false);
        window.addEventListener('keyup', this._handler_keyup, false);
    },
    stop_listening: function() {
        window.removeEventListener('keydown', this._handler_keydown);
        window.removeEventListener('keyup', this._handler_keyup);
    },
    bind_listen: function(action) {
        this.stop_listening();

        var self = this;
        function _handle_bind(e) {
            self.bindings[e.keyCode] = action;

            e.stopPropagation();
            e.preventDefault();

            window.removeEventListener('keydown', _handle_bind);

            self.start_listening();
        }
        window.addEventListener('keyup', _handle_bind, false);
    },

    keydown: function(e) {
        var action = this.bindings[e.keyCode];
        if(action) {
            this.pressed[action] = true;
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        var queue = this.queued[e.keyCode];
        if(queue) {
            queue.pop()();
        }
    },
    keyup: function(e) {
        var action = this.bindings[e.keyCode];
        if(action) {
            this.pressed[action] = false;
            e.stopPropagation();
            e.preventDefault();
        }
    },
    bind: function(d) {
        for(var k in d) {
            this.bindings[k] = d[k];
        }
    },
    queue: function(key, fn) {
        // Queue a one-time execution of fn when key is pressed.
        if(this.bindings[key]) throw Error('One-time bind must be an unassigned key.');

        var queue = this.queued[key] || [];
        queue.push(fn);

        this.queued[key] = queue;
    }
});

// Based on key codes from Google Closure
Input.KEY_CODES = {
    8: "BACKSPACE",
    9: "TAB",
    13: "ENTER",
    16: "SHIFT",
    17: "CTRL",
    18: "ALT",
    19: "PAUSE",
    20: "CAPS_LOCK",
    27: "ESC",
    32: "SPACE",
    33: "PAGE_UP",
    34: "PAGE_DOWN",
    35: "END",
    36: "HOME",
    37: "LEFT_ARROW",
    38: "UP_ARROW",
    39: "RIGHT_ARROW",
    40: "DOWN_ARROW",
    44: "PRINT_SCREEN",
    45: "INSERT",
    46: "DELETE",
    48: "0",
    49: "1",
    50: "2",
    51: "3",
    52: "4",
    53: "5",
    54: "6",
    55: "7",
    56: "8",
    57: "9",
    63: "?",
    65: "A",
    66: "B",
    67: "C",
    68: "D",
    69: "E",
    70: "F",
    71: "G",
    72: "H",
    73: "I",
    74: "J",
    75: "K",
    76: "L",
    77: "M",
    78: "N",
    79: "O",
    80: "P",
    81: "Q",
    82: "R",
    83: "S",
    84: "T",
    85: "U",
    86: "V",
    87: "W",
    88: "X",
    89: "Y",
    90: "Z",
    91: "META",
    93: "CONTEXT_MENU",
    96: "NUM_0",
    97: "NUM_1",
    98: "NUM_2",
    99: "NUM_3",
    100: "NUM_4",
    101: "NUM_5",
    102: "NUM_6",
    103: "NUM_7",
    104: "NUM_8",
    105: "NUM_9",
    106: "NUM_*",
    107: "NUM_+",
    109: "NUM_-",
    110: "NUM_PERIOD",
    111: "NUM_DIVISION",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NUMLOCK",
    186: ":",
    189: "-",
    187: "=",
    188: ",",
    190: ".",
    191: "/",
    192: "APOSTROPHE",
    222: "'",
    219: "[",
    220: "\\",
    221: "]",
    224: "WIN_KEY"};
function Player(config) {
    // Constants
    this.speed = 8; // Pixels per second
    this.turn_rate = this.speed / 5.5; // Radians per second
    this.angle = 0;

    this.max_time_alive = 0;
    this.num_wins = 0;
    this.num_deaths = 0;

    // Reset
    this.pos = [0, 0];
    this.reset();

    // Init
    this.color = config.color || 'rgb(255,255,255)';
    this.name = config.name || 'Anonymous';
    this.controls = config.controls;
}
Player.prototype = {
    reset: function(pos, angle) {
        this.is_active = true;
        this.pos = pos || [100 + Math.random() * 440, 100 + Math.random() * 280];
        this.angle = angle === undefined ? Math.random() * 2 : angle;
        this.move_buffer = null;
        this.score = 0;
    },
    move: function(ctx, level, time_delta) {
        if(this.move_buffer) {
            if(this.move_buffer == 'left') this.angle -= this.turn_rate * time_delta / 1000;
            else if(this.move_buffer == 'right') this.angle += this.turn_rate * time_delta / 1000;
        }

        var old_pos = this.get_pos();

        var x = this.pos[0], y = this.pos[1];
        var delta = rotate([this.speed * time_delta / 100, 0], this.angle * Math.PI);
        this.pos = [x + delta[0], y + delta[1]];

        var new_pos = this.get_pos();
        var self = this;

        // Skip render to rounding?
        if(new_pos[0] == old_pos[0] && new_pos[1] == old_pos[1]) return;

        if(!in_boundary(new_pos, [0,0,level.size[0]-1, level.size[1]-1])) {
            this.is_active = false;
            $(window).trigger('die', [self, Player.EVENTS.FALL_OFF]);

        } else if(this.is_active) {

            // FIXME: Clean this up, it's fugly.

            var collider = level.state.entity_collider.collider;

            iter_line(old_pos, new_pos, function(pos) {
                if(pos[0] == old_pos[0] && pos[1] == old_pos[1]) return true; // Skip the first one

                var hit = level.is_collision(pos);
                if(!hit) {
                    // FIXME: This is a ridiculous chain.
                    collider.set(pos, true);
                    return true;
                }

                if(hit===true) {
                    self.is_active = false;
                    $(window).trigger('die', [self, Player.EVENTS.COLLIDED])
                    new_pos = self.new_post = pos;
                    return false;
                }

                return hit.do_collision(self, ctx);
            });
        }

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(old_pos[0], old_pos[1]);
        ctx.lineTo(new_pos[0], new_pos[1]);
        ctx.stroke();
        return {
            old_pos: old_pos,
            new_pos: new_pos,
            color: this.color,
            active: this.is_active
        };
    },
    get_pos: function() {
        // Get normalized position on context
        return [Math.round(this.pos[0]), Math.round(this.pos[1])];
    }
}

Player.CONTROL_KEYS = ['left', 'right'];
Player.TEMPLATE_LIST = [
    {color: 'rgb(150,30,20)', name: 'Red Player', controls: {'left': 37, 'right': 39}}, // LEFT, RIGHT
    {color: 'rgb(40,70,140)', name: 'Blue Player', controls: {'left': 65, 'right': 83}}, // A, S
    {color: 'rgb(20,140,50)', name: 'Green Player', controls: {'left': 75, 'right': 76}}, // K, S
    {color: 'rgb(160,140,30)', name:  'Yellow Player', controls: {'left': 101, 'right': 103}} // NUM_4, NUM_6
]
Player.EVENTS = {
    FALL_OFF: 1,
    COLLIDED: 2,
    ESCAPED: 3,
    SURVIVED: 4
}
var EntityAnimator = function() {
    this.time_drawn = +new Date();
    this.init();
}
EntityAnimator.prototype = {
    init: function() {
        this.entities = [];
    },
    add: function(entity) {
        this.entities.push(entity);
    },
    remove: function(entity) {
        for(var entities=this.entities, i=entities.length-1; i>=0; i--) {
            if(entity==entities[i]) {
                entities.splice(i, 1);
                return true;
            }
        }
    },
    draw: function(ctx, now) {
        for(var entities=this.entities, i=entities.length-1; i>=0; i--) {
            var entity = entities[i];

            // TODO: Optimize this by keeping a sorted list of entities based
            // on their time to draw.
            if(entity.time_drawn && now - entity.time_drawn < entity.draw_rate) continue;

            entity.draw(ctx);
            entity.time_drawn = now;
        }
        this.time_drawn = now;
    }
}

// TODO: Figure out a way to evict entities on consumption.

// TODO: Abstract this into different types of inherited entities:
//  Animated / Static
//  Position / Box / Radius
//  Collidable / Ghost

function EndEntity(box) {
    this.box = box;

    this.center = boundary_center(box);
    this.length = Math.max(box[2]-box[0], box[3]-box[1]);
}
EndEntity.prototype = {
    is_collidable: true,

    draw: function(ctx) {
        var box = this.box;
        var center = this.center;

        var gradient = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], this.length);

        gradient.addColorStop(0, "rgb(0,0,0)");
        gradient.addColorStop(0.4, "rgb(230,170,0)");
        gradient.addColorStop(0.9, "rgb(0,0,0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(box[0], box[1], box[2]-box[0], box[3]-box[1]);

        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeWidth = 1;
        ctx.strokeRect(box[0], box[1], box[2]-box[0], box[3]-box[1]);

        return true;
    },
    is_collision: function(pos) {
        return in_boundary(pos, this.box);
    },
    do_collision: function(player) {
        player.is_active = false;
        player.score += 1000;
        $("#score").text(player.score);
        $(window).trigger('win', [player, Player.EVENTS.ESCAPED]);
        return false;
    }
}

function BonusEntity(pos) {
    this.pos = pos;
    this.radius = 6;
    this.box = this.get_boundary();
    this.is_active = true;
    this.is_drawn = false;
}
BonusEntity.prototype = {
    is_collidable: true,

    is_collision: function(pos) {
        return in_boundary(pos, this.box);
    },
    do_collision: function(player, ctx) {
        if(!this.is_active) return;

        this.is_active = false;
        player.score += 100;
        message("Yum.");
        $("#score").text(player.score);

        this.clear(ctx);
    },
    get_boundary: function() {
        var x = this.pos[0], y = this.pos[1], radius=this.radius;
        return [x-radius, y-radius, x+radius, y+radius];
    },
    draw: function(ctx) {
        var x = this.pos[0], y = this.pos[1], radius=this.radius;

        ctx.beginPath();
        ctx.arc(x, y, radius - 0.5, 0, Math.PI*2);
        ctx.closePath();
        ctx.fillStyle = 'rgb(190,10,10)';
        ctx.strokeStyle = 'rgb(120,0,0)';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgb(225,150,150)';
        ctx.fillRect(x-radius*0.6, y-radius*0.6, 2, 2);
    },
    clear: function(ctx) {
        var box = this.get_boundary();
        ctx.clearRect(box[0], box[1], box[2]-box[0], box[3]-box[1]);

        // XXX: Remove bits from PositionCollider
        // XXX: Request eviction from animator, entity collider.
    }
}

function Level(config) {
    this.src = config.url;
    this.img = new Image();

    this.config = config;
    this.name = config.name
    this.description = config.description;
    this.min_players = config.min_players || 0;
    this.max_players = Math.min(config.min_players || 4, this.min_players);
    this.is_deathmatch = config.is_deathmatch || false;

    this.size = [640,480];

    this.unload();
}
Level.last_loaded = null;
Level.prototype = {
    unload: function() {
        this.is_loaded = false;
        this.state = null;
    },
    load: function(contexts, size, callback) {
        this.size = size;

        if(Level.last_loaded && Level.last_loaded != this) Level.last_loaded.unload();

        var self = this;
        var process = function() {
            var ctx = contexts.level;
            ctx.clearRect(0, 0, size[0], size[1]);
            ctx.drawImage(self.img, 0, 0);

            if(!self.is_loaded) {
                self.is_loaded = true;
                self.state = new LevelState(size, self.config.entities, contexts);
            }

            if(callback!==undefined) callback();
        }

        if(this.img.src) {
            process();
        } else {
            this.img.src = this.src;
            this.img.onload = process;
        }

        Level.last_loaded = self;
    },
    is_collision: function(pos) {
        if(this.state.level_collider.get(pos)) return true;

        return this.state.entity_collider.get(pos);
    }
}

function LevelState(size, entities, contexts) {
    this.size = size;
    this.entities = entities;
    this.contexts = contexts;

    // TODO: Should these all compound each other?
    this.entity_collider = new EntityCollider(this.size);
    this.level_collider = new PositionCollider(this.size);

    this.level_collider.init();
    this.level_collider.set_from_canvas(contexts.level, [0, 0, this.size[0], this.size[1]]);

    this.reset();
}
LevelState.prototype = {
    load_entities: function() {
        var entities = this.entities;
        if(!entities) return;

        var ctx = this.contexts.entities;

        for(var i=entities.length-1; i>=0; i--) {
            var e = entities[i];

            switch(e.type) {
                case 'START':
                    this.start_positions.push({'pos': e.pos, 'angle': e.angle});
                    break;
                case 'END':
                    this.is_deathmatch = false;

                    var entity = new EndEntity(e.box);
                    this.entity_collider.add(entity);
                    entity.draw(ctx);
                    this.entity_collider.collider.set_box(entity.box);

                    break;
                case 'BONUS':
                    var entity = new BonusEntity(e.pos);

                    this.entity_collider.add(entity);
                    entity.draw(ctx);
                    this.entity_collider.collider.set_box(entity.get_boundary());

                    break;
            }
        }
    },
    reset: function() {
        this.start_positions = [];
        this.is_deathmatch = true;
        this.score = 0;

        var ctx = this.contexts.entities;
        ctx.clearRect(0, 0, this.size[0], this.size[1]);

        this.entity_collider.init();

        this.load_entities();
    }
}



function LevelPack(name, levels, mode) {
    this.name = name;
    this.levels = levels;
    this.current_level = 0;
    this.mode = mode || LevelPack.MODES.NORMAL;
}
LevelPack.MODES = {
    NORMAL: 0,
    LOOP: 1,
    RANDOM: 2
}
LevelPack.prototype = {
    next: function() {
        if(this.current_level >= this.levels.length-1) {
            if(this.mode==LevelPack.MODES.NORMAL) return false;
            else if(mode==LevelPack.MODES.LOOP) this.current_level = 0;
        }
        if(this.mode==LevelPack.MODES.RANDOM) this.current_level = Math.floor(Math.random() * (this.levels.length - 1));
        else this.current_level++;
        return this.levels[this.current_level];
    },
    first: function() {
        this.current_level = 0;
        return this.levels[this.current_level];
    }
}
function Hud(game, target) {
    this.game = game;
    this.target = $(target);
    this.packs = [];
    this.active = false;

    var self = this;
    this.logo = $("h1:first").click(function() {
        if(!self.active) {
            self.game.pause();
            self.show("packs");
        } else if(self.game.is_fresh) {
            self.hide();
            self.game.resume();
        }
    });
}
Hud.prototype = {
    add_pack: function(pack) {
        this.packs.push(pack);
    },
    draw: function() {
        var hud = $(this.target).empty();

        var game = this.game;

        var description = $('<div id="description" class="state"></div>').hide();
        this.description = $(description).appendTo(hud);

        var self = this;

        var packs_menu = $('<div id="packs" class="state"></div>').hide();
        $(this.packs).each(function(i, pack) {
            packs_menu.append('<h2>' + pack.name + '</h2>');

            var levels_list = $('<ol></ol>');
            $(pack.levels).each(function(j, level) {
                $('<li>' + level.name + '</li>').click(function() {

                    game.is_ready = false;
                    message("Loading.");

                    game.load_level(level, function() {
                        if(level.description) {
                            $(description).html(level.description);
                            self.show('description');
                        } else {
                            $(description).html("");
                            self.hide();
                        }
                        game.is_ready = true;
                        game.reset();
                        game.continue_fn = game.resume;
                        message("Ready? Press <em>Space</em> to start.");
                    });

                }).appendTo(levels_list);
            });
            packs_menu.append(levels_list);
        });
        this.packs_menu = $(packs_menu).appendTo(hud);
    },
    show: function(id) {
        $('.state', this.target).hide();
        this.active = $('#' + id + '.state', this.target).show();
        $(this.target).show();
        if(id=="packs") $(this.logo).addClass("active");
        else $(this.logo).removeClass("active");
    },
    hide: function() {
        this.active = false;
        $(this.target).hide();
        $(this.logo).removeClass("active");
    }
}
var Game = Class({
    container: null,
    layers: [],

    /**
     * @param {Camera} camera       Camera element responsible for drawing the viewport.
     * @param {number=} num_layers  Number of canvas layers to create.
     */
    init: function(camera, num_layers) {
        this.container = camera.element;

        var attrs = {'width': camera.width, 'height': camera.height};

        var i = num_layers || 1;

        while(i--) {
            var layer = Dom.create("canvas", attrs);
            this.layers.push(layer.getContext('2d'));
            this.container.appendChild(layer);
        }
    }
});

function set_touch_start_label(label) {
    $('#touch-start').text(label).attr('aria-label', label);
}

function set_touch_start_visible(isVisible) {
    $('#touch-start')
        .css('visibility', isVisible ? 'visible' : 'hidden')
        .attr('aria-hidden', isVisible ? 'false' : 'true');
}

function set_touch_turn_color(player) {
    if(!player) return;
    $('#touch-left, #touch-right').css({
        'background-color': player.color,
        'border-color': player.color,
        'color': '#fff'
    });
}


function LineRageGame(canvases) {
    // TODO: Put these guys into a clojure scope to reduce instance access
    this.contexts = {
        'level': canvases['static'].getContext("2d"),
        'entities': canvases['dynamic'].getContext("2d")
    }
    this.contexts.entities.lineWidth = 1.5;

    this.size = [canvases['static'].width, canvases['static'].height];

    this.players = [];
    this.num_players = this.players.length;
    this.num_active = this.num_players;
    this.num_end = Math.min(1, this.num_players-1);

    this.is_ready = false;
    this.is_fresh = false;
    this.is_paused = true;
    this.is_ended = true;

    this.loop = null;
    this.time_last_tick = null;
    this.time_started = null;

    this.levelpack = null;
    this.level = null;

    var self = this;
    var tick_num = 0;

    var entity_context = this.contexts.entities;

    var game_tick = function() {
        var now = +new Date();
        var time_delta = now - self.time_last_tick;
        var segments = [];

        if(self.is_paused) return;

        for(var i=0; i<self.num_players; i++) {
            var p = self.players[i];
            if(p.is_active) {
                var segment = p.move(entity_context, self.level, time_delta);
                if(segment) segments.push(segment);
            }
        }

        self.time_last_tick = now;
        tick_num++;
        if(self.multiplayer && self.multiplayer.after_tick) self.multiplayer.after_tick(segments);
    }
    this.game_loop = function() {
        game_tick();
        if(stats!==undefined) stats.update();
    }

    this.continue_fn = this.reset;

    // Bind controls
    window.onkeydown = function(e) {
        // Find which player owns the key
        if(self.multiplayer && self.multiplayer.handle_key && self.multiplayer.handle_key(e, true)) return false;
        if(e.which == 32) {
            return self.continue_fn();
        }

        var player_action = self._controls_cache[e.which];
        if(player_action) {
            player_action[0].move_buffer = player_action[1];
            game_tick();
        }
    };
    window.onkeyup = function(e) {
        if(self.multiplayer && self.multiplayer.handle_key && self.multiplayer.handle_key(e, false)) return false;
        if(e.which == 32) return;

        var player_action = self._controls_cache[e.which];
        if(player_action && player_action[0].move_buffer == player_action[1]) {
            player_action[0].move_buffer = null;
            game_tick();
        }
    };

    this.add_player();

    $(window).bind('win', function(e, player, how) {
        e.stopPropagation();

        self.end();
        player.num_wins++;
        player.max_time_alive = Math.max(player.max_time_alive, self.time_last_tick - self.time_started);

        if(how==Player.EVENTS.ESCAPED) {
            message(player.name + " escaped successfully!");
        } else {
            message(player.name + " wins!");
        }

        if(self.levelpack) {
            var m = self.levelpack.next();
            if(!m) {
                message("Winner is you.");
                return false;
            }
            self.continue_fn = function() {
                message("Loading.");
                self.load_level(m, function() {
                    self.is_ready = true;
                    self.reset();
                    message("Ready?");
                    self.continue_fn = self.resume;
                });
            }
        } else {
            self.continue_fn = function() {
                hud.show("packs");
                self.continue_fn = function() {
                    self.reset();
                    hud.show("description");
                    message("Ready?");
                    self.continue_fn = self.resume;
                }
            }
        }
        return false;
    }).bind('die', function(e, player, how) {
        e.preventDefault();
        e.stopPropagation();
        self.num_active--;
        player.is_active = false;

        player.max_time_alive = Math.max(player.max_time_alive, self.time_last_tick - self.time_started);
        player.num_deaths++;

        if(self.num_active<=self.num_end) {
            $(window).trigger('lose', [player, how]);
            return false;
        }
        if(how==Player.EVENTS.FALL_OFF) {
            message(player.name + " fell off. lol!");
        } else if(how==Player.EVENTS.COLLIDED) {
            message(player.name + " collided.");
        } else {
            message(player.name + " died.");
        }
        return false;
    }).bind('lose', function(e, player, how) {
        if(self.level.is_deathmatch) {
            // Find active player
            var players = self.players;
            for(var i=players.length-1; i>=0; i--) {
                if(players[i].is_active) {
                    $(window).trigger('win', [players[i], Player.EVENTS.SURVIVED]);
                    return;
                }
            }
        } else if(self.num_players > 1) {
            message("Complete failure.");
        } else if(how==Player.EVENTS.COLLIDED || how==Player.EVENTS.FALL_OFF) {
            message("You died.");
        } else {
            message("You lose.");
        }
        self.end();
        return false;
    });
}
LineRageGame.prototype = {
    pause: function() {
        clearInterval(this.loop);

        message("Paused.");
        this.is_paused = true;
        this.continue_fn = this.resume;
        if(this.multiplayer && this.multiplayer.on_pause) this.multiplayer.on_pause();
    },
    resume: function() {
        hud.hide();
        message("");
        set_touch_start_visible(false);
        this.is_paused = false;
        this.continue_fn = this.pause;
        this.is_fresh = false;

        this.time_last_tick = +new Date();
        this.loop = setInterval(this.game_loop, 1000 / 30);
        if(this.multiplayer && this.multiplayer.on_resume) this.multiplayer.on_resume();
    },
    end: function() {
        clearInterval(this.loop);

        this.is_ended = true;
        this.is_paused = true;
        set_touch_start_label('Ready?');
        set_touch_start_visible(true);

        var self = this;
        this.continue_fn = function() {
            self.reset();
            hud.show("description");
            message("Ready?");
            self.continue_fn = self.resume;
        }
        if(this.multiplayer && this.multiplayer.on_end) this.multiplayer.on_end();
    },
    reset: function() {
        if(!this.is_ready) return;

        var starts = this.level.state.start_positions;

        for(var i=0; i<this.num_players; i++) {
            var start_obj = starts[i] || {};
            this.players[i].reset(start_obj.pos, start_obj.angle);
        }
        this.time_started = +new Date();
        this.num_active = this.num_players;
        this.is_ended = false;
        set_touch_start_label('Ready?');
        set_touch_turn_color(this.players[0]);
        set_touch_start_visible(true);
        this.continue_fn = this.pause;

        this.is_fresh = true;

        this._refresh_game_conditions();
        this.level.state.reset();

        $("#score").text("0");
        if(this.multiplayer && this.multiplayer.on_reset) this.multiplayer.on_reset();
    },
    add_player: function() {
        if(!this.is_ended || this.num_players >= 4) return;
        this.players.push(new Player(Player.TEMPLATE_LIST[this.num_players]));
        this.num_players = this.players.length;
        this._refresh_controls_cache();
    },
    remove_player: function() {
        if(!this.is_ended || this.num_players <= 1) return;
        this.players.pop();
        this.num_players = this.players.length;
        this._refresh_controls_cache();
    },
    set_player_count: function(count) {
        count = Math.max(1, Math.min(4, count));
        while(this.players.length < count) {
            this.players.push(new Player(Player.TEMPLATE_LIST[this.players.length]));
        }
        while(this.players.length > count) {
            this.players.pop();
        }
        this.num_players = this.players.length;
        this._refresh_controls_cache();
        this._refresh_game_conditions();
    },
    _refresh_game_conditions: function() {
        if(!this.level.is_deathmatch) {
            this.num_end = 0;
        } else {
            this.num_end = Math.min(1, this.num_players-1);
        }
    },
    load_level: function(level, callback) {
        this.end();
        var self = this;
        this.level = level;
        level.load(this.contexts, this.size, function() {
            for(var i=0; self.num_players < level.min_players && i<5; i++) self.add_player();
            for(var i=0; self.num_players > level.max_players && i<5; i++) self.remove_player();

            if(callback!==undefined) callback.call(this);
        });

    },
    _refresh_controls_cache: function() {
        var cache = {};
        for(var i=0, istop=this.players.length; i<istop; i++) {
            var p = this.players[i];
            for(var j=0, jstop=Player.CONTROL_KEYS.length; j<jstop; j++) {
                var name = Player.CONTROL_KEYS[j];
                cache[p.controls[name]] = [p, name];
            }
        }
        this._controls_cache = cache;
    }
}
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
        box.append('<div id="net-controls"><button id="net-host">Host Game</button><button id="net-copy" class="online-only">Copy Invite</button><input id="net-link" class="online-only" readonly="readonly" aria-label="Invite link" title="Click to select invite link" placeholder="Invite link" /></div>');
        box.append('<div id="net-meta"><span id="net-room" class="online-only">Room: —</span><span id="net-players">Joined: 1/4</span><span id="net-status">Offline hotseat mode.</span></div>');
        $('#content').prepend(box);

        $('#net-host').click(function() { self.host(); });
        $('#net-copy').click(function() { self.copy_link(); });
        $('#net-link').focus(function() { this.select(); });
        $('#net-link').click(function() { this.select(); });
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
    set_room_code: function(hostId) {
        $('#net-room').html('Room: ' + hostId);
    },
    update_lobby: function(extra) {
        var count = this.joined_count();
        $('#net-players').html('Joined: ' + count + '/' + this.maxPlayers);
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
        this.role = 'host';
        this.localIndex = 0;
        $('#network').addClass('online');
        $('#net-copy').text('Copy Invite');
        this.peer = new Peer(this.random_token());
        this.peer.on('open', function(id) {
            self.set_room_code(id);
            $('#net-link').val(self.invite_url(id));
            self.update_lobby();
            self.prepare_online_game(function() {
                self.ready = true;
            });
        });
        this.peer.on('connection', function(conn) { self.accept(conn); });
        this.peer.on('error', function(err) {
            if(err && err.type == 'unavailable-id') self.set_status('Room token taken. Try Host Game again.');
            else self.set_status('Host error: ' + err);
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
        this.role = 'guest';
        $('#network').addClass('online');
        $('#net-copy').text('Copy Invite');
        this.set_room_code(hostId);
        $('#net-link').val(this.invite_url(hostId));
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
                self.broadcast({type: 'end', snapshot: self.snapshot(), message: $('#messages').html()});
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
            if(msg.message) message(msg.message);
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
        if(this.game.multiplayer && this.game.multiplayer.role != 'offline') {
            this.game.multiplayer.handle_move(move, isDown);
        } else {
            var player = this.game.players[0];
            if(player) player.move_buffer = isDown ? move : null;
        }
        if(!this.game.is_paused && this.game.game_loop) this.game.game_loop();
    }
};
var game, hud, stats, multiplayer, touchControls, levelpacks = [];
$(document).ready(function() {
    $("body").disableTextSelect();
    game = new LineRageGame({
        'static': document.getElementById("static_canvas"),
        'dynamic': document.getElementById("dynamic_canvas")
    });

    hud = new Hud(game, $("#hud"));
    function load_levelpack(pack) {
        if(!pack.manifest) return;

        var levels = [];
        for(var j=0, jstop=pack.manifest.levels.length; j<jstop; j++) {
            levels.push(new Level(pack.manifest.levels[j]));
        }
        var levelpack = new LevelPack(pack.name, levels);

        hud.add_pack(levelpack);
    };

    load_levelpack(
        {"name": "Singleplayer Puzzles", "manifest":
            {"levels": [
                {"name": "White Level",
                    "url": "levels/easy/white.png",
                    "description": "<p>Use the arrow keys (left and right) to maneuver your line to the yellow portal.</p><p>Don't hit things. Try to get the delicious red circles for bonus points.</p>",
                    "entities": [
                        {"type": "START", "pos": [5, 5], "angle": 0.25},
                        {"type": "END", "box": [350, 250, 370, 270]},
                        {"type": "BONUS", "pos": [150,150]},
                        {"type": "BONUS", "pos": [300,50]},
                        {"type": "BONUS", "pos": [500,125]},
                        {"type": "BONUS", "pos": [50,320]},
                        {"type": "BONUS", "pos": [600,350]}
                    ]
                },
                {"name": "Pink Level",
                    "url": "levels/easy/pink.png",
                    "description": "<p>You might not get all the bonus points on the first try. There is always tomorrow.</p>",
                    "entities": [
                        {"type": "START", "pos": [200, 2], "angle": 0.35},
                        {"type": "END", "box": [300, 200, 320, 220]},
                        {"type": "BONUS", "pos": [575,75]},
                        {"type": "BONUS", "pos": [440,200]},
                        {"type": "BONUS", "pos": [535,360]},
                        {"type": "BONUS", "pos": [100,300]},
                        {"type": "BONUS", "pos": [170,150]}
                    ]
                },
                {"name": "Orange Level",
                    "url": "levels/easy/orange.png",
                    "description": "",
                    "entities": [
                        {"type": "START", "pos": [2, 164], "angle": 0},
                        {"type": "END", "box": [600,350,620,370]},
                        {"type": "BONUS", "pos": [230,70]},
                        {"type": "BONUS", "pos": [625,25]},
                        {"type": "BONUS", "pos": [630,250]},
                        {"type": "BONUS", "pos": [325,150]},
                        {"type": "BONUS", "pos": [75,350]},
                        {"type": "BONUS", "pos": [330,430]},
                        {"type": "BONUS", "pos": [625,460]},
                        {"type": "BONUS", "pos": [500,360]}
                    ]
                },
                {"name": "Green Level",
                    "url": "levels/easy/green.png",
                    "description": "",
                    "entities": [
                        {"type": "START", "pos": [2, 2], "angle": 0.30},
                        {"type": "END", "box": [375,200,395,220]},
                        {"type": "BONUS", "pos": [520,55]},
                        {"type": "BONUS", "pos": [610,65]},
                        {"type": "BONUS", "pos": [580,430]},
                        {"type": "BONUS", "pos": [500,355]},
                        {"type": "BONUS", "pos": [90,415]},
                        {"type": "BONUS", "pos": [105,140]},
                        {"type": "BONUS", "pos": [510,265]},
                        {"type": "BONUS", "pos": [240,275]}
                    ]
                }
            ]}
        }
    );

    load_levelpack(
        {"name": "Hotseat Deathmatch", "manifest":
            {"levels": [
                {"name": "Two Players",
                    "url": "levels/deathmatch/blank.png",
                    "description": "<p>Player 1 controls: Arrow keys</p><p>Player 2 controls: A/S</p>",
                    "is_deathmatch": true,
                    "max_players": 4,
                    "min_players": 2
                },
                {"name": "Three Players",
                    "url": "levels/deathmatch/blank.png",
                    "description": "<p>Player 1 controls: Arrow keys</p><p>Player 2 controls: A/S</p><p>Player 3 controls: K/L</p>",
                    "is_deathmatch": true,
                    "max_players": 3,
                    "min_players": 3
                },
                {"name": "Four Players",
                    "url": "levels/deathmatch/blank.png",
                    "description": "<p>Player 1 controls: Arrow keys</p><p>Player 2 controls: A/S</p><p>Player 3 controls: K/L</p><p>Player 4 controls: Num Pad</p>",
                    "is_deathmatch": true,
                    "max_players": 4,
                    "min_players": 4
                }
            ]}
        }
    );

    hud.draw();
    hud.show('packs');
    multiplayer = new Multiplayer(game);
    game.multiplayer = multiplayer;
    touchControls = new TouchControls(game);
});
