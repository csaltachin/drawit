//
// drawit | client
//

// Setup, get elements
const HOSTNAME = "localhost";
const socket = io(`http://${HOSTNAME}:3000`); // Location for socket.io server
var ROOM; // Game room
var TIMER_COUNT = 0;
var TIMER_INTERVAL;

var drawCanvas = document.getElementById("drawCanvas");
var ctx = drawCanvas.getContext("2d");
var DRAWING = false;
var CANVAS_LOCKED = true;
var PEN_COLOR = "#000000";
var PEN_SIZE = 3;

const colorPicker = document.getElementById("penColorInput");
const sizePicker = document.getElementById("penSizeInput");
const chatContainer = document.getElementById("chatContainer");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const roundDisplay = document.getElementById("roundDisplay");
const artistDisplay = document.getElementById("artistDisplay");
const timerDisplay = document.getElementById("timerDisplay");

var NAME = prompt("What's your name?");
var APPENDED = 0;
const MESSAGE_BG_COLORS = new Map([
    ["red", {bg: "#FF5252", border: "#b51d1d"}],
    ["green", {bg: "#6FFF52", border: "#29a624"}],
    ["yellow", {bg: "#ffcd42", border: "#cc9b14"}],
    ["blue", {bg: "#66a8ff", border: "#1b62bf"}]
]);

// Socket.io listening - chat
socket.on("serverLogSignal", (message) => {
    console.log(message);
});
socket.on("broadcastChatMessageSignal", (data) => {
    appendChatMessage(data.name, data.message);
});
socket.on("broadcastServerMessageSignal", (data) => {
    appendServerMessage(data.message, data.color);
});
socket.on("nameChangeSignal", (new_name) => {
    NAME = new_name;
});

// Socket.io listening - game
socket.on("updateRoomSignal", (roomNumber) => {
    ROOM = roomNumber;
});

// Socket.io listening - canvas
socket.on("penDownSignal", (pos) => {
    //CANVAS_LOCKED = true;
    penDown(pos.x, pos.y);
});
socket.on("penLineSignal", (pos) => {
    penLine(pos.x, pos.y);
});
socket.on("penUpSignal", () => {
    penUp();
    //CANVAS_LOCKED = false;
});
socket.on("clearCanvasSignal", () => {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});
socket.on("lockCanvasSignal", () => {
    console.log("Locking canvas...");
    CANVAS_LOCKED = true;
});
socket.on("unlockCanvasSignal", () => {
    console.log("Unlocking canvas...");
    CANVAS_LOCKED = false;
});
socket.on("changeColorSignal", (color) => {
    changeColor(color);
    colorPicker.value = color;
});
socket.on("changeSizeSignal", (size) => {
    changeSize(size);
    sizePicker.value = size;
});
socket.on("requestPenUpdateSignal", () => {
    socket.emit("changeColorSignal", PEN_COLOR);
    socket.emit("changeSizeSignal", PEN_SIZE);
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
function appendChatMessage(name, message) {
    // Create/append new messageBox div for this message
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = ` <b>${name}:</b> ${message}`;
    new_div.style.backgroundColor = APPENDED%2 == 0 ? "#ffffff" : "#d3d3d3";
    // Was at scroll bottom?
    //atBottom = chatContainer.scrollTop >= chatContainer.scrollHeight - chatContainer.clientHeight;
    atBottom = Math.ceil(chatContainer.scrollTop) == chatContainer.scrollHeight - chatContainer.clientHeight;
    console.log("atBottom = " + atBottom);
    // Append div
    chatContainer.appendChild(new_div);
    // Update appended count, scroll bar if necessary
    if(atBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
    APPENDED += 1;
}
function appendServerMessage(message, color) {
    let new_div = document.createElement("div");
    new_div.className = "messageBox";
    new_div.innerHTML = message;
    new_div.style.backgroundColor = MESSAGE_BG_COLORS.get(color).bg;
    //new_div.style.borderTop = `solid ${MESSAGE_BG_COLORS.get(color).border} 2px`;
    //new_div.style.borderBottom = `solid ${MESSAGE_BG_COLORS.get(color).border} 2px`;
    // Was at scroll bottom?
    atBottom = Math.ceil(chatContainer.scrollTop) == chatContainer.scrollHeight - chatContainer.clientHeight;
    // Append div
    chatContainer.appendChild(new_div);
    // Update appended count, scroll bar if necessary
    if(atBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
    APPENDED += 1;
}

// Captions stuff
function startTimer(time) {
    if(typeof time != "number" || parseInt(time) <= 0) throw Error("startTimer takes a single positive integer argument");
    TIMER_COUNT = parseInt(time);
    timerDisplay.textContent = TIMER_COUNT;
    TIMER_INTERVAL = setInterval(timerTick, 1000);
}
function timerTick() {
    TIMER_COUNT -= 1;
    timerDisplay.textContent = TIMER_COUNT;
    if(TIMER_COUNT == 0) clearInterval(TIMER_INTERVAL);
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

// Debug utilities
function serverLog(req_str) {
    socket.emit("reqServerLogSignal", req_str);
}

// On start-up
socket.emit("newUserSignal", NAME);
