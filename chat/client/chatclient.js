// Super janky poc websocket chat client
// Message Types: "connected" "joined" "chat" "left", "ping", "pong"

// Flow:
// Load Page connect WS -> schedule "ping" at 80% timeout -> or handle can't connect
// Answer prompt() with user name -> send "greet" (or wait for ws connection if not connected)
// recieve -> "connected" and contains nick index
// recieve -> "joined" and contains nick list (sent to all)
// Now can send "chat" messages and receive/display "chat" / "joined" / "left" messages
// if disconnected add disconnection message to chat
// TODO: and lock chat UI -> show reconnect button

// UI TODO:
// Show user list
// Auto-focus chat box on prompt complete
// show connection status in sensible manner
// Would also be kinda nice to have the chat window in a draggable box?

// Fruit Module
const fruit = ["Apple", "Apricot", "Avocado", "Banana", "Berry", "Cantaloupe", "Cherry", "Citron", "Citrus", "Coconut",
	"Date", "Durian", "Fig", "Grape", "Guava", "Kiwi", "Lemon", "Lime", "Mango", "Melon", "Mulberry", "Nectarine",
	"Orange", "Papaya", "Peach", "Pear", "Pineapple", "Plum", "Prune", "Raisin", "Raspberry", "Tangerine", "Yuzu" ];
let getRandomFruit = () => {
  let min = 0, max = fruit.length;
  return fruit[Math.floor(Math.random() * (max - min) + min)]; // The maximum is exclusive and the minimum is inclusive
};

// The actual program
const pingInterval = 60 * 1000; // 60s

let isDevelopment = false;
let webSocket;
let nick = "";
let nicks = [];
let nickIndex = -1;

let getConnectionStatusDescription = () => {
	switch(webSocket.readyState) {
		case 0:
			return "connecting";
		case 1:
			return "connected";
		case 2:
			return "closing";
		case 3:
		default:
			return "disconnected";
	}
};

let updateStatusUI = () => {
	// Commented out for now
	// document.getElementById('status').innerHTML = getConnectionStatusDescription();
};

let schedulePing = () => {
	window.setTimeout(ping, pingInterval);
};

let ping = () => {
	webSocket.send(JSON.stringify({ type: "ping" }));
	schedulePing();
};

// TODO: Take class name and add some styles
let appendMessage = (className, message) => {
	let p = document.createElement('p');
	p.className = className;
	document.getElementById('content').appendChild(p);
	p.innerHTML = message;
	p.scrollIntoView(); // TODO: iff the view was max scrolled
};

// Public API
let sendMessage = (data) => {
	if (nick && webSocket.readyState == 1) {
		webSocket.send(JSON.stringify({ type: "chat", text: data }));
	} else {
		console.error("Unable to send message, websocket " + getConnectionStatusDescription());
	}
};
// TODO: Option to close / reconnect?

// FYI - Sometimes DOMContentLoaded is more appropriate
window.onload = (event) => {
	let sendGreet = () => {
		webSocket.send(JSON.stringify({
			type: "greet",
			nick: nick
		}));
		greetSent = true;
	};

	let fruitName = getRandomFruit();
	nick = prompt("Enter your nick name", fruitName);
	if (!nick) {
		nick = fruitName;
	}

	if (isDevelopment) {
		webSocket = new WebSocket("ws://localhost:9001");
	} else {
		webSocket = new WebSocket("wss://delphic.me.uk:9001");
	}

	webSocket.onopen = (event) => {
		updateStatusUI();
		schedulePing();
		sendGreet();
	};
	webSocket.onerror = (event) => {
		console.log("WebSocket error observed: ", event);
	};
	webSocket.onclose = (event) => {
		updateStatusUI();
		appendMessage("error", "Connection to server lost");
	};
	webSocket.onmessage = (event) => {
		console.log(event.data);
		var message = JSON.parse(event.data);
		switch (message.type)
		{
			case "connected":
				nickIndex = message.nickIndex;
				break;
			case "joined":
				nicks = message.nickList;
				appendMessage("join", nicks[message.nickIndex] + " joined the chat");
				break;
			case "error":
				appendMessage("error", message.text);
				break;
		}

		if (nicks) {
			switch (message.type) {
				case "left":
					appendMessage("left", nicks[message.nickIndex] + " left the chat");
					userList[message.nickIndex] = null;
					break;
				case "chat":
					appendMessage(message.nickIndex == nickIndex ? "selfChat" : "chat", nicks[message.nickIndex] + ": " + message.text);
					break;
			}
		}
	};
};
