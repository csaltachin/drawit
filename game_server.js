//
// drawit | server
//

const HTMLEntities = require("html-entities").AllHtmlEntities;
const Entities = new HTMLEntities();
const PORT = 3000;
const mainIO = require("socket.io")(PORT);
var NAMES = {};

mainIO.on("connection", (socket) => {
    // Welcome
    socket.emit("serverLogSignal", "Hello new user!");

    // Set listeners for events emitted by this socket (user)
    socket.on("newUserSignal", (name) => {
        NAMES[socket.id] = name;
        console.log(`New user: ${name} (socket ID = ${socket.id})`);
        socket.emit("serverLogSignal", `${name}! That's a nice name!`);
    });
    socket.on("messageSentSignal", (message) => {
        console.log(`New message from ${NAMES[socket.id]} >> ${message}`);
        // Encode message (will be passed in to html field)
        encoded_message = Entities.encode(message);
        socket.emit("broadcastMessageSignal", {name: "(you)", message: encoded_message})
        socket.broadcast.emit("broadcastMessageSignal", {name: NAMES[socket.id], message: encoded_message});
    });
});