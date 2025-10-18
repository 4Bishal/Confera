import { Server } from "socket.io";

const connections = new Map();
const usernames = new Map();
const messages = new Map();
const timeOnline = new Map();
const userMediaStates = new Map();

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling']
    });

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        socket.on("join-call", (path, username) => {
            const displayName = username?.trim() || "@anonymous#";
            usernames.set(socket.id, displayName);

            if (!connections.has(path)) {
                connections.set(path, new Set());
            }

            const roomConnections = connections.get(path);
            roomConnections.add(socket.id);
            socket.join(path);

            timeOnline.set(socket.id, Date.now());

            console.log(`User ${socket.id} (${displayName}) joined room: ${path}`);
            console.log(`Room ${path} now has ${roomConnections.size} users`);

            const clientsList = Array.from(roomConnections);
            const usernamesObj = Object.fromEntries(
                clientsList.map(id => [id, usernames.get(id)])
            );

            // Collect all existing media states for the room
            const existingMediaStates = {};
            clientsList.forEach(clientId => {
                if (clientId !== socket.id) {
                    const mediaState = userMediaStates.get(clientId);
                    if (mediaState) {
                        existingMediaStates[clientId] = mediaState;
                    }
                }
            });

            console.log(`Sending existing media states to ${socket.id}:`, existingMediaStates);

            // Send to all users in room about the new joiner with media states
            roomConnections.forEach(clientId => {
                io.to(clientId).emit("user-joined", socket.id, clientsList, usernamesObj, existingMediaStates);
            });

            const roomMessages = messages.get(path);
            if (roomMessages) {
                roomMessages.forEach(msg => {
                    socket.emit("chat-message", msg.data, msg.sender, msg.socketId);
                });
            }
        });

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        socket.on("chat-message", (data, sender) => {
            const room = findRoomBySocketId(socket.id);

            if (room) {
                if (!messages.has(room)) {
                    messages.set(room, []);
                }

                const roomMessages = messages.get(room);
                roomMessages.push({
                    sender,
                    data,
                    socketId: socket.id,
                    timestamp: Date.now()
                });

                console.log(`Message in ${room}: ${sender} = ${data}`);

                const roomConnections = connections.get(room);
                roomConnections.forEach(socketId => {
                    io.to(socketId).emit("chat-message", data, sender, socket.id);
                });
            }
        });

        socket.on("media-state-change", (mediaState) => {
            userMediaStates.set(socket.id, mediaState);

            const room = findRoomBySocketId(socket.id);

            if (room) {
                const roomConnections = connections.get(room);
                roomConnections.forEach(socketId => {
                    if (socketId !== socket.id) {
                        io.to(socketId).emit("media-state-change", socket.id, mediaState);
                    }
                });

                console.log(`User ${socket.id} media state:`, mediaState);
            }
        });

        socket.on("leave-call", () => {
            console.log(`User ${socket.id} intentionally left the call`);
            handleUserLeaving(socket.id, io, "intentional leave");
        });

        socket.on("disconnect", () => {
            console.log(`Socket ${socket.id} disconnected`);
            handleUserLeaving(socket.id, io, "disconnect");
        });
    });

    return io;
};

function findRoomBySocketId(socketId) {
    for (const [room, sockets] of connections.entries()) {
        if (sockets.has(socketId)) {
            return room;
        }
    }
    return null;
}

function handleUserLeaving(socketId, io, reason) {
    const joinTime = timeOnline.get(socketId);
    if (joinTime) {
        const duration = ((Date.now() - joinTime) / 1000).toFixed(2);
        console.log(`User ${socketId} was online for ${duration} seconds (${reason})`);
    }

    let roomsLeft = 0;

    for (const [room, roomSockets] of connections.entries()) {
        if (roomSockets.has(socketId)) {
            roomsLeft++;
            console.log(`Removing user ${socketId} from room: ${room}`);

            roomSockets.forEach(userId => {
                if (userId !== socketId) {
                    io.to(userId).emit("user-left", socketId);
                }
            });

            roomSockets.delete(socketId);

            console.log(`Room ${room} now has ${roomSockets.size} users`);

            if (roomSockets.size === 0) {
                console.log(`Room ${room} is now empty, cleaning up...`);
                connections.delete(room);

                if (messages.has(room)) {
                    messages.delete(room);
                    console.log(`Deleted messages for room: ${room}`);
                }
            }
        }
    }

    usernames.delete(socketId);
    timeOnline.delete(socketId);
    userMediaStates.delete(socketId);

    if (roomsLeft === 0) {
        console.log(`User ${socketId} was not in any rooms`);
    }
}