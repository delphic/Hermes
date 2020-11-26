# Hermes
Playground for web standards based networking.

Proof of concepts using web sockets and node servers using [uWebSockets](https://github.com/uNetworking/uWebSockets.js).

At some point I'll try WebRTC but the complexity overhead is such that I'd rather try pushing web sockets as far as they can go first.

## Chat
Simple chat app which uses web sockets to receive user lists and send chat messages, server dispatches join / leave events.

## Transform Sync
Simple app for synchronizing a game transform information (position / rotation) over the network using web sockets.   
