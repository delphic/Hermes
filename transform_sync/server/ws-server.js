// Really basic transform sync
// it distributes position messages sent to all active connections.
// with info on who sent it + some very basic player list management and distribution
// w/ current position

let uWS = require('uWebSockets.js'); // uWebSockets https://github.com/uNetworking/uWebSockets.js

let isDevelopment = true;
let app;

if (isDevelopment) {
	app = uWS.App();
} else {
	app = uWS.SSLApp({
		key_file_name: '../../misc/privkey.pem',
		cert_file_name: '../../misc/fullchain.pem'
	});
}

const maxConnections = 8;
let connectionCount = 0;
let connections = [];
let players = [];
let positions = [];

let bufferToString = (arrayBuffer) => {
	return Buffer.from(arrayBuffer).toString();
};

let distribute = (message, isBinary) => {
	for (let i = 0; i < maxConnections; i++) {
		if (connections[i]) {
			let ok = connections[i].send(message, isBinary, true);
			// TODO: handle ok, understand backpressure implications if false
			// Presumably this means, you should throttle.
		}
	}
};

// Websocket response
app.ws("/*", {
	/* Base Settings */
	idleTimeout: 120,
	maxBackpressure: 1024,	// NOTE: A web socket wont' "publish" messages but will send them if backpressure reached
	maxPayloadLength: 512,	// If received payload is greater than max payload length connection is closed immediately
	compression: uWS.DEDICATED_COMPRESSOR_3KB,	// I don't know what the trade offs of different compressions are... maybe find out?

	/* WS events */
	/* DOCS: https://unetworking.github.io/uWebSockets.js/generated/interfaces/websocketbehavior.html */
	// TODO: Read about MQTT syntax, understand publish / subscribe / unsubscribe and unsubscribe all (Also wtf is cork?)
	open: (ws) => {

		if (connectionCount < maxConnections) {
			for(let i = 0; i < maxConnections; i++) {
				if (!connections[i]) {
					connections[i] = ws;
					ws.index = i;
					break;
				}
			}
			connectionCount += 1;
		} else {
			let errorMessage = "Connection Refused: Maximum number of connections reached";
			console.log(errorMessage);
			ws.end(1, JSON.stringify({ type: "error", text: errorMessage }));
		}
	},
	message: (ws, message, isBinary) => {
		var json = bufferToString(message);
		console.log("[" + ws.index + "]: " + json);
		var data = JSON.parse(json);
		switch(data.type) {
			case "greet":
				players[ws.index] = data.nick;
				ws.send(JSON.stringify({ type: "acknowledge", playerId: ws.index }));
				distribute(JSON.stringify({ type: "connected", playerId: ws.index, players: players, positions: positions }));
				break;
			case "position":
				data.playerId = ws.index;
				positions[ws.index] = data.position;
				distribute(JSON.stringify(data));
				break;
		}

	},
	drain: (ws) => {
		// A backed up message was sent!
		// Apparently we should check "ws.getBufferedAmount()" to drive backpressure throttling
		console.log("[" + ws.index + "] backpressure: " + ws.getBufferedAmount());
	},
	close: (ws, code, message) => {
		if (ws.index !== undefined) {
			let text = bufferToString(message);
			console.log("[" + ws.index + "] Closed " + code + " " + text);
			connections[ws.index] = null;
			players[ws.index] = null;
			connectionCount -= 1;
			distribute(JSON.stringify({ type: "disconnected", text: text, playerId: ws.index }));
		} else {
			console.log("Untracked Connection Closed " + code + " " + bufferToString(message));
		}
	}
});

// HTTP response
app.get("/*", (res, req) => {
	res.writeStatus('200 OK').end("Number of active connections " + connectionCount);
});

// Listen
app.listen(9001, (listenSocket) => {
	if (listenSocket) {
		console.log("Listening on port 9001");
	}
});
