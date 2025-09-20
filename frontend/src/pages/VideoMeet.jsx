import React, { useEffect, useState, useRef } from 'react';
import style from "../styles/videoComponent.module.css"
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { io } from "socket.io-client";

const server_url = "http://localhost:8000"

// Store peer connections for each connected client
var connections = {};

// WebRTC STUN server configuration (needed for NAT traversal)
const peerConfigConnections = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
}

export const VideoMeet = () => {

    // Socket reference
    const socketRef = useRef();

    // Keep track of this client’s socket ID
    const socketIdRef = useRef();

    // Reference to local video element
    const localVideoRef = useRef();

    // Media availability states
    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);

    // Track user’s media settings
    const [video, setVideo] = useState([]);
    const [audio, setAudio] = useState();
    const [screen, setScreen] = useState();
    const [showModal, setShowModal] = useState();
    const [screenAvailable, setScreenAvailable] = useState(true);

    // Chat/message states
    const [messages, setMessages] = useState([]);
    const [newMessages, setNewMessages] = useState(0);

    // Lobby state
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");

    // Keep track of remote video streams
    const videoRef = useRef([])
    const [videos, setVideos] = useState([])

    /**
     * Request camera + microphone permissions from the user
     * and attach the local stream to the video element
     */
    const getPermissions = async () => {
        try {
            // Request only video to check if allowed
            const getVideoPermissons = await navigator.mediaDevices.getUserMedia({ video: true })
            setVideoAvailable(!!getVideoPermissons)

            // Request only audio to check if allowed
            const getAudioPermissions = await navigator.mediaDevices.getUserMedia({ audio: true })
            setAudioAvailable(!!getAudioPermissions)

            // Check if screen sharing is available
            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia)

            // If either audio or video is allowed → create combined stream
            if (audioAvailable || videoAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({
                    video: videoAvailable,
                    audio: audioAvailable
                });

                window.localStream = userMediaStream;

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = userMediaStream;
                }
            }
        } catch (error) {
            console.log(error)
        }
    }

    // Run on component mount to get user permissions
    useEffect(() => {
        getPermissions();
    }, [])

    /**
     * Replace the local stream when media settings change,
     * then renegotiate with peers
     */
    let getUserMediaSuccess = (stream) => {
        try {
            // Stop old stream tracks before replacing
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (error) {
            console.log(error)
        }

        // Save new stream and update video
        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        console.log(connections)
        // Send new stream to all connected peers
        for (let id in connections) {
            if (id === socketIdRef.current) continue;

            connections[id].addStream(window.localStream);

            // Create offer and send SDP to remote peer
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        // Handle stream ended (e.g., user disabled camera/mic)
        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false)
            setAudio(false)

            try {
                let tracks = localVideoRef.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (error) {
                console.log(error)
            }

            // Replace with black screen + silent audio to keep connection alive
            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            localVideoRef.current.srcObject = window.localStream;

            // Re-offer updated stream to peers
            for (let id in connections) {
                connections[id].addStream(window.localStream);
                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }))
                        }).catch(e => console.log(e))
                })
            }
        })
    }

    /**
     * Acquire user media (video/audio) based on current settings
     */
    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .catch((e) => console.log(e))
        } else {
            // Stop media if user disables both video and audio
            try {
                let tracks = localVideoRef.current.srcObject.getTracks();
                tracks.forEach((track) => track.stop())
            } catch (error) { }
        }
    }

    // Whenever video/audio state changes → re-get media
    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [video, audio])

    /**
     * Handle incoming WebRTC signaling messages from server
     */
    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message);

        if (fromId !== socketIdRef.current) {
            // Handle SDP exchange
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === "offer") {
                        // Answer offer
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }
            // Handle ICE candidates
            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    let addMessage = () => { }

    /**
     * Establish connection with Socket.IO server
     * and handle signaling for WebRTC
     */
    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on("signal", gotMessageFromServer);

        socketRef.current.on("connect", () => {
            // Join call room
            socketRef.current.emit("join-call", window.location.href);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.on("chat-message", addMessage)

            // Handle user leaving
            socketRef.current.on("user-left", (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            // Handle user joining
            socketRef.current.on("user-joined", (id, clients) => {
                clients.forEach((socketListId) => {
                    // Create peer connection for each client
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                    // Gather ICE candidates and send to server
                    connections[socketListId].onicecandidate = (event) => {
                        if (event.candidate != null) {
                            socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }))
                        }
                    }

                    // When remote stream is received → add to UI
                    connections[socketListId].onaddstream = (event) => {
                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            // Update stream if already exists
                            setVideos(videos => {
                                const updatedVideos = videos.map(video => video.socketId === socketListId ? { ...video, stream: event.stream } : video);
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            })
                        } else {
                            // Add new remote video
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoplay: true,
                                playsinline: true
                            }
                            setVideos(videos => {
                                const updatedVideos = [...videos, newVideo];
                                videoRef.current = updatedVideos;
                                return updatedVideos
                            })
                        }
                    }

                    // Add local stream if available
                    if (window.localStream) {
                        connections[socketListId].addStream(window.localStream);
                    } else {
                        // Fallback to black/silence stream
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
                        window.localStream = blackSilence();
                        connections[socketListId].addStream(window.localStream);
                    }
                })

                // If this client is the newly joined one → send offers
                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue

                        try {
                            connections[id2].addStream(window.localStream)
                        } catch (error) { }

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => {
                                    socketRef.current.emit("signal", id2, JSON.stringify({ sdp: connections[id2].localDescription }))
                                })
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    /**
     * Utility: generate a silent audio track
     */
    let silence = () => {
        let ctx = new AudioContext();
        let oscillator = ctx.createOscillator();
        let dst = oscillator.connect(ctx.createMediaStreamDestination())

        oscillator.start();
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }

    /**
     * Utility: generate a black video track
     */
    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height });
        canvas.getContext("2d").fillRect(0, 0, width, height);
        let stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    /**
     * Initialize media + connect to signaling server
     */
    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    // Lobby connect button
    let connect = () => {
        setAskForUsername(false);
        getMedia();
    }

    return (
        <div>
            {
                askForUsername ? (
                    <div>
                        <h2>Enter into lobby</h2>
                        <TextField id="outlined-basic" label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                        <Button variant="contained" onClick={connect}>Connect</Button>
                        <div>
                            <video ref={localVideoRef} autoPlay muted></video>
                        </div>
                    </div>
                ) : (
                    <div className='meetVideoContainer'>
                        {/* Local video */}
                        <video ref={localVideoRef} autoPlay muted></video>

                        {/* Remote videos */}
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <h2>{video.socketId}</h2>
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream
                                        }
                                    }}
                                    autoPlay
                                ></video>
                            </div>
                        ))}
                    </div>
                )
            }
        </div>
    )
}
