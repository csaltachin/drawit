//
// drawit | client
//

// Setup, get elements
const HOSTNAME = "localhost";
const socket = io(`http://${HOSTNAME}:3000`); // Location for socket.io server

var drawCanvas = document.getElementById("drawCanvas");
var ctx = drawCanvas.getContext("2d");
var DRAWING = false;
var CANVAS_LOCKED = false;
var PEN_COLOR = "#000000";
var PEN_SIZE = 3;

const colorPicker = document.getElementById("penColorInput");
const sizePicker = document.getElementById("penSizeInput");
const chatContainer = document.getElementById("chatContainer");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
var NAME = prompt("What's your name?");
var APPENDED = 0;
const MESSAGE_BG_COLORS = {
    red: "#FF5252",
    green: "#6FFF52"
}

// Socket.io listening - chat
socket.on("serverLogSignal", (message) => {
    console.log(message);
});
socket.on("broadcastChatMessageSignal", (data) => {
    appendChatMessage(data.name, data.message);
});
socket.on("broadcastServerMessageSignal", (data) => {
    appendServerMessage(data.message, data.bg);
});
socket.on("nameChangeSignal", (new_name) => {
    NAME = new_name;
});

// Socket.io listening - canvas
socket.on("penDownSignal", (pos) => {
    CANVAS_LOCKED = true;
    penDown(pos.x, pos.y);
});
socket.on("penLineSignal", (pos) => {
    penLine(pos.x, pos.y);
});
socket.on("penUpSignal", () => {
    penUp();
    CANVAS_LOCKED = false;
});
socket.on("clearCanvasSignal", () => {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});
socket.on("changeColorSignal", (color) => {
    changeColor(color);
    colorPicker.value = color;
});
socket.on("changeSizeSignal", (size) => {
    changeSize(size);
    sizePicker.value = size;
});

// Chat form listening
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let chat_message = chatInput.value;
    if(chat_message == "") return;
    if(chat_message.charAt(0) == "/") socket.emit("commandSentSignal", chat_message);
    else socket.emit("messageSentSignal", chat_message);
    chatInput.value = ""; // Empty input box after sending chat message
});

// Chat stuff
function appendChatMessage(name, message, bg) {
    // Create/append new messageBox div for this message
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = ` <b>${name}:</b> ${message}`;
    new_div.style.backgroundColor = APPENDED%2 == 0 ? "#ffffff" : "#d3d3d3";
    // Was at scroll bottom?
    atBottom = chatContainer.scrollTop >= chatContainer.scrollHeight - chatContainer.clientHeight;
    console.log("atBottom = " + atBottom);
    // Append div
    chatContainer.appendChild(new_div);
    // Update appended count, scroll bar if necessary
    if(atBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
    APPENDED += 1;
}
function appendServerMessage(message, bg) {
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = message;
    new_div.style.backgroundColor = MESSAGE_BG_COLORS[bg];
    // Was at scroll bottom?
    atBottom = chatContainer.scrollTop >= chatContainer.scrollHeight - chatContainer.clientHeight;
    chatContainer.appendChild(new_div);
    // Update appended count, scroll bar if necessary
    if(atBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
    APPENDED += 1;
}

// Canvas stuff
drawCanvas.addEventListener("mousedown", (e) => {
    if(!CANVAS_LOCKED) {
        socket.emit("penDownSignal", {x: e.clientX - drawCanvas.offsetLeft, y: e.clientY - drawCanvas.offsetTop});
        penDown(e.clientX - drawCanvas.offsetLeft, e.clientY - drawCanvas.offsetTop);
    }
});
document.addEventListener("mousemove", (e) => {
    if(!CANVAS_LOCKED) {
        socket.emit("penLineSignal", {x: e.clientX - drawCanvas.offsetLeft, y: e.clientY - drawCanvas.offsetTop});
        penLine(e.clientX - drawCanvas.offsetLeft, e.clientY - drawCanvas.offsetTop);
    }
});
document.addEventListener("mouseup", (e) => {
    if(!CANVAS_LOCKED) {
        socket.emit("penUpSignal");
        penUp();
    }
});
document.getElementById("clearButton").onclick = () => {
    if(!CANVAS_LOCKED) {
        socket.emit("clearCanvasSignal");
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
}
colorPicker.addEventListener("input", (e) => {
    socket.emit("changeColorSignal", e.target.value);
    changeColor(e.target.value);
});
sizePicker.addEventListener("input", (e) => {
    socket.emit("changeSizeSignal", e.target.value);
    changeSize(e.target.value);
});

// Canvas helper methods
function penDown(x, y) {
    DRAWING = true;
    // Set up
    ctx.lineWidth = PEN_SIZE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = PEN_COLOR;
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
function changeColor(color) {
    PEN_COLOR = color;
}
function changeSize(size) {
    PEN_SIZE = size;
}

// On start-up
socket.emit("newUserSignal", NAME);
