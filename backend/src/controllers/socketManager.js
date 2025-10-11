import { Server } from "socket.io";

// Store active connections for each "room" or call path
let connections = {};

// Store username for each socket
let usernames = {};

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
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
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
        socket.on("join-call", (path, username) => {

            // Store the username for this socket
            if (username === undefined || username === null || username === "") {
                usernames[socket.id] = "@anonymous#";
            } else {
                usernames[socket.id] = username;
            }


            // Initialize the room if it doesn't exist
            if (connections[path] === undefined) {
                connections[path] = [];
            }


            // Add this socket to the room's connection list
            connections[path].push(socket.id);

            // Store the connection time for this socket
            timeOnline[socket.id] = new Date();

            console.log(`User ${socket.id} (${username}) joined room: ${path}`);
            console.log(`Room ${path} now has ${connections[path].length} users`);

            // Notify all users in the room that a new user has joined
            for (let i = 0; i < connections[path].length; i++) {
                io.to(connections[path][i]).emit("user-joined", socket.id, connections[path], usernames);
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
                messages[matchingRoom].push({
                    'sender': sender,
                    'data': data,
                    'socket-id-sender': socket.id
                });
                console.log("message", matchingRoom, ":", sender, "=", data);

                // Broadcast the message to all users in the room
                connections[matchingRoom].forEach(socketId => {
                    io.to(socketId).emit("chat-message", data, sender, socket.id);
                });
            }
        });

        /**
         * Event: "leave-call"
         * NEW: Triggered when a user intentionally leaves the call
         * This provides a cleaner exit than waiting for disconnect timeout
         */
        socket.on("leave-call", () => {
            console.log(`User ${socket.id} intentionally left the call`);
            handleUserLeaving(socket.id, io, "intentional leave");
        });

        /**
         * Event: "disconnect"
         * Triggered when a user disconnects from the server
         * (could be network issue, page refresh, browser close, etc.)
         */
        socket.on("disconnect", () => {
            console.log(`Socket ${socket.id} disconnected`);
            delete usernames[socket.id];  // Add this line
            handleUserLeaving(socket.id, io, "disconnect");
        });
    });

    return io;
};

/**
 * Helper function to handle user leaving (either intentional or disconnect)
 * @param {string} socketId - Socket ID of the user leaving
 * @param {Server} io - Socket.IO server instance
 * @param {string} reason - Reason for leaving ("intentional leave" or "disconnect")
 */
function handleUserLeaving(socketId, io, reason) {
    // Calculate how long the user was online
    if (timeOnline[socketId]) {
        const diffTime = Math.abs(timeOnline[socketId] - new Date());
        const seconds = (diffTime / 1000).toFixed(2);
        console.log(`User ${socketId} was online for ${seconds} seconds (${reason})`);
    }

    // Find all rooms this socket belongs to and remove it
    let roomsLeft = 0;
    for (const [room, users] of Object.entries(connections)) {
        if (users.includes(socketId)) {
            roomsLeft++;
            console.log(`Removing user ${socketId} from room: ${room}`);

            // Notify remaining users that this user left
            users.forEach(userId => {
                if (userId !== socketId) {
                    io.to(userId).emit("user-left", socketId);
                }
            });

            // Remove the socket from the room
            const index = connections[room].indexOf(socketId);
            if (index > -1) {
                connections[room].splice(index, 1);
            }

            console.log(`Room ${room} now has ${connections[room].length} users`);

            // Clean up room if empty
            if (connections[room].length === 0) {
                console.log(`Room ${room} is now empty, cleaning up...`);
                delete connections[room];

                // Optional: Also clean up messages for this room
                if (messages[room]) {
                    delete messages[room];
                    console.log(`Deleted messages for room: ${room}`);
                }
            }
        }
    }

    // Clean up stored connection time
    delete timeOnline[socketId];

    if (roomsLeft === 0) {
        console.log(`User ${socketId} was not in any rooms`);
    }
}