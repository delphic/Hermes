// websocket transform sync poc

// General Application
let isDevelopment = true;
let wsURI = isDevelopment ? "ws://localhost:9001" : "wss://delphic.me.uk:9001";
let onloadHandlers = [];

window.onload = (event) => {
	for(let i = 0, l = onloadHandlers.length; i < l; i++) {
		onloadHandlers[i](event);
	}
};

var Connection = (function(){
	// Static Module - only one connection currently
	// TODO: convert to be able to create multiple connections
	// with different configuration (e.g. player management should be optional)

	// Message Types:
	// "connected", "acknowledge", "disconnected", "ping", "greet"
	// Can attach handlers to send / recieve data

	// Connection flow
	// onload: connect WS
	// onopen: schedule "ping" message at % of timeout
	// onmessage "acknowledge" -> contains playerId
	// onmessage "connected" -> contains playerList and playerId of who connected
	// onmessage "disconnected" -> contains playerId of who disconnected

	let exports = {};

	let webSocket;
	let nick = "Player";
	let playerList = [];
	let messageHandlers = [];
	let localPlayerId = -1;

	// Ping!
	const pingInterval = 60 * 1000; // 60s
	let schedulePing = () => {
		window.setTimeout(ping, pingInterval);
	};
	let ping = () => {
		webSocket.send(JSON.stringify({ type: "ping" }));
		schedulePing();
	};

	exports.send = (obj) => {
		webSocket.send(JSON.stringify(obj));
	};

	exports.connect = () => {
		webSocket = new WebSocket(wsURI);

		webSocket.onopen = (event) => {
			console.log("Web Socket Open");
			schedulePing();
			webSocket.send(JSON.stringify({ type: "greet", nick: nick }));
		};
		webSocket.onerror = (event) => {
			console.log("WebSocket Error Observed: ", event);
		};
		webSocket.onclose = (event) => {
			console.log("Web Socket CLosed");
		};
		webSocket.onmessage = (event) => {
			console.log(event.data);
			var message = JSON.parse(event.data);
			switch (message.type)
			{
				case "acknowledge":
					localPlayerId = message.playerId;
					break;
				case "connected":
					playerList = message.players;
					break;
				case "disconnected":
					if (playerList) {
						playerList[message.playerId] = null;
					}
					break;
				case "error":
					console.error(event.text);
					break;
			}

			// If connected and acknowledged run any additional handlers
			if (localPlayerId >= 0) {
				for (let i = 0, l = messageHandlers.length; i < l; i++) {
					if (messageHandlers[i]) {
						messageHandlers[i](message, message.playerId == localPlayerId);
						// TODO: ^^ This is a bit of a hack, expose localPlayerId and playerList
						// on exports.
					}
				}
			}
		};
	};

	exports.setNick = (value) => {
		nick = value;
	};

	exports.addMessageHandler = (handler) => {
		// Try fill empty spots
		for (let i = 0, l = messageHandlers.length; i < l; i++) {
			if (!messageHandlers[i]) {
				messageHandlers[i] = handler;
				return i;
			}
		}
		// Add to the end
		messageHandlers.push(handler);
		return messageHandlers.length - 1;
	};
	exports.removeMessageHandler = (index) => {
		messageHandlers[index] = null;
	};

	return exports;
})();

onloadHandlers.push((event) => {
	let nick = "Player";
	//nick = prompt("Enter your nick name", "Player");
	//if (!nick) {
	//	nick = "Player";
	//}
	Connection.setNick(nick);
	Connection.connect();
});

// Game
// TODO: Move to module

let Game = (function(){
	let exports = {};

	let color, shader, material, camera;
	let scene, localPlayer;
	let players = [];

	let createQuad = function(size) {
		return Fury.Mesh.create({
			vertices: [ size * 0.5, size * 0.5, 0.0, size * -0.5,  size * 0.5, 0.0, size * 0.5, size * -0.5, 0.0, size * -0.5, size * -0.5, 0.0 ],
			textureCoordinates: [ 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0 ],
			renderMode: Fury.Renderer.RenderMode.TriangleStrip
		});
	};

	let createPlayer = function(id) {
		// TODO: More materials
		players[id] = scene.add({ material: material, mesh: createQuad(16) });
	};

	let setPlayerPosition = function(id, position) {
		players[id].transform.position = position;
	};

	exports.init = function() {
		// Wait Fury should exist we shoudln't need to move all the of init in here

		// globalize glMatrix
		Fury.Maths.globalize();

		// Init Fury
		Fury.init("fury", { antialias: false }); // TODO: Move to onload

		// Create shader
		// Simple color shader
		shader = Fury.Shader.create({
			vsSource: [
        "attribute vec3 aVertexPosition;",

		    "uniform mat4 uMVMatrix;",
		    "uniform mat4 uPMatrix;",

		    "void main(void) {",
		        "gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);",
		    "}"].join('\n'),
			fsSource: [
			"precision mediump float;",

				"uniform vec3 uColor;",

		    "void main(void) {",
		        "gl_FragColor = vec4(uColor, 1.0);",
		    "}"].join('\n'),

			attributeNames: [ "aVertexPosition" ],
			uniformNames: [ "uMVMatrix", "uPMatrix", "uColor" ],
			pMatrixUniformName: "uPMatrix",
			mvMatrixUniformName: "uMVMatrix",
			bindMaterial: function(material) {
				this.setUniformVector3("uColor", material.color);
			},
			bindBuffers: function(mesh) {
				this.enableAttribute("aVertexPosition");
				this.setAttribute("aVertexPosition", mesh.vertexBuffer);
				this.setIndexedAttribute(mesh.indexBuffer);
			}
		});

		material = Fury.Material.create({ shader : shader });
		material.color = vec3.fromValues(1.0, 0.0, 0.5);

		camera = Fury.Camera.create({
			type: Fury.Camera.Type.Orthonormal,
			near: 0.1,
			far: 1000000.0,
			height: 256.0, 		// TODO: Should explicitly be canvas height
			ratio: 1, 			// TODO: Should explicitly be canvas width/height
			position: vec3.fromValues(0.0, 0.0, 1.0)
		});

		scene = Fury.Scene.create({ camera: camera });

		// TODO: Add sprite per player not just one at the start
		localPlayer = scene.add({ material: material, mesh: createQuad(16) });

		loop();
	};

	let time = 0, lastTime = 0;
	let speed = 32;

	let loop = function() {
		let elapsed = (Date.now()/1000 - lastTime);
		lastTime = Date.now()/1000;
		time += elapsed;

		// Assumes canvas size is 256x256 and sprite size is 16
		let halfWidth = 128, halfHeight = 128;
		let minX = -halfWidth + 8, maxX = halfWidth - 8;
		let minY = -halfHeight + 8, maxY = halfHeight - 8;

		let dx = 0, dy = 0;
		if (Fury.Input.keyDown("Left")) {
			dx -= speed * elapsed;
		}
		if (Fury.Input.keyDown("Right")) {
			dx += speed * elapsed;
		}
		if (Fury.Input.keyDown("Up")) {
			dy += speed * elapsed;
		}
		if (Fury.Input.keyDown("Down")) {
			dy -= speed * elapsed;
		}

		let x = localPlayer.transform.position[0];
		let y = localPlayer.transform.position[1];
		if (dx !== 0 || dy !== 0) {
			localPlayer.transform.position[0] = Math.min(maxX, Math.max(minX, x + dx));
			localPlayer.transform.position[1] = Math.min(maxY, Math.max(minY, y + dy));
		}

		if (localPlayer.transform.position[0] !== x || localPlayer.transform.position[1] !== y) {
			// Could try reducing traffic this by only sending input changes w/ current position
			// Then having others interpolate / and calculate your position
			Connection.send({ type: "position", position: localPlayer.transform.position });
		}

		scene.render();

		window.requestAnimationFrame(loop);
	};

	let handleMessage = function(message, isLocalPlayer) {
		let id = message.playerId;
		if (message.type == "connected") {
			if (!isLocalPlayer) {
				// Someone else connected
				createPlayer(id);
			} else {
				// You connected add the other players
				for(let i = 0, l = message.players.length; i < l; i++) {
					if (message.players[i] && !players[i] && i !== id) {
						createPlayer(i);
						if (message.positions[i]) {
							setPlayerPosition(i, message.positions[i]);
						}
					}
				}
			}
		} else if (!isLocalPlayer && message.type == "position") {
				if (!players[id]) {
					createPlayer(id);
				}
				setPlayerPosition(id, message.position);
		} else if (message.type == "disconnected" && players[id]) {
			players[id].remove();
			// ^^ this is a bit wierd, scene.remove() would be more sensible and clear really
		}
	}

	Connection.addMessageHandler(handleMessage);

	return exports;
})();

onloadHandlers.push(Game.init);
