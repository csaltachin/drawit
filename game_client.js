//
// drawit | client
//

// Setup, get elements
const HOSTNAME = "localhost";
const socket = io(`http://${HOSTNAME}:3000`); // Location for socket.io server
var ROOM = null; // Game room
var TIMER_COUNT = 0;
var TIMER_INTERVAL;
var TIMER_ON = false;
var CURRENT_WORD = {
    listening: false,
    guessed: false,
    word: null,
}

var drawCanvas = document.getElementById("drawCanvas");
var ctx = drawCanvas.getContext("2d");
var DRAWING = false;
var CANVAS_LOCKED = true;
var PEN_COLOR = "#000000";
var PEN_SIZE = 6;

// DOM elements
const headerMidBox = document.getElementById("headerMidBox");
const loginBox = document.getElementById("loginBox");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const CAPTIONS = {
    roundLabel: document.getElementById("roundLabel"),
    roundDisplay: document.getElementById("roundDisplay"),
    artistLabel: document.getElementById("artistLabel"),
    artistDisplay: document.getElementById("artistDisplay"),
    timerLabel: document.getElementById("timerLabel"),
    timerDisplay: document.getElementById("timerDisplay"),
}
const colorPicker = document.getElementById("penColorInput");
const sizePicker = document.getElementById("penSizeInput");
const chatContainer = document.getElementById("chatContainer");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const captionDiv = document.getElementById("gameCaptionDiv")

var NAME = null;
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
    if(ROOM == null) {
        artistDisplay.textContent = new_name;
    }
});

// Socket.io listening - game
socket.on("updateRoomSignal", (roomNumber) => {
    ROOM = roomNumber;
});
socket.on("setWordSignal", (word) => {
    CURRENT_WORD.word = word;
    CURRENT_WORD.guessed = false;
});
socket.on("listenWordsSignal", () => {
    CURRENT_WORD.listening = true;
});
socket.on("unlistenWordsSignal", () => {
    CURRENT_WORD.listening = false;
});

// Socket.io listening - captions/timer
socket.on("setLabelsSignal", (data) => {
    for(let propname in CAPTIONS) {
        if(data.hasOwnProperty(propname)) CAPTIONS[propname].textContent = data[propname];
        else CAPTIONS[propname].textContent = "";
    }
});
socket.on("changeLabelsSignal", (data) => {
    for(let propname in data) {
        CAPTIONS[propname].textContent = data[propname];
    }
});
socket.on("startTimerSignal", (seconds) => {
    if(TIMER_ON) clearInterval(TIMER_INTERVAL);
    startTimer(seconds);
});
socket.on("stopTimerSignal", () => {
    if(TIMER_ON) clearInterval(TIMER_INTERVAL);
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

// Name form listening
nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let input_name = nameInput.value.trim();
    if(input_name == "") {
        // Tell user name cannot be blank?
        return;
    }
    // Set NAME, send to server
    NAME = input_name;
    socket.emit("newUserSignal", NAME);
    artistLabel.textContent = "welcome, ";
    artistDisplay.textContent = NAME;
    // Toggle header retract
    retractHeader();
});

// Chat form listening
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let chat_message = chatInput.value;
    if(chat_message == "") return;
    if(CURRENT_WORD.listening && chat_message.toLowerCase() == CURRENT_WORD.word) {
        if(CURRENT_WORD.guessed) {
            appendServerMessage(`<i>Don't spoil the word!</i>`, "yellow");
        }
        else {
            socket.emit("guessedWordSignal", TIMER_COUNT);
            CURRENT_WORD.guessed = true;
        }
    }
    else if(chat_message.charAt(0) == "/") socket.emit("commandSentSignal", chat_message);
    else socket.emit("messageSentSignal", chat_message);
    chatInput.value = ""; // Empty input box after sending chat message
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Header stuff
function retractHeader() {
    headerMidBox.classList.add("retractHeader");
    loginBox.classList.add("retractHeader");

}

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

// Captions/timer stuff
function startTimer(time) {
    if(typeof time != "number" || parseInt(time) <= 0) throw Error("startTimer takes a single positive integer argument");
    TIMER_COUNT = parseInt(time);
    CAPTIONS.timerDisplay.textContent = TIMER_COUNT;
    TIMER_ON = true;
    TIMER_INTERVAL = setInterval(timerTick, 1000);
}
function timerTick() {
    TIMER_COUNT -= 1;
    CAPTIONS.timerDisplay.textContent = TIMER_COUNT;
    // On timer over
    if(TIMER_COUNT == 0) {
        clearInterval(TIMER_INTERVAL);
        TIMER_ON = false;
    }
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
/*
//NAME = prompt("What's your name?");
NAME = "debugName";
socket.emit("newUserSignal", NAME);
artistLabel.textContent = "welcome, ";
artistDisplay.textContent = NAME;
*/