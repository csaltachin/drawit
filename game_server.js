//
// drawit | server
//

const HTMLEntities = require("html-entities").AllHtmlEntities;
const Entities = new HTMLEntities();
const PORT = 3000;
const mainIO = require("socket.io")(PORT);

// Game states, rooms, commands
const GAMESTATES = {
    UNINITIALIZED: 0,
    AWAITING_START: 1,
    CHOOSING_WORD: 2,
    GUESSING: 3,
    TIME_UP_OR_GUESSED: 4,
    GAME_FINISHED: 5,
}

class GameRoom {
    constructor(_socket, roomNumber) {
        this.sockets = new Array();
        this.sockets.push(_socket);
        this.roomNumber = roomNumber;
        this.state = GAMESTATES.AWAITING_START;
        this.adminSocket = _socket;
        this.artistIndex = null;
        this.scores = {}; // Maps socket.id's to scores
        this.scores[_socket.id] = 0;
        this.currentWord = null;
        this.currentRound = 0;
        this.rounds = 0;
        this.roundTime = 0; // In seconds
        this.chooseTime = 0; // In seconds
        this.currentTimeout = null;
    }
    addPlayerToRoom(_socket) {
        this.sockets.push(_socket);
        this.scores[_socket.id] = 0;
        _socket.emit("broadcastServerMessageSignal", {message: `<i>You have joined room #${this.roomNumber}!</i>`, bg: "green"});
    }
    startGame(rounds, roundTime, chooseTime) {
        // Default values
        this.rounds = typeof rounds == "undefined" ? 6 : rounds;
        this.roundTime = typeof roundTime == "undefined" ? 90 : roundTime;
        this.chooseTime = typeof chooseTime == "undefined" ? 30 : chooseTime;
        // Check more than one player
        if(this.sockets.length < 2) throw "You need at least 2 players to start a game!";
        // Start game at round 1
        this.currentRound = 1;
        this.artistIndex = Math.floor(Math.random() * this.sockets.length); // Random starting artist index
        this.startRound();
    }
    startRound() {
        this.state = GAMESTATES.CHOOSING_WORD;
        let artistSocket = this.sockets[this.artistIndex];
        // Clear/lock all canvases, send server messages, start all countdowns
        for(let _socket of this.sockets) {
            _socket.emit("clearCanvasSignal");
            _socket.emit("lockCanvasSignal");
            _socket.emit("broadcastServerMessageSignal", {message: `<i><b>Round ${this.currentRound}</b> has
                started! It's <b>${NAMES[artistSocket.id]}</b> turn to draw.</i>`, bg: "green"});
            if(_socket.id == artistSocket.id) {
                _socket.emit("broadcastServerMessageSignal", {message: `<i>Choose a word by typing <b>/word
                    [chosen word]</b>. You have ${this.chooseTime} seconds!</i>`, bg: "yellow"});
            }
            else {
                _socket.emit("broadcastServerMessageSignal", {message: `<i>${NAMES[artistSocket.id]} is choosing a word...</i>`, bg: "yellow"});
            }
            _socket.emit("startCountdownSignal", {desc: "choosing...", seconds: this.chooseTime});
        }
        // Set choosing-word timeout
        this.currentTimeout = setTimeout(() => {
            this.timeupChoose(); // Pass this GameRoom instance as argument to be able to access the context
        }, this.chooseTime * 1000);
    }
    timeupChoose() {
        let artistID = NAMES[this.sockets[this.artistIndex].id];
        for(let _socket of this.sockets) {
            _socket.emit("broadcastServerMessageSignal", {message: `<i><b>${artistID}</b> ran out of time!</i>`, bg: "yellow"});
        }
    }
    scoreFromSocket(_socket) {
        return this.scores[_socket.id];
    }
}

var ROOMS = {}; // Maps socket.id's to GameRoom objects
var OPEN_ROOMS = new Map(); // Maps open room numbers to GameRoom objects
var NAMES = {}; // Maps socket.id's to usernames
const COMMANDS = {
    // These all take the requester socket and the token list as arguments
    name: (_socket, _tokens) => {
        if(_tokens.length < 2 || _tokens.slice(1).findIndex((v) => {return v != ""}) < 0) {
            throw "Your new name cannot be an empty one!";
        }
        let old_name = NAMES[_socket.id];
        let new_name = _tokens.slice(1).join(" ");
        NAMES[_socket.id] = new_name;
        _socket.emit("nameChangeSignal", new_name);
        _socket.emit("broadcastServerMessageSignal", {message: `<i>You changed your name to <b>${Entities.encode(new_name)}</b>!</i>`, bg: "green"});
        _socket.broadcast.emit("broadcastServerMessageSignal", {message: `<i><b>${Entities.encode(old_name)}</b> has
            changed their name to <b>${Entities.encode(new_name)}</b>!</i>`, bg: "green"});
    },
    open: (_socket, _tokens) => {
        // Check if can open room
        if(_tokens.length < 2) throw "You must specify a room number!";
        if(ROOMS.hasOwnProperty(_socket.id)) throw `You are already in room #${ROOMS[_socket.id].roomNumber}! You must leave
            this room first before opening a new one.`;
        // Room number
        let newRoomNumber = parseInt(_tokens[1]);
        if(isNaN(newRoomNumber)) throw "The room number must be a valid positive integer!";
        if(OPEN_ROOMS.has(newRoomNumber)) throw `Room #${newRoomNumber} is already open! Use '/join ${newRoomNumber}' to join it.`
        // Open room
        let newRoom = new GameRoom(_socket, newRoomNumber);
        ROOMS[_socket.id] = newRoom;
        OPEN_ROOMS.set(newRoomNumber, newRoom);
        _socket.emit("broadcastServerMessageSignal", {message: `<i>You have opened room #${newRoomNumber}!</i>`, bg: "green"});
        _socket.emit("updateRoomSignal", newRoomNumber);
    },
    join: (_socket, _tokens) => {
        // Check if can join room
        if(_tokens.length < 2) throw "You must specify a room number!";
        if(ROOMS.hasOwnProperty(_socket.id)) throw `You are already in room #${ROOMS[_socket.id].roomNumber}! You must leave
            this room first before joining a new one.`;
        // Room number
        let joinRoomNumber = parseInt(_tokens[1]);
        if(isNaN(joinRoomNumber)) throw "The room number must be a valid positive integer!";
        if(!OPEN_ROOMS.has(joinRoomNumber)) throw `Room #${joinRoomNumber} hasn't been opened
            yet! You can open it by doing '/open ${joinRoomNumber}'.`
        // Join room
        ROOMS[_socket.id] = OPEN_ROOMS.get(joinRoomNumber);
        ROOMS[_socket.id].addPlayerToRoom(_socket);
        _socket.emit("updateRoomSignal", joinRoomNumber);
    },
    start: (_socket, _tokens) => {
        //_socket.emit("broadcastServerMessageSignal", {message: `<i>[/start] This command is not available yet!</i>`, bg: "red"});
        let thisRoom = ROOMS[_socket.id];
        if(_socket.id == thisRoom.adminSocket.id) {
            thisRoom.startGame(_tokens[1], _tokens[2], _tokens[3]);
        }
        else {
            throw `You're not the admin of this room! Ask ${NAMES[thisRoom.adminSocket.id]} to start the game.`;
        }
    },
    word: (_socket, _tokens) => {
        _socket.emit("broadcastServerMessageSignal", {message: `<i>This command is not available yet!</i>`, bg: "red"});
    }
}

// Socket.io listeners
mainIO.on("connection", (socket) => {
    // Welcome
    socket.emit("serverLogSignal", "Hello new user!");
    socket.on("disconnect", () => {
        socket.broadcast.emit("broadcastServerMessageSignal", {message: `<i><b>${Entities.encode(NAMES[socket.id])}</b> left.</i>`, bg: "red"});
    });

    // Set listeners for events emitted by this socket (user)
    // Chat signals
    socket.on("newUserSignal", (name) => {
        NAMES[socket.id] = name;
        console.log(`New user: ${name} (socket ID = ${socket.id})`);
        socket.emit("serverLogSignal", `${name}! That's a nice name!`);
        mainIO.sockets.emit("broadcastServerMessageSignal", {message: `<i><b>${Entities.encode(name)}</b> joined!</i>`, bg: "green"})
    });
    socket.on("messageSentSignal", (message) => {
        console.log(`New message from ${NAMES[socket.id]} >> ${message}`);
        // Encode message (will be passed in to html field)
        encoded_message = Entities.encode(message);
        socket.emit("broadcastChatMessageSignal", {name: "(you)", message: encoded_message})
        socket.broadcast.emit("broadcastChatMessageSignal", {name: NAMES[socket.id], message: encoded_message});
    });
    socket.on("commandSentSignal", (command_string) => {
        let tokens = command_string.substring(1).split(" ");
        try {
            COMMANDS[tokens[0]](socket, tokens);
        }
        catch(err) {
            if(typeof err == "string") {
                socket.emit("broadcastServerMessageSignal", {message: `<i>${Entities.encode(err)}</i>`, bg: "red"});
            }
            else {
                console.log("[UnhandledError] " + err);
                socket.emit("broadcastServerMessageSignal", {message: `<i>Sorry, <b>/${tokens.length > 0 ? tokens[0] : ""}</b> is not a 
                    valid command.</i>`, bg: "red"});
            }
        }
    });
    // Canvas signals
    socket.on("penDownSignal", (pos) => {
        socket.broadcast.emit("penDownSignal", pos);
    });
    socket.on("penLineSignal", (pos) => {
        socket.broadcast.emit("penLineSignal", pos);
    });
    socket.on("penUpSignal", () => {
        socket.broadcast.emit("penUpSignal");
    });
    socket.on("clearCanvasSignal", () => {
        socket.broadcast.emit("clearCanvasSignal");
    });
    socket.on("changeColorSignal", (color) => {
        socket.broadcast.emit("changeColorSignal", color);
    });
    socket.on("changeSizeSignal", (size) => {
        socket.broadcast.emit("changeSizeSignal", size);
    });
    // Debug signals
    socket.on("reqServerLogSignal", (req_str) => {
        socket.emit("serverLogSignal", `${eval(req_str)}`);
    });
});