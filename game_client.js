//
// drawit | client
//

// Setup, get elements
const HOSTNAME = "localhost";
const socket = io(`http://${HOSTNAME}:3000`); // Location for socket.io server

var drawCanvas = document.getElementById("drawCanvas");
var ctx = drawCanvas.getContext("2d");
var DRAWING = false;

const chatContainer = document.getElementById("chatContainer");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const NAME = prompt("What's your name?");

// Socket.io listening - chat
socket.on("serverLogSignal", (message) => {
    console.log(message);
});
socket.on("broadcastChatMessageSignal", (data) => {
    appendChatMessage(data.name, data.message);
});
socket.on("broadcastServerMessageSignal", (message) => {
    appendServerMessage(message);
});
// Socket.io listening - canvas
socket.on("penDownSignal", (pos) => {
    penDown(pos.x, pos.y);
});
socket.on("penLineSignal", (pos) => {
    penLine(pos.x, pos.y);
});
socket.on("penUpSignal", () => {
    penUp();
});
socket.on("clearCanvasSignal", () => {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
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

// Canvas stuff
drawCanvas.addEventListener("mousedown", (e) => {
    socket.emit("penDownSignal", {x: e.clientX - drawCanvas.offsetLeft, y: e.clientY - drawCanvas.offsetTop});
    penDown(e.clientX - drawCanvas.offsetLeft, e.clientY - drawCanvas.offsetTop);
});
document.addEventListener("mousemove", (e) => {
    socket.emit("penLineSignal", {x: e.clientX - drawCanvas.offsetLeft, y: e.clientY - drawCanvas.offsetTop});
    penLine(e.clientX - drawCanvas.offsetLeft, e.clientY - drawCanvas.offsetTop);
});
document.addEventListener("mouseup", (e) => {
    socket.emit("penUpSignal");
    penUp();
});
document.getElementById("clearButton").onclick = () => {
    socket.emit("clearCanvasSignal");
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

// Canvas helper methods
function penDown(x, y) {
    DRAWING = true;
    // Set up
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    // Ready up
    ctx.moveTo(x, y);
    ctx.beginPath();
    // Draw dot
    ctx.lineTo(x, y);
    ctx.stroke();
}
function penLine(x, y) {
    if(DRAWING) {
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}
function penUp() {
    if(DRAWING) {
        DRAWING = false;
        ctx.closePath();
    }
}

// On start-up
socket.emit("newUserSignal", NAME);
