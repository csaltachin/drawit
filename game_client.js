//
// drawit | client
//

// Setup, get elements
const HOSTNAME = "localhost";
const socket = io(`http://${HOSTNAME}:3000`); // Location for socket.io server
var drawCanvas = document.getElementById("drawCanvas");
var ctx = drawCanvas.getContext("2d");

const chatContainer = document.getElementById("chatContainer");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const NAME = prompt("What's your name?");

// Socket.io listening
socket.on("serverLogSignal", (message) => {
    console.log(message);
});
socket.on("broadcastChatMessageSignal", (data) => {
    appendChatMessage(data.name, data.message);
});
socket.on("broadcastServerMessageSignal", (message) => {
    appendServerMessage(message);
});

// Chat form listening
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let chat_message = chatInput.value;
    socket.emit("messageSentSignal", chat_message);
    chatInput.value = ""; // Empty input box after sending chat message
});

// Chat stuff
function appendChatMessage(name, message) {
    // Create/append new messageBox div for this message
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = ` <b>${name}:</b> ${message}`;
    // Was at scroll bottom?
    atBottom = chatContainer.scrollTop >= chatContainer.scrollHeight - chatContainer.clientHeight;
    console.log("atBottom = " + atBottom);
    // Append div
    chatContainer.appendChild(new_div);
    // Update scroll bar if necessary
    if(atBottom) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}
function appendServerMessage(message) {
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = message;
    chatContainer.appendChild(new_div);
}

// On start-up
socket.emit("newUserSignal", NAME);
