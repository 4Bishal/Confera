import React, { useEffect, useState, useRef } from 'react';
import { io } from "socket.io-client";
import {
    PhoneOff,
    Mic,
    MicOff,
    Video,
    VideoOff,
    MonitorUp,
    MonitorStop,
    MessageSquare,
    Send,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router';
import server from '../environment';

const server_url = server;
var connections = {};

const peerConfigConnections = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export const VideoMeet = () => {
    const navigate = useNavigate();

    // Socket reference
    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoRef = useRef();

    // Media availability states
    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);

    // Track user's media settings
    const [video, setVideo] = useState(false);
    const [audio, setAudio] = useState(false);
    const [screen, setScreen] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(true);

    // Chat/message states
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [newMessages, setNewMessages] = useState(0);

    // Lobby state
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");

    // Keep track of remote video streams
    const videoRef = useRef([]);
    const [videos, setVideos] = useState([]);

    const chatEndRef = useRef();
    const [mutedUsers, setMutedUsers] = useState({});
    const [videoOffUsers, setVideoOffUsers] = useState({});

    // Track if we're currently screen sharing
    const isScreenSharingRef = useRef(false);

    // Cleanup flag to prevent state updates after unmount
    const isMountedRef = useRef(true);

    /**
     * Request camera + microphone permissions from the user
     */
    const getPermissions = async () => {
        try {
            const getVideoPermissons = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoAvailable(!!getVideoPermissons);
            getVideoPermissons.getTracks().forEach(track => track.stop());

            const getAudioPermissions = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioAvailable(!!getAudioPermissions);
            getAudioPermissions.getTracks().forEach(track => track.stop());

            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
        } catch (error) {
            console.log(error);
        }
    };

    useEffect(() => {
        getPermissions();

        // Set mounted flag
        isMountedRef.current = true;

        // Cleanup on unmount
        return () => {
            isMountedRef.current = false;
            cleanupCall();
        };
    }, []);

    // Handle page refresh, close, or navigation
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (!askForUsername) {
                cleanupCall();
                // Optionally show confirmation
                // e.preventDefault();
                // e.returnValue = 'Are you sure you want to leave the call?';
            }
        };

        const handlePopState = () => {
            if (!askForUsername) {
                cleanupCall();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [askForUsername]);

    /**
     * Complete cleanup function
     */
    const cleanupCall = () => {
        try {
            // Stop all local media tracks
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
                window.localStream = null;
            }

            // Clear local video element
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }

            // Close all peer connections
            Object.keys(connections).forEach(id => {
                if (connections[id]) {
                    connections[id].close();
                }
            });
            connections = {};

            // Disconnect socket
            if (socketRef.current) {
                socketRef.current.off("signal");
                socketRef.current.off("chat-message");
                socketRef.current.off("user-left");
                socketRef.current.off("user-joined");
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        } catch (e) {
            console.error("Cleanup error:", e);
        }
    };

    /**
     * Replace the local stream with peers
     */
    let replaceStreamForPeers = (newStream) => {
        for (let id in connections) {
            if (id === socketIdRef.current) continue;

            const peerConnection = connections[id];
            const senders = peerConnection.getSenders();

            newStream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    peerConnection.addTrack(track, newStream);
                }
            });
        }
    };

    /**
     * Renegotiate with all peers
     */
    let renegotiateWithPeers = () => {
        for (let id in connections) {
            if (id === socketIdRef.current) continue;

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
                    })
                    .catch(e => console.log(e));
            });
        }
    };

    /**
     * Acquire user media (video/audio) based on current settings
     */
    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({
                video: video && videoAvailable,
                audio: audio && audioAvailable
            })
                .then((stream) => {
                    if (window.localStream) {
                        window.localStream.getTracks().forEach(track => track.stop());
                    }

                    window.localStream = stream;
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = stream;
                    }
                    isScreenSharingRef.current = false;

                    replaceStreamForPeers(stream);

                    stream.getTracks().forEach(track => track.onended = () => {
                        handleTrackEnded();
                    });
                })
                .catch((e) => console.log(e));
        } else {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }
            isScreenSharingRef.current = false;

            replaceStreamForPeers(window.localStream);
        }
    };

    /**
     * Handle track ended event
     */
    let handleTrackEnded = () => {
        if (isScreenSharingRef.current) {
            setScreen(false);
            setVideo(false);
            setAudio(false);
        } else {
            setVideo(false);
            setAudio(false);
        }

        if (window.localStream) {
            window.localStream.getTracks().forEach(track => track.stop());
        }

        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
        window.localStream = blackSilence();
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = window.localStream;
        }
        isScreenSharingRef.current = false;

        replaceStreamForPeers(window.localStream);
        renegotiateWithPeers();
    };

    /**
     * Get display media for screen sharing
     */
    const getDisplayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                })
                    .then((stream) => {
                        if (window.localStream) {
                            window.localStream.getTracks().forEach(track => track.stop());
                        }

                        window.localStream = stream;
                        if (localVideoRef.current) {
                            localVideoRef.current.srcObject = stream;
                        }
                        isScreenSharingRef.current = true;

                        replaceStreamForPeers(stream);

                        stream.getTracks().forEach(track => {
                            track.onended = () => {
                                setScreen(false);
                                isScreenSharingRef.current = false;
                                getUserMedia();
                            };
                        });
                    })
                    .catch(e => {
                        console.log(e);
                        setScreen(false);
                    });
            }
        } else {
            isScreenSharingRef.current = false;
            getUserMedia();
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined && !askForUsername) {
            if (!screen && !isScreenSharingRef.current) {
                getUserMedia();
            }
        }
    }, [video, audio]);

    useEffect(() => {
        if (!askForUsername) {
            getDisplayMedia();
        }
    }, [screen]);

    /**
     * Handle incoming WebRTC signaling messages from server
     */
    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message);

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === "offer") {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e));
            }
            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
            }
        }
    };

    let addMessage = (data, sender, socketIdSender) => {
        if (!isMountedRef.current) return;

        setMessages((prevMessages) => [
            ...prevMessages,
            { data: data, sender: sender }
        ]);

        if (socketIdRef.current !== socketIdSender) {
            setNewMessages((prevMessages) => prevMessages + 1);
        }
    };

    /**
     * Establish connection with Socket.IO server
     */
    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false });

        socketRef.current.on("signal", gotMessageFromServer);

        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", window.location.href, username);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.on("chat-message", addMessage);

            socketRef.current.on("user-left", (id) => {
                if (!isMountedRef.current) return;

                setVideos((videos) => videos.filter((video) => video.socketId !== id));
                if (connections[id]) {
                    connections[id].close();
                    delete connections[id];
                }
            });

            socketRef.current.on("user-joined", (id, clients, usernames) => {
                clients.forEach((socketListId) => {
                    if (!connections[socketListId]) {
                        connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                        connections[socketListId].onicecandidate = (event) => {
                            if (event.candidate != null) {
                                socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
                            }
                        };

                        connections[socketListId].ontrack = (event) => {
                            if (socketListId === socketIdRef.current || !isMountedRef.current) {
                                return;
                            }

                            setVideos(videos => {
                                const videoExists = videos.find(video => video.socketId === socketListId);

                                if (videoExists) {
                                    const updatedVideos = videos.map(video =>
                                        video.socketId === socketListId
                                            ? { ...video, stream: event.streams[0], username: usernames[socketListId] }
                                            : video
                                    );
                                    videoRef.current = updatedVideos;
                                    return updatedVideos;
                                } else {
                                    let newVideo = {
                                        socketId: socketListId,
                                        stream: event.streams[0],
                                        username: usernames[socketListId],
                                        autoplay: true,
                                        playsinline: true
                                    };
                                    const updatedVideos = [...videos, newVideo];
                                    videoRef.current = updatedVideos;
                                    return updatedVideos;
                                }
                            });
                        };

                        if (window.localStream) {
                            window.localStream.getTracks().forEach(track => {
                                connections[socketListId].addTrack(track, window.localStream);
                            });
                        } else {
                            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
                            window.localStream = blackSilence();
                            window.localStream.getTracks().forEach(track => {
                                connections[socketListId].addTrack(track, window.localStream);
                            });
                        }
                    }
                });

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue;

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => {
                                    socketRef.current.emit("signal", id2, JSON.stringify({ sdp: connections[id2].localDescription }));
                                })
                                .catch(e => console.log(e));
                        });
                    }
                }
            });
        });
    };

    /**
     * Utility: generate a silent audio track
     */
    let silence = () => {
        let ctx = new AudioContext();
        let oscillator = ctx.createOscillator();
        let dst = oscillator.connect(ctx.createMediaStreamDestination());

        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
    };

    /**
     * Utility: generate a black video track
     */
    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height });
        canvas.getContext("2d").fillRect(0, 0, width, height);
        let stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], { enabled: false });
    };

    /**
     * Initialize media + connect to signaling server
     */
    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);

        if (!videoAvailable && !audioAvailable) {
            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }
        }

        connectToSocketServer();
    };

    let connect = () => {
        setAskForUsername(false);
        getMedia();
    };

    const handleVideo = () => {
        if (!screen) {
            setVideo(!video);
        }
    };

    const handleAudio = () => {
        setAudio(!audio);
    };

    /**
     * IMPROVED END CALL FUNCTION
     */
    const handleEndCall = () => {
        try {
            // 1. Stop all local media tracks
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => {
                    track.stop();
                });
                window.localStream = null;
            }

            // 2. Clear local video element
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }

            // 3. Close all peer connections
            Object.keys(connections).forEach(id => {
                if (connections[id]) {
                    connections[id].close();
                }
            });
            connections = {};

            // 4. Emit leave event and disconnect socket
            if (socketRef.current) {
                socketRef.current.emit("leave-call"); // Let server know you're leaving
                socketRef.current.off("signal");
                socketRef.current.off("chat-message");
                socketRef.current.off("user-left");
                socketRef.current.off("user-joined");
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            // 5. Clear video states
            setVideos([]);
            videoRef.current = [];

            // 6. Reset all states
            setVideo(false);
            setAudio(false);
            setScreen(false);
            setMessages([]);
            setNewMessages(0);
            setShowModal(false);
            isScreenSharingRef.current = false;

        } catch (e) {
            console.error("Error ending call:", e);
        } finally {
            // 7. Navigate away
            navigate("/home");
        }
    };

    const handleScreen = () => {
        setScreen(!screen);
    };

    const handleChat = () => {
        setShowModal(!showModal);
        if (!showModal) {
            setNewMessages(0);
        }
    };

    const sendMessage = () => {
        if (message.trim()) {
            socketRef.current.emit("chat-message", message, username);
            setMessage("");
        }
    };

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const getGridLayout = () => {
        const count = videos.length;
        const isMobile = window.innerWidth < 768;

        if (count === 0) return { cols: 1, rows: 1 };
        if (count === 1) return { cols: 1, rows: 1 };

        if (isMobile) {
            if (count === 2) return { cols: 1, rows: 2 };
            if (count <= 4) return { cols: 2, rows: 2 };
            if (count <= 6) return { cols: 2, rows: 3 };
            return { cols: 2, rows: Math.ceil(count / 2) };
        }

        if (count === 2) return { cols: 2, rows: 1 };
        if (count <= 4) return { cols: 2, rows: 2 };
        if (count <= 6) return { cols: 3, rows: 2 };
        if (count <= 9) return { cols: 3, rows: 3 };
        return { cols: 4, rows: Math.ceil(count / 4) };
    };

    const gridLayout = getGridLayout();

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

            {askForUsername ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center min-h-screen p-4"
                >
                    <div className="w-full max-w-md space-y-6 backdrop-blur-xl bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">
                        <div className="text-center space-y-2">
                            <h2 className="text-4xl font-bold text-white">Join Meeting</h2>
                            <p className="text-gray-400">Enter your name to continue</p>
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && username.trim() && connect()}
                            placeholder="Your name"
                            className="w-full px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white shadow-lg transition-all"
                        />
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={connect}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Join Now
                        </motion.button>
                    </div>
                </motion.div>
            ) : (
                <>
                    <div className="absolute inset-0 flex items-center justify-center p-2 md:p-4 pb-24 md:pb-28">
                        <div
                            className="w-full h-full grid gap-2 md:gap-3"
                            style={{
                                gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
                                gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`
                            }}
                        >
                            {videos.length === 0 ? (
                                <div className="flex items-center justify-center col-span-full row-span-full">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center space-y-4"
                                    >
                                        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                            <Video size={32} className="text-white md:w-10 md:h-10" />
                                        </div>
                                        <p className="text-white text-lg md:text-xl font-semibold">Waiting for others to join...</p>
                                        <p className="text-gray-400 text-xs md:text-sm mt-2">Share the meeting link</p>
                                    </motion.div>
                                </div>
                            ) : (
                                videos.map((video, idx) => (
                                    <div key={video.socketId} className="relative rounded-lg md:rounded-xl overflow-hidden bg-gray-900 border border-white/10">
                                        <video
                                            ref={ref => { if (ref && video.stream) ref.srcObject = video.stream }}
                                            autoPlay
                                            playsInline
                                            className="w-full h-full object-cover"
                                        />
                                        {videoOffUsers[video.socketId] && (
                                            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
                                                <VideoOff size={32} className="text-white md:w-12 md:h-12" />
                                                <p className="text-white text-xs md:text-sm mt-2">Camera Off</p>
                                            </div>
                                        )}
                                        <div className="absolute top-2 left-2 text-white text-xs font-medium px-2 py-1 bg-black/30 rounded backdrop-blur-sm">
                                            {video.username}
                                        </div>
                                        {mutedUsers[video.socketId] && (
                                            <div className="absolute top-2 right-2 bg-red-500/90 p-1.5 rounded-full backdrop-blur-sm">
                                                <MicOff size={14} className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <motion.div className="fixed bottom-20 md:bottom-24 right-2 md:right-4 w-28 h-20 sm:w-36 sm:h-28 md:w-48 md:h-36 rounded-lg md:rounded-xl overflow-hidden border-2 border-orange-500 shadow-2xl z-30 bg-black">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ transform: screen ? 'none' : 'scaleX(-1)' }}
                        />
                        {!video && !screen && (
                            <div className="absolute inset-0 bg-black flex items-center justify-center">
                                <VideoOff size={24} className="text-white" />
                            </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 text-center text-xs text-white font-semibold truncate">
                            {username} (You) {screen && '- Sharing'}
                        </div>
                        {!audio && (
                            <div className="absolute top-1 right-1 bg-red-500/90 p-1 rounded-full backdrop-blur-sm">
                                <MicOff size={10} className="text-white md:w-3 md:h-3" />
                            </div>
                        )}
                    </motion.div>

                    <motion.div className="fixed bottom-3 left-1/2 transform -translate-x-1/2 backdrop-blur-xl bg-white/10 border border-white/20 rounded-full shadow-2xl px-3 md:px-6 py-2.5 md:py-3.5 flex items-center gap-2 md:gap-3 z-40">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleVideo}
                            disabled={screen}
                            className={`p-2.5 md:p-3.5 rounded-full transition-all ${screen
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : video
                                    ? 'bg-gray-200 text-black hover:bg-gray-300'
                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                }`}
                        >
                            {video ? <Video size={18} className="md:w-5 md:h-5" /> : <VideoOff size={18} className="md:w-5 md:h-5" />}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleAudio}
                            className={`p-2.5 md:p-3.5 rounded-full transition-all ${audio ? 'bg-gray-200 text-black hover:bg-gray-300' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
                        >
                            {audio ? <Mic size={18} className="md:w-5 md:h-5" /> : <MicOff size={18} className="md:w-5 md:h-5" />}
                        </motion.button>

                        {screenAvailable && (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleScreen}
                                className={`p-2.5 md:p-3.5 rounded-full transition-all ${screen ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
                            >
                                {screen ? <MonitorUp size={18} className="md:w-5 md:h-5" /> : <MonitorStop size={18} className="md:w-5 md:h-5" />}
                            </motion.button>
                        )}

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleChat}
                            className="p-2.5 md:p-3.5 rounded-full bg-gray-200 text-black hover:bg-gray-300 transition-all relative"
                        >
                            <MessageSquare size={18} className="md:w-5 md:h-5" />
                            {newMessages > 0 && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute -top-1 -right-1 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-bold rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center shadow-lg"
                                >
                                    {newMessages > 9 ? '9+' : newMessages}
                                </motion.div>
                            )}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleEndCall}
                            className="p-2.5 md:p-3.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all"
                        >
                            <PhoneOff size={18} className="md:w-5 md:h-5" />
                        </motion.button>
                    </motion.div>

                    <AnimatePresence>
                        {showModal && (
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 flex flex-col"
                                style={{ height: '80vh' }}
                            >
                                <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200">
                                    <h3 className="text-lg md:text-xl font-bold text-gray-800">Chat</h3>
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={handleChat}
                                        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <X size={20} className="text-gray-600" />
                                    </motion.button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
                                    {messages.length === 0 ? (
                                        <div className="flex items-center justify-center h-full">
                                            <p className="text-gray-400 text-sm">No messages yet. Start the conversation!</p>
                                        </div>
                                    ) : (
                                        messages.map((msg, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`flex flex-col ${msg.sender === username ? 'items-end' : 'items-start'}`}
                                            >
                                                <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${msg.sender === username
                                                    ? 'bg-orange-500 text-white rounded-br-none'
                                                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                                                    }`}>
                                                    {msg.sender !== username && (
                                                        <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender}</p>
                                                    )}
                                                    <p className="text-sm break-words">{msg.data}</p>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                <div className="px-4 md:px-6 py-4 border-t border-gray-200 bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                            placeholder="Type a message..."
                                            className="flex-1 px-4 py-3 rounded-full bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={sendMessage}
                                            disabled={!message.trim()}
                                            className="p-3 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Send size={18} />
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
};