//
// drawit | server
//

const HTMLEntities = require("html-entities").AllHtmlEntities;
const Entities = new HTMLEntities();
const PORT = 3000;
const mainIO = require("socket.io")(PORT);

var NAMES = {};
const COMMANDS = {
    name: (_socket, _tokens) => {
        if(_tokens.length < 2 || _tokens.slice(1).findIndex((v) => {return v != ""}) < 0) {
            throw "[/name] Your new name cannot be an empty one!";
        }
        old_name = NAMES[_socket.id];
        new_name = _tokens.slice(1).join(" ");
        NAMES[_socket.id] = new_name;
        _socket.emit("nameChangeSignal", new_name);
        _socket.emit("broadcastServerMessageSignal", `<i>You changed your name to ${Entities.encode(new_name)}!</i>`);
        _socket.broadcast.emit("broadcastServerMessageSignal", `<i>${Entities.encode(old_name)} has \
            changed their name to ${Entities.encode(old_name)}!</i>`);
    },
    start: (_socket, _tokens) => {
        _socket.emit("broadcastServerMessageSignal", `<i>[/start] This command is not available yet!</i>`);
    },
    word: (_socket, _tokens) => {
        _socket.emit("broadcastServerMessageSignal", `<i>[/start] This command is not available yet!</i>`);
    }
}

mainIO.on("connection", (socket) => {
    // Welcome
    socket.emit("serverLogSignal", "Hello new user!");
    socket.on("disconnect", () => {
        socket.broadcast.emit("broadcastServerMessageSignal", `<i>${Entities.encode(NAMES[socket.id])} left.</i>`)
    });

    // Set listeners for events emitted by this socket (user)
    // Chat signals
    socket.on("newUserSignal", (name) => {
        NAMES[socket.id] = name;
        console.log(`New user: ${name} (socket ID = ${socket.id})`);
        socket.emit("serverLogSignal", `${name}! That's a nice name!`);
        mainIO.sockets.emit("broadcastServerMessageSignal", `<i>${Entities.encode(name)} joined!</i>`)
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
                socket.emit("broadcastServerMessageSignal", `<i>${Entities.encode(err)}</i>`)
            }
            else {
                socket.emit("broadcastServerMessageSignal", `<i>Sorry, "/${tokens.length > 0 ? tokens[0] : ""}" is not a valid command.</i>`);
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
});