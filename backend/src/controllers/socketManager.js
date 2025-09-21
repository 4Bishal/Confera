import { Server } from "socket.io";

// Store active connections for each "room" or call path
let connections = {};

// Store chat messages for each "room" or call path
let messages = {};

// Track the time when each socket connected (used for online duration or logging)
let timeOnline = {};

/**
 * Initialize and connect Socket.IO server
 * @param {http.Server} server - HTTP server instance to attach Socket.IO
 * @returns {Server} io - Socket.IO server instance
 */
export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",                 // Allow requests from any origin
            methods: ["GET", "POST"],    // Allowed HTTP methods
            allowedHeaders: ["*"],       // Allow all headers
            credentials: true            // Allow credentials (cookies, authorization headers)
        }
    });

    // Fired when a new client connects
    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        /**
         * Event: "join-call"
         * Triggered when a user joins a call or room
         * @param {string} path - Unique room or call identifier
         */
        socket.on("join-call", (path) => {
            // Initialize the room if it doesn't exist
            if (connections[path] === undefined) {
                connections[path] = [];
            }

            // Add this socket to the room's connection list
            connections[path].push(socket.id);

            // Store the connection time for this socket
            timeOnline[socket.id] = new Date();

            // Notify all users in the room that a new user has joined
            for (let i = 0; i < connections[path].length; i++) {
                io.to(connections[path][i]).emit("user-joined", socket.id, connections[path]);
            }

            // Send existing chat messages to the newly joined user
            if (messages[path] !== undefined) {
                for (let i = 0; i < messages[path].length; ++i) {
                    const msg = messages[path][i];
                    io.to(socket.id).emit("chat-message", msg['data'], msg['sender'], msg['socket-id-sender']);
                }
            }
        });

        /** 
         * Event: "signal"
         * For WebRTC signaling (exchange SDP and ICE candidates)
         * @param {string} toId - Target socket ID
         * @param {any} message - Signaling data (SDP, ICE)
         */
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        /**
         * Event: "chat-message"
         * Broadcasts a message to all users in the same room
         * @param {string} data - Message content
         * @param {string} sender - Sender username or identifier
         */
        socket.on("chat-message", (data, sender) => {

            // Find the room this socket belongs to
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);

            if (found) {
                // Initialize message storage for this room if not exists
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = [];
                }

                // Save the message in memory
                messages[matchingRoom].push({ 'sender': sender, 'data': data, 'socket-id-sender': socket.id });
                console.log("message", matchingRoom, ":", sender, "=", data);

                // Broadcast the message to all users in the room
                connections[matchingRoom].forEach(socketId => {
                    io.to(socketId).emit("chat-message", data, sender, socket.id);
                });
            }
        });

        /**
         * Event: "disconnect"
         * Triggered when a user disconnects from the server
         */
        socket.on("disconnect", () => {
            // Calculate how long the user was online
            var diffTime = Math.abs(timeOnline[socket.id] - new Date());
            console.log(`Socket ${socket.id} disconnected after ${diffTime} ms`);

            // Find the room this socket belongs to and remove it
            for (const [room, users] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
                if (users.includes(socket.id)) {
                    // Notify remaining users that this user left
                    users.forEach(userId => {
                        io.to(userId).emit("user-left", socket.id);
                    });

                    // Remove the socket from the room
                    const index = connections[room].indexOf(socket.id);
                    connections[room].splice(index, 1);

                    // Clean up room if empty
                    if (connections[room].length === 0) {
                        delete connections[room];
                    }
                }
            }

            // Clean up stored connection time
            delete timeOnline[socket.id];
        });
    });

    return io;
};
