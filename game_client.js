//
// drawit | client
//

// Setup, get elements
const socket = io("http://localhost:3000"); // Location for game_server
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
socket.on("broadcastMessageSignal", (data) => {
    appendMessage(data.name, data.message);
});

// Chat form listening
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let chat_message = chatInput.value;
    socket.emit("messageSentSignal", chat_message);
    chatInput.value = ""; // Empty input box after sending chat message
    //appendMessage("(you)", chat_message);
});

// Chat stuff
function appendMessage(name, message) {
    let new_div = document.createElement("div");
    new_div.innerHTML = ` <b>${name}:</b> ${message}`;
    console.log(new_div.innerHTML);
    //console.log(new_div.innerText);
    //new_div.innerText += message;
    //console.log(new_div.innerText);
    chatContainer.appendChild(new_div);
}

// On start-up
socket.emit("newUserSignal", NAME);
