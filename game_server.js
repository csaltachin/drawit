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
    INTERMISSION: 4,
    GAME_OVER: 5,
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
        this.currentGuesses = 0;
        this.rounds = 0;
        this.roundTime = 0; // In seconds
        this.chooseTime = 0; // In seconds
        this.currentTimeout = null;
        this.penSize;
        this.penColor;
    }
    addPlayer(_socket) {
        this.sockets.push(_socket);
        this.scores[_socket.id] = 0;
        _socket.emit("setLabelsSignal", {
            artistLabel: "waiting for players..."
        });
        _socket.emit("broadcastServerMessageSignal", {
            message: `<i>You have joined room <b>#${this.roomNumber}</b>!</i>`,
            color: "blue"
        });
    }
    removePlayer(_socket) {
        delete this.scores[_socket.id];
        for(let i = 0; i < this.sockets.length; i++) {
            if(this.sockets[i].id == _socket.id) {
                this.sockets.splice(i, 1);
                break;
            }
        }
        _socket.emit("broadcastServerMessageSignal", {
            message: `<i>You have left room <b>#${this.roomNumber}</b>.</i>`,
            color: "blue"
        });
    }
    startGame(rounds, roundTime, chooseTime) {
        // Default values
        this.rounds = typeof rounds == "undefined" ? 6 : parseInt(rounds);
        this.roundTime = typeof roundTime == "undefined" ? 90 : parseInt(roundTime);
        this.chooseTime = typeof chooseTime == "undefined" ? 30 : parseInt(chooseTime);
        // Check more than one player
        if(this.sockets.length < 2) throw "You need at least 2 players to start a game!";
        // Synchronize pen color/size with respect to admin
        this.adminSocket.emit("requestPenUpdateSignal");
        // Start game at round 1
        this.currentRound = 1;
        this.artistIndex = Math.floor(Math.random() * this.sockets.length); // Random starting artist index
        this.startRound();
    }
    startRound() {
        // Set state, artist
        this.state = GAMESTATES.CHOOSING_WORD;
        this.currentGuesses = 0;
        let artistSocket = this.sockets[this.artistIndex];
        // Clear/lock all canvases, send server messages, start all countdowns
        for(let _socket of this.sockets) {
            // Set labels
            _socket.emit("setLabelsSignal", {
                roundLabel: "round ",
                roundDisplay: this.currentRound,
                artistLabel: "artist ",
                artistDisplay: Entities.encode(NAMES[artistSocket.id]),
                timerLabel: "time ",
                timerDisplay: this.chooseTime
            });
            _socket.emit("clearCanvasSignal");
            _socket.emit("lockCanvasSignal");
            _socket.emit("broadcastServerMessageSignal", {
                message: `<i><b>Round ${this.currentRound}</b> has started! It's <b>${Entities.encode(NAMES[artistSocket.id])}</b>'s turn to draw.</i>`,
                color: "blue"
            });
            if(_socket.id == artistSocket.id) {
                _socket.emit("broadcastServerMessageSignal", {
                    message: `<i>Choose a word by typing <b>/word [chosen word]</b>. You have ${this.chooseTime} seconds!</i>`,
                    color: "yellow"
                });
            }
            else {
                _socket.emit("broadcastServerMessageSignal", {
                    message: `<i>${Entities.encode(NAMES[artistSocket.id])} is choosing a word...</i>`,
                    color: "yellow"
                });
            }
            _socket.emit("startTimerSignal", this.chooseTime);
        }
        // Set choosing-word timeout
        this.currentTimeout = setTimeout(() => {
            this.timeupChoose();
        }, this.chooseTime * 1000);
    }
    chooseWord(_socket, word) {
        // Check if _socket is the artist currently choosing a word
        if(this.state != GAMESTATES.CHOOSING_WORD) {
            throw "You can only use this command while choosing a word!";
        }
        if(_socket.id != this.sockets[this.artistIndex].id) {
            throw "You're not the artist this round!";
        }
        // Check if word is a valid choice
        if(!/^[a-z]+$/.test(word)) {
            throw "The word must be alphabetic!";
        }
        // All set: cancel timeout, set word, change game state, broadcast
        clearTimeout(this.currentTimeout);
        this.currentWord = word;
        this.state = GAMESTATES.GUESSING;
        for(let s of this.sockets) {
            s.emit("setWordSignal", word);
            if(s.id == _socket.id) {
                s.emit("broadcastServerMessageSignal", {
                    message: `<i>You have chosen the word <b>${word}</b>. You have <b>${this.roundTime}</b> seconds to draw!</i>`,
                    color: "blue"
                });
                s.emit("unlockCanvasSignal");
            }
            else {
                s.emit("broadcastServerMessageSignal", {
                    message: `<i>Word chosen. You have <b>${this.roundTime}</b> seconds to guess the word!</i>`,
                    color: "blue"
                });
                s.emit("listenWordsSignal");
            }
            s.emit("startTimerSignal", this.roundTime);
        }
        // Set new timeout for round time
        this.currentTimeout = setTimeout(() => {
            this.finishRound(true);
        }, this.roundTime*1000);
    }
    timeupChoose() {
        let artistName = NAMES[this.sockets[this.artistIndex].id];
        for(let _socket of this.sockets) {
            _socket.emit("broadcastServerMessageSignal", {
                message: `<i><b>${Entities.encode(artistName)}</b> ran out of time choosing!</i>`,
                color: "yellow"
            });
        }
    }
    guessed(_socket, points) {
        if(this.state == GAMESTATES.GUESSING) {
            // Add guess to guess count
            this.currentGuesses += 1;
            // Award guesser
            this.scores[_socket.id] += points;
            // Broadcast
            for(let s of this.sockets) {
                s.emit("broadcastServerMessageSignal", {
                    message: `<i><b>${Entities.encode(NAMES[_socket.id])}</b> guessed the word! <b>(+${points})</b></i>`,
                    color: "green"
                });
            }
            // Check if max guess count reached
            if(this.currentGuesses == this.sockets.length - 1) {
                clearTimeout(this.currentTimeout); // To clear the round timer timeout
                this.finishRound(false);
            }
        }
    }
    finishRound(timeUp) {
        // Update state, send unlisten signals, reveal word, broadcast end-of-round message
        this.state = GAMESTATES.INTERMISSION;
        for(let s of this.sockets) {
            s.emit("lockCanvasSignal");
            s.emit("unlistenWordsSignal");
            s.emit("stopTimerSignal");
            s.emit("broadcastServerMessageSignal", {
                message: `<i>${timeUp ? "Time's up" : "Round over"}: the word was <b>${this.currentWord}</b>!</i>`,
                color: "blue"
            });
        }
        // Intermission/game over timeout
        this.currentTimeout = setTimeout(() => {
            // If there are rounds left, prep
            if(this.currentRound < this.rounds) {
                this.currentRound += 1;
                this.currentWord = null;
                this.artistIndex = (this.artistIndex + 1)%this.sockets.length;
                this.startRound();
            }
            // Else game over
            else {
                this.state = GAMESTATES.GAME_OVER;
                // More pre-gameOver() stuff?
                this.gameOver();
            }
        }, 8000); // 8 seconds
    }
    scoreFromSocket(_socket) {
        return this.scores[_socket.id];
    }
    sortedSocketsByScore() {
        return this.sockets.slice().sort( (sA, sB) => {
            return this.scoreFromSocket(sB) - this.scoreFromSocket(sA);
        });
    }
    placeString(place) {
        switch(place) {
            case 1:
                return 1 + "st";
            case 2:
                return 2 + "nd";
            case 3:
                return 3 + "rd";
            default:
                return place + "th";
        }
    }
    gameOver() {
        // Final scores for up to top 5 players
        let winners = this.sortedSocketsByScore();
        let legend = "Game over! The top players were:";
        for(let i = 0; i < 5 && i < winners.length; i++) {
            legend += `<br>${i+1}. <b>${Entities.encode(NAMES[winners[i].id])}</b> (${this.scoreFromSocket(winners[i])} points)`;
        }
        legend = `<p style = "text-align: center; margin: 0px;"><i>` + legend + "</i></p>";
        // Map socket IDs to scoreboard positions
        let score_map = new Map();
        for(let j = 0; j < winners.length; j++) {
            score_map.set(winners[j].id, j+1);
        }
        // Broadcast
        for(let _socket of this.sockets) {
            _socket.emit("broadcastServerMessageSignal", {
                message: legend,
                color: "green"
            });
            _socket.emit("setLabelsSignal", {
                roundLabel: "points ",
                roundDisplay: this.scoreFromSocket(_socket),
                artistLabel: "you placed ",
                artistDisplay: this.placeString(score_map.get(_socket.id)),
                timerLabel: "winner ",
                timerDisplay: Entities.encode(NAMES[winners[0].id])
            });
        }
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
        _socket.emit("broadcastServerMessageSignal", {
            message: `<i>You changed your name to <b>${Entities.encode(new_name)}</b>!</i>`,
            color: "green"
        });
        _socket.broadcast.emit("broadcastServerMessageSignal", {
            message: `<i><b>${Entities.encode(old_name)}</b> has changed their name to <b>${Entities.encode(new_name)}</b>!</i>`,
            color: "green"
        });
    },
    open: (_socket, _tokens) => {
        // Check if can open room
        if(_tokens.length < 2) throw "You must specify a room number!";
        if(ROOMS.hasOwnProperty(_socket.id)) throw `You are already in room <b>#${ROOMS[_socket.id].roomNumber}!</b> You must leave
            this room first before opening a new one.`;
        // Room number
        let newRoomNumber = parseInt(_tokens[1]);
        if(isNaN(newRoomNumber)) throw "The room number must be a valid positive integer!";
        if(OPEN_ROOMS.has(newRoomNumber)) throw `Room <b>#${newRoomNumber}</b> is already open! Use <b>/join ${newRoomNumber}</b> to join it.`
        // Open room
        let newRoom = new GameRoom(_socket, newRoomNumber);
        ROOMS[_socket.id] = newRoom;
        OPEN_ROOMS.set(newRoomNumber, newRoom);
        _socket.emit("broadcastServerMessageSignal", {
            message: `<i>You have opened room <b>#${newRoomNumber}</b>!</i>`,
            color: "blue"
        });
        _socket.emit("updateRoomSignal", newRoomNumber);
        // Set captions
        _socket.emit("setLabelsSignal", {
            artistLabel: "waiting for players..."
        });
    },
    join: (_socket, _tokens) => {
        // Check if can join room
        if(_tokens.length < 2) throw "You must specify a room number!";
        if(ROOMS.hasOwnProperty(_socket.id)) throw `You are already in room <b>#${ROOMS[_socket.id].roomNumber}!</b> You must leave
            this room first before joining a new one.`;
        // Room number
        let joinRoomNumber = parseInt(_tokens[1]);
        if(isNaN(joinRoomNumber)) throw "The room number must be a valid positive integer!";
        if(!OPEN_ROOMS.has(joinRoomNumber)) throw `Room <b>#${joinRoomNumber}</b> hasn't been opened
            yet! You can open it by doing <b>/open ${joinRoomNumber}</b>.`
        // Join room
        ROOMS[_socket.id] = OPEN_ROOMS.get(joinRoomNumber);
        ROOMS[_socket.id].addPlayer(_socket);
        _socket.emit("updateRoomSignal", joinRoomNumber);
    },
    start: (_socket, _tokens) => {
        //_socket.emit("broadcastServerMessageSignal", {message: `<i>[/start] This command is not available yet!</i>`, color: "red"});
        let thisRoom = ROOMS[_socket.id];
        if(_socket.id == thisRoom.adminSocket.id) {
            thisRoom.startGame(_tokens[1], _tokens[2], _tokens[3]);
        }
        else {
            throw `You're not the admin of this room! Ask <b>${Entities.encode(NAMES[thisRoom.adminSocket.id])}</b> to start the game.`;
        }
    },
    word: (_socket, _tokens) => {
        // Check if _socket is in a room, relegate stuff to that GameRoom
        let thisRoom = ROOMS[_socket.id];
        if(typeof thisRoom == "undefined") {
            throw "You can only use this command in-game!";
        }
        if(_tokens.length != 2) {
            throw "You must specify a single word!";
        }
        thisRoom.chooseWord(_socket, _tokens[1].toLowerCase());
    }
}

// Socket.io listeners
mainIO.on("connection", (socket) => {
    // Welcome
    socket.emit("serverLogSignal", "Hello new user!");
    socket.on("disconnect", () => {
        socket.broadcast.emit("broadcastServerMessageSignal", {
            message: `<i><b>${Entities.encode(NAMES[socket.id])}</b> left.</i>`,
            color: "red"
        });
    });

    // Set listeners for events emitted by this socket (user)
    // Chat signals
    socket.on("newUserSignal", (name) => {
        NAMES[socket.id] = name;
        console.log(`New user: ${name} (socket ID = ${socket.id})`);
        socket.emit("serverLogSignal", `${name}! That's a nice name!`);
        mainIO.sockets.emit("broadcastServerMessageSignal", {
            message: `<i><b>${Entities.encode(name)}</b> joined!</i>`,
            color: "green"
        });
    });
    socket.on("messageSentSignal", (message) => {
        console.log(`New message from ${NAMES[socket.id]} >> ${message}`);
        // Encode message (will be passed in to html field)
        encoded_message = Entities.encode(message);
        socket.emit("broadcastChatMessageSignal", {name: "(you)", message: encoded_message})
        socket.broadcast.emit("broadcastChatMessageSignal", {name: Entities.encode(NAMES[socket.id]), message: encoded_message});
    });
    socket.on("commandSentSignal", (command_string) => {
        let tokens = command_string.substring(1).split(" ");
        try {
            COMMANDS[tokens[0]](socket, tokens);
        }
        catch(err) {
            if(typeof err == "string") {
                socket.emit("broadcastServerMessageSignal", {
                    message: `<i>${err}</i>`,
                    color: "red"
                });
            }
            else {
                console.log("[UnhandledError] " + err);
                socket.emit("broadcastServerMessageSignal", {
                    message: `<i>Sorry, <b>/${tokens.length > 0 ? tokens[0] : ""}</b> is not a valid command.</i>`, 
                    color: "red"
                });
            }
        }
    });

    // Game signals
    socket.on("guessedWordSignal", (points) => {
        try {
            ROOMS[socket.id].guessed(socket, points);
        }
        catch(err) {
            socket.emit("broadcastServerMessageSignal", {
                message: "<i>Sorry, an unexpected error happened - tried to process guess while not in a game room.</i>",
                color: "red"
            });
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