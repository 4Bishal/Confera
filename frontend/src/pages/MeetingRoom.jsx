import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
    X,
    SwitchCamera,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams, useLocation } from "react-router";
import server from "../environment";

const PEER_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
};

const BLACK_VIDEO_DIMS = { width: 640, height: 480 };

export const MeetingRoom = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { meetingCode } = useParams();

    // Get data from PreviewMeeting
    const {
        username: initialUsername,
        previewVideo: initialVideo,
        previewAudio: initialAudio,
        videoAvailable: initialVideoAvailable,
        audioAvailable: initialAudioAvailable,
        cameraFacingMode: initialCameraFacingMode,
    } = location.state || {};

    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoRef = useRef();
    const connectionsRef = useRef({});
    const isMountedRef = useRef(true);
    const isScreenSharingRef = useRef(false);
    const localStreamRef = useRef(null);
    const persistentAudioTrackRef = useRef(null);
    const chatEndRef = useRef();
    const audioStateRef = useRef(initialAudio ?? true);
    const videoStateRef = useRef(initialVideo ?? true);
    const isGettingUserMediaRef = useRef(false);
    const dedicatedAudioStreamRef = useRef(null);
    const isChatOpenRef = useRef(false)




    // Load persisted states from sessionStorage
    const getPersistedState = (key, defaultValue) => {
        try {
            const stored = sessionStorage.getItem(`meeting_${meetingCode}_${key}`);
            return stored !== null ? JSON.parse(stored) : defaultValue;
        } catch {
            return defaultValue;
        }
    };

    const [videoAvailable, setVideoAvailable] = useState(
        initialVideoAvailable ?? true
    );
    const [audioAvailable, setAudioAvailable] = useState(
        initialAudioAvailable ?? true
    );
    const [video, setVideo] = useState(
        getPersistedState("video", initialVideo ?? true)
    );
    const [audio, setAudio] = useState(
        getPersistedState("audio", initialAudio ?? true)
    );
    const [screen, setScreen] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(true);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [newMessages, setNewMessages] = useState(0);
    const [username] = useState(initialUsername || "Guest");
    const [videos, setVideos] = useState([]);
    const [remoteUserStates, setRemoteUserStates] = useState({});
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState(
        getPersistedState("cameraFacingMode", initialCameraFacingMode || "user")
    );
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const videoRefs = useRef({});
    const isSwitchingCameraRef = useRef(false);
    const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
    const isScreenShareOperationRef = useRef(false);

    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const chatPanelRef = useRef(null);

    // Persist states to sessionStorage whenever they change
    useEffect(() => {
        try {
            sessionStorage.setItem(
                `meeting_${meetingCode}_video`,
                JSON.stringify(video)
            );
        } catch (e) {
            console.error("Error saving video state:", e);
        }
    }, [video, meetingCode]);

    useEffect(() => {
        try {
            sessionStorage.setItem(
                `meeting_${meetingCode}_audio`,
                JSON.stringify(audio)
            );
        } catch (e) {
            console.error("Error saving audio state:", e);
        }
    }, [audio, meetingCode]);

    useEffect(() => {
        try {
            sessionStorage.setItem(
                `meeting_${meetingCode}_cameraFacingMode`,
                JSON.stringify(cameraFacingMode)
            );
        } catch (e) {
            console.error("Error saving camera facing mode:", e);
        }
    }, [cameraFacingMode, meetingCode]);

    useEffect(() => {
        audioStateRef.current = audio;
    }, [audio]);

    useEffect(() => {
        videoStateRef.current = video;
    }, [video]);

    const enforceTrackStates = useCallback(() => {
        if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            const videoTracks = localStreamRef.current.getVideoTracks();

            audioTracks.forEach((track) => {
                if (
                    track.label &&
                    !track.label.includes("MediaStreamAudioDestinationNode")
                ) {
                    track.enabled = audioStateRef.current;
                }
            });

            if (!isScreenSharingRef.current) {
                videoTracks.forEach((track) => {
                    if (track.label && !track.label.includes("canvas")) {
                        track.enabled = videoStateRef.current;
                    }
                });
            }
        }
    }, []);

    const createSilentAudioTrack = useCallback(() => {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = oscillator.connect(ctx.createMediaStreamDestination());
        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
    }, []);

    const createBlackVideoTrack = useCallback(
        ({ width = 640, height = 480, fps = 30 } = {}) => {
            const canvas = Object.assign(document.createElement("canvas"), {
                width,
                height,
            });
            const ctx = canvas.getContext("2d");

            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);

            function drawLoop() {
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, width, height);
                requestAnimationFrame(drawLoop);
            }
            drawLoop();

            const stream = canvas.captureStream(fps);
            const track = stream.getVideoTracks()[0];
            track.enabled = true;

            return track;
        },
        []
    );

    const createBlackSilenceStream = useCallback(() => {
        return new MediaStream([
            createBlackVideoTrack(BLACK_VIDEO_DIMS),
            createSilentAudioTrack(),
        ]);
    }, [createBlackVideoTrack, createSilentAudioTrack]);

    const renegotiateWithPeers = useCallback(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));

        const renegotiatePromises = Object.entries(connectionsRef.current).map(
            async ([id, connection]) => {
                if (id === socketIdRef.current) return;

                const currentState = connection.signalingState;

                if (currentState !== "stable") {
                    console.log(
                        `Skipping renegotiation for peer ${id}, state: ${currentState}`
                    );
                    return;
                }

                try {
                    console.log(
                        `Creating offer for peer ${id}, screen sharing: ${isScreenSharingRef.current}`
                    );
                    const description = await connection.createOffer();
                    await connection.setLocalDescription(description);

                    socketRef.current?.emit(
                        "signal",
                        id,
                        JSON.stringify({
                            sdp: connection.localDescription,
                        })
                    );

                    console.log(`Offer sent to peer ${id}`);
                } catch (e) {
                    console.error(`Renegotiation error for peer ${id}:`, e);
                }
            }
        );

        await Promise.all(renegotiatePromises);
        console.log("Renegotiation complete for all peers");
    }, []);

    const replaceStreamForPeers = useCallback(
        async (newStream, options = {}) => {
            console.log("Replacing stream for all peers", options);

            const replacePromises = [];

            for (const [id, peerConnection] of Object.entries(
                connectionsRef.current
            )) {
                if (id === socketIdRef.current) continue;

                const replacePromise = (async () => {
                    try {
                        const senders = peerConnection.getSenders();
                        const videoTrack = newStream.getVideoTracks()[0];
                        const audioTrack = newStream.getAudioTracks()[0];

                        const videoSender = senders.find(
                            (s) => s.track && s.track.kind === "video"
                        );
                        if (videoSender && videoTrack) {
                            console.log(`Replacing video track for peer ${id}`);
                            videoTrack.enabled = isScreenSharingRef.current
                                ? true
                                : videoStateRef.current;
                            await videoSender.replaceTrack(videoTrack);
                            await new Promise((resolve) => setTimeout(resolve, 50));
                        }

                        const audioSender = senders.find(
                            (s) => s.track && s.track.kind === "audio"
                        );
                        if (audioSender && audioTrack) {
                            if (options.skipAudio) {
                                console.log(`Skipping audio track replacement for peer ${id}`);
                            } else if (audioSender.track !== audioTrack) {
                                console.log(`Replacing audio track for peer ${id}`);
                                const shouldBeEnabled = audioStateRef.current;
                                audioTrack.enabled = shouldBeEnabled;
                                await audioSender.replaceTrack(audioTrack);
                                console.log(
                                    `Audio track replaced with state: ${shouldBeEnabled}`
                                );
                            } else {
                                console.log(
                                    `Skipping audio track replacement for peer ${id} (same track)`
                                );
                            }
                        }
                    } catch (e) {
                        console.error(`Error replacing tracks for peer ${id}:`, e);
                    }
                })();

                replacePromises.push(replacePromise);
            }

            await Promise.all(replacePromises);

            await new Promise((resolve) => setTimeout(resolve, 100));

            if (!options.skipRenegotiation) {
                console.log("All tracks replaced, starting renegotiation...");
                await renegotiateWithPeers();
            } else {
                console.log("Skipping renegotiation as requested");
            }

            setTimeout(() => {
                enforceTrackStates();
            }, 150);
        },
        [renegotiateWithPeers, enforceTrackStates]
    );

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((track) => {
                track.stop();
            });
            localStreamRef.current = null;
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }
    }, []);

    const handleTrackEnded = useCallback(async () => {
        if (isScreenSharingRef.current) {
            setScreen(false);
            setVideo(false);
            setAudio(false);
        } else {
            setVideo(false);
            setAudio(false);
        }

        stopLocalStream();
        const blackSilence = createBlackSilenceStream();
        localStreamRef.current = blackSilence;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = blackSilence;
        }
        isScreenSharingRef.current = false;

        await replaceStreamForPeers(blackSilence);
    }, [stopLocalStream, createBlackSilenceStream, replaceStreamForPeers]);

    const getUserMedia = useCallback(async () => {
        if (isGettingUserMediaRef.current) {
            console.log("getUserMedia already in progress, skipping");
            return;
        }

        try {
            isGettingUserMediaRef.current = true;

            let videoStream = null;
            let audioStream = null;

            if (audioAvailable) {
                try {
                    audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });
                    console.log("Audio stream obtained successfully");
                } catch (e) {
                    console.error("Audio stream error:", e);
                }
            }

            if (videoAvailable) {
                try {
                    videoStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: 1280,
                            height: 720,
                            facingMode: cameraFacingMode,
                        },
                        audio: false,
                    });
                    console.log("Video stream obtained successfully");
                } catch (e) {
                    console.error("Video stream error:", e);
                }
            }

            stopLocalStream();

            const combinedStream = new MediaStream();

            if (videoStream && videoStream.getVideoTracks().length > 0) {
                const videoTrack = videoStream.getVideoTracks()[0];
                videoTrack.enabled = videoStateRef.current;
                combinedStream.addTrack(videoTrack);
                videoTrack.onended = handleTrackEnded;
                console.log(
                    "Added real video track with enabled:",
                    videoStateRef.current
                );
            } else {
                const blackVideo = createBlackVideoTrack(BLACK_VIDEO_DIMS);
                blackVideo.enabled = false;
                combinedStream.addTrack(blackVideo);
                console.log("Added black video track");
            }

            if (audioStream && audioStream.getAudioTracks().length > 0) {
                const audioTrack = audioStream.getAudioTracks()[0];
                audioTrack.enabled = audioStateRef.current;
                combinedStream.addTrack(audioTrack);
                persistentAudioTrackRef.current = audioTrack;
                dedicatedAudioStreamRef.current = audioStream;
                audioTrack.onended = handleTrackEnded;
                console.log(
                    "Added real audio track with enabled:",
                    audioStateRef.current
                );
            } else {
                const silentAudio = createSilentAudioTrack();
                silentAudio.enabled = false;
                combinedStream.addTrack(silentAudio);
                console.log("Added silent audio track (no audio permission)");
            }

            localStreamRef.current = combinedStream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = combinedStream;
            }

            isScreenSharingRef.current = false;

            const peerCount = Object.keys(connectionsRef.current).length;
            console.log(
                `Replacing stream for ${peerCount} peer(s) with new getUserMedia stream`
            );

            if (peerCount > 0) {
                await replaceStreamForPeers(combinedStream);
            } else {
                console.log("No peers connected, stream ready for when they join");
            }

            console.log("getUserMedia complete - Final stream tracks:", {
                video: combinedStream.getVideoTracks().length,
                audio: combinedStream.getAudioTracks().length,
                videoEnabled: combinedStream.getVideoTracks()[0]?.enabled,
                audioEnabled: combinedStream.getAudioTracks()[0]?.enabled,
            });
        } catch (e) {
            console.error("getUserMedia error:", e);
        } finally {
            isGettingUserMediaRef.current = false;
        }
    }, [
        videoAvailable,
        audioAvailable,
        cameraFacingMode,
        stopLocalStream,
        createBlackVideoTrack,
        createSilentAudioTrack,
        replaceStreamForPeers,
        handleTrackEnded,
    ]);

    const getDisplayMedia = useCallback(async () => {
        if (screen) {
            const displayMediaAPI =
                navigator.mediaDevices?.getDisplayMedia ||
                navigator.getDisplayMedia ||
                navigator.mediaDevices?.getDisplayMedia;

            if (displayMediaAPI) {
                const getDisplay = displayMediaAPI.bind(
                    navigator.mediaDevices || navigator
                );

                try {
                    isScreenShareOperationRef.current = true;

                    const savedAudioState = audioStateRef.current;
                    let audioTrackToUse = null;

                    if (localStreamRef.current) {
                        const audioTracks = localStreamRef.current.getAudioTracks();
                        if (audioTracks.length > 0) {
                            audioTrackToUse = audioTracks[0];
                            persistentAudioTrackRef.current = audioTrackToUse;
                            console.log("Saved audio track and state:", savedAudioState);
                        }
                    }

                    const stream = await getDisplay({
                        video: {
                            cursor: "always",
                            displaySurface: "monitor",
                            logicalSurface: true,
                            width: { ideal: 1920, max: 1920 },
                            height: { ideal: 1080, max: 1080 },
                        },
                        audio: false,
                    });

                    if (localStreamRef.current) {
                        localStreamRef.current
                            .getVideoTracks()
                            .forEach((track) => track.stop());
                    }

                    const screenVideoTracks = stream.getVideoTracks();
                    screenVideoTracks.forEach((track) => {
                        track.enabled = true;
                        console.log("Screen video track enabled");
                    });

                    if (audioTrackToUse) {
                        stream.addTrack(audioTrackToUse);
                        audioTrackToUse.enabled = savedAudioState;
                        console.log("Audio track preserved with state:", savedAudioState);
                    }

                    localStreamRef.current = stream;
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = stream;
                    }
                    isScreenSharingRef.current = true;

                    const peerCount = Object.keys(connectionsRef.current).length;
                    console.log(`Screen share started, ${peerCount} peer(s) connected`);

                    if (peerCount > 0) {
                        await replaceStreamForPeers(stream, { skipRenegotiation: false });
                    } else {
                        console.log(
                            "No peers yet, screen share will be sent when peers join"
                        );
                    }

                    setTimeout(() => {
                        enforceTrackStates();
                        console.log("Track states enforced after screen share");
                    }, 200);

                    stream.getVideoTracks().forEach((track) => {
                        track.onended = () => {
                            console.log("Screen share ended by user");
                            if (isMountedRef.current) {
                                setScreen(false);
                            }
                        };
                    });
                } catch (e) {
                    console.error("getDisplayMedia error:", e);
                    setScreen(false);
                    isScreenShareOperationRef.current = false;
                }
            } else {
                console.error("Screen sharing not supported");
                setScreen(false);
                setScreenAvailable(false);
                isScreenShareOperationRef.current = false;
            }
        } else {
            isScreenShareOperationRef.current = false;
        }
    }, [screen, replaceStreamForPeers, enforceTrackStates]);

    useEffect(() => {
        if (
            !screen &&
            isScreenSharingRef.current &&
            !isGettingUserMediaRef.current
        ) {
            console.log("Screen share stopped, returning to camera");

            const savedAudioState = audioStateRef.current;
            const savedVideoState = videoStateRef.current;
            console.log(
                "Saving states before returning to camera - audio:",
                savedAudioState,
                "video:",
                savedVideoState
            );

            isScreenSharingRef.current = false;
            isScreenShareOperationRef.current = false;

            setTimeout(() => {
                if (!isGettingUserMediaRef.current) {
                    audioStateRef.current = savedAudioState;
                    videoStateRef.current = savedVideoState;

                    getUserMedia().then(() => {
                        setTimeout(() => {
                            audioStateRef.current = savedAudioState;
                            videoStateRef.current = savedVideoState;
                            enforceTrackStates();
                            console.log("States re-enforced after screen share stop");
                        }, 100);
                    });
                }
            }, 100);
        }
    }, [screen, getUserMedia, enforceTrackStates]);

    const gotMessageFromServer = useCallback(
        (fromId, message) => {
            const signal = JSON.parse(message);

            if (fromId === socketIdRef.current) return;

            const connection = connectionsRef.current[fromId];
            if (!connection) return;

            if (signal.sdp) {
                const desc = new RTCSessionDescription(signal.sdp);
                const currentState = connection.signalingState;

                console.log(
                    `Received SDP ${desc.type} from ${fromId}, current state: ${currentState}`
                );

                if (
                    desc.type === "offer" &&
                    (currentState === "have-local-offer" || currentState === "stable")
                ) {
                    const isPolite = socketIdRef.current < fromId;

                    if (currentState === "have-local-offer" && !isPolite) {
                        console.log(
                            `Ignoring offer from ${fromId} due to glare (we're impolite)`
                        );
                        return;
                    }
                }

                if (desc.type === "answer" && currentState !== "have-local-offer") {
                    console.log(
                        `Ignoring answer from ${fromId}, we're not expecting one (state: ${currentState})`
                    );
                    return;
                }

                connection
                    .setRemoteDescription(desc)
                    .then(() => {
                        if (desc.type === "offer") {
                            return connection
                                .createAnswer()
                                .then((answer) => connection.setLocalDescription(answer))
                                .then(() => {
                                    socketRef.current?.emit(
                                        "signal",
                                        fromId,
                                        JSON.stringify({
                                            sdp: connection.localDescription,
                                        })
                                    );
                                    console.log(`Sent answer to ${fromId}`);
                                });
                        }
                    })
                    .then(() => {
                        enforceTrackStates();
                    })
                    .catch((e) => console.error(`SDP error with ${fromId}:`, e));
            }

            if (signal.ice) {
                connection
                    .addIceCandidate(new RTCIceCandidate(signal.ice))
                    .catch((e) => console.error("ICE candidate error:", e));
            }
        },
        [enforceTrackStates]
    );

    const addMessage = useCallback((data, sender, socketIdSender) => {
        if (!isMountedRef.current) return

        setMessages((prev) => [...prev, { data, sender }])

        // Only increment newMessages if chat is closed AND message is from someone else
        if (!isChatOpenRef.current && socketIdRef.current !== socketIdSender) {
            setNewMessages((prev) => prev + 1)
        }
    }, [])



    const broadcastMediaState = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit("media-state-change", {
                video: video,
                audio: audio,
                screen: screen,
            });
        }
    }, [video, audio, screen]);

    const connectToSocketServer = useCallback(() => {
        const meetingUrl = `${window.location.origin}/previewMeeting/${meetingCode}`;

        socketRef.current = io(server, {
            secure: false,
            transports: ["websocket", "polling"],
        });

        socketRef.current.on("signal", gotMessageFromServer);

        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", meetingUrl, username);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.on("chat-message", addMessage);

            socketRef.current.on("media-state-change", (socketId, mediaState) => {
                if (!isMountedRef.current) return;

                setRemoteUserStates((prev) => ({
                    ...prev,
                    [socketId]: mediaState,
                }));
            });

            socketRef.current.on("user-left", (id) => {
                if (!isMountedRef.current) return;

                setVideos((videos) => videos.filter((video) => video.socketId !== id));

                setRemoteUserStates((prev) => {
                    const newStates = { ...prev };
                    delete newStates[id];
                    return newStates;
                });

                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
            });

            socketRef.current.on(
                "user-joined",
                (id, clients, usernames, existingMediaStates) => {
                    clients.forEach((socketListId) => {
                        if (connectionsRef.current[socketListId]) return;

                        const peerConnection = new RTCPeerConnection(PEER_CONFIG);
                        connectionsRef.current[socketListId] = peerConnection;

                        peerConnection.onicecandidate = (event) => {
                            if (event.candidate) {
                                socketRef.current?.emit(
                                    "signal",
                                    socketListId,
                                    JSON.stringify({
                                        ice: event.candidate,
                                    })
                                );
                            }
                        };

                        peerConnection.ontrack = (event) => {
                            if (socketListId === socketIdRef.current || !isMountedRef.current)
                                return;

                            console.log(
                                `Received track from ${socketListId}:`,
                                event.track.kind,
                                event.track.enabled,
                                event.track.label
                            );

                            event.track.onunmute = () => {
                                console.log(
                                    `Track ${event.track.kind} unmuted for ${socketListId}`
                                );
                                setVideos((videos) => {
                                    const video = videos.find((v) => v.socketId === socketListId);
                                    if (video) {
                                        return videos.map((v) =>
                                            v.socketId === socketListId
                                                ? {
                                                    ...v,
                                                    streamId: event.streams[0].id + "-" + Date.now(),
                                                }
                                                : v
                                        );
                                    }
                                    return videos;
                                });
                            };

                            event.track.onmute = () => {
                                console.log(
                                    `Track ${event.track.kind} muted for ${socketListId}`
                                );
                            };

                            event.track.onended = () => {
                                console.log(
                                    `Track ${event.track.kind} ended for ${socketListId}`
                                );
                            };

                            setVideos((videos) => {
                                const exists = videos.find((v) => v.socketId === socketListId);

                                if (exists) {
                                    console.log(
                                        `Updating stream for existing peer ${socketListId}`
                                    );
                                    return videos.map((v) =>
                                        v.socketId === socketListId
                                            ? {
                                                ...v,
                                                stream: event.streams[0],
                                                username: usernames[socketListId],
                                                streamId: event.streams[0].id + "-" + Date.now(),
                                            }
                                            : v
                                    );
                                } else {
                                    console.log(`Adding new video for peer ${socketListId}`);
                                    return [
                                        ...videos,
                                        {
                                            socketId: socketListId,
                                            stream: event.streams[0],
                                            username: usernames[socketListId],
                                            streamId: event.streams[0].id + "-" + Date.now(),
                                            autoplay: true,
                                            playsinline: true,
                                        },
                                    ];
                                }
                            });
                        };

                        const streamToAdd =
                            localStreamRef.current || createBlackSilenceStream();

                        const videoTracks = streamToAdd.getVideoTracks();
                        const audioTracks = streamToAdd.getAudioTracks();

                        if (videoTracks.length === 0) {
                            console.warn(
                                `No video track, adding black video for peer ${socketListId}`
                            );
                            const blackVideo = createBlackVideoTrack(BLACK_VIDEO_DIMS);
                            blackVideo.enabled = false;
                            streamToAdd.addTrack(blackVideo);
                        }

                        if (audioTracks.length === 0) {
                            console.warn(
                                `No audio track, adding silent audio for peer ${socketListId}`
                            );
                            const silentAudio = createSilentAudioTrack();
                            silentAudio.enabled = false;
                            streamToAdd.addTrack(silentAudio);
                        }

                        streamToAdd.getAudioTracks().forEach((track) => {
                            if (
                                track.label &&
                                !track.label.includes("MediaStreamAudioDestinationNode")
                            ) {
                                track.enabled = audioStateRef.current;
                                console.log(
                                    `Setting audio track enabled to ${audioStateRef.current} for peer ${socketListId}`
                                );
                            }
                        });

                        if (!isScreenSharingRef.current) {
                            streamToAdd.getVideoTracks().forEach((track) => {
                                if (track.label && !track.label.includes("canvas")) {
                                    track.enabled = videoStateRef.current;
                                    console.log(
                                        `Setting video track enabled to ${videoStateRef.current} for peer ${socketListId}`
                                    );
                                }
                            });
                        }

                        console.log(`Adding tracks to peer ${socketListId}:`, {
                            videoTracks: streamToAdd.getVideoTracks().length,
                            audioTracks: streamToAdd.getAudioTracks().length,
                            isScreenShare: isScreenSharingRef.current,
                            videoEnabled: streamToAdd.getVideoTracks()[0]?.enabled,
                            audioEnabled: streamToAdd.getAudioTracks()[0]?.enabled,
                        });

                        streamToAdd.getTracks().forEach((track) => {
                            peerConnection.addTrack(track, streamToAdd);
                        });
                    });

                    if (id === socketIdRef.current && existingMediaStates) {
                        setRemoteUserStates(existingMediaStates);
                    }

                    if (id === socketIdRef.current) {
                        setTimeout(() => {
                            broadcastMediaState();
                        }, 500);

                        Object.entries(connectionsRef.current).forEach(
                            ([id2, connection]) => {
                                if (id2 === socketIdRef.current) return;

                                console.log(
                                    `Creating offer for peer ${id2}, current screen state:`,
                                    isScreenSharingRef.current
                                );

                                connection
                                    .createOffer()
                                    .then((description) =>
                                        connection.setLocalDescription(description)
                                    )
                                    .then(() => {
                                        socketRef.current?.emit(
                                            "signal",
                                            id2,
                                            JSON.stringify({
                                                sdp: connection.localDescription,
                                            })
                                        );
                                        console.log(`Sent offer to ${id2}`);
                                    })
                                    .catch((e) => console.error("Offer error:", e));
                            }
                        );
                    }
                }
            );
        });
    }, [
        username,
        meetingCode,
        gotMessageFromServer,
        addMessage,
        createBlackSilenceStream,
        createBlackVideoTrack,
        createSilentAudioTrack,
        broadcastMediaState,
    ]);

    const cleanupCall = useCallback(() => {
        try {
            stopLocalStream();

            if (dedicatedAudioStreamRef.current) {
                dedicatedAudioStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());
                dedicatedAudioStreamRef.current = null;
            }

            Object.values(connectionsRef.current).forEach((connection) => {
                connection.close();
            });
            connectionsRef.current = {};

            if (socketRef.current) {
                socketRef.current.off();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        } catch (e) {
            console.error("Cleanup error:", e);
        }
    }, [stopLocalStream]);

    useEffect(() => {
        // Redirect to preview if no username
        if (!username || username === "Guest") {
            navigate(`/previewMeeting/${meetingCode}`);
            return;
        }

        const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            );
        const hasScreenShare =
            !isMobile &&
            !!(
                navigator.mediaDevices.getDisplayMedia ||
                navigator.getDisplayMedia ||
                (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
            );
        setScreenAvailable(hasScreenShare);

        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                    const videoDevices = devices.filter(
                        (device) => device.kind === "videoinput"
                    );
                    setHasMultipleCameras(videoDevices.length > 1);
                })
                .catch((e) => console.log("Could not enumerate devices:", e));
        }

        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            cleanupCall();
        };
    }, [username, meetingCode, navigate, cleanupCall]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            cleanupCall();
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [cleanupCall]);

    useEffect(() => {
        if (
            !localStreamRef.current &&
            !isScreenSharingRef.current &&
            !isGettingUserMediaRef.current
        ) {
            console.log("Getting user media for the first time on join");
            getUserMedia().then(() => {
                console.log("Initial getUserMedia complete, stream ready:", {
                    hasStream: !!localStreamRef.current,
                    videoTracks: localStreamRef.current?.getVideoTracks().length,
                    audioTracks: localStreamRef.current?.getAudioTracks().length,
                    videoEnabled: localStreamRef.current?.getVideoTracks()[0]?.enabled,
                    audioEnabled: localStreamRef.current?.getAudioTracks()[0]?.enabled,
                });
                // Connect to socket server after media is ready
                connectToSocketServer();
            });
        }
    }, [getUserMedia, connectToSocketServer]);

    useEffect(() => {
        getDisplayMedia();
    }, [screen, getDisplayMedia]);

    useEffect(() => {
        broadcastMediaState();
    }, [video, audio, screen, broadcastMediaState]);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    useEffect(() => {
        videos.forEach((video) => {
            const videoElement = videoRefs.current[video.socketId];
            const userState = remoteUserStates[video.socketId] || {};

            if (videoElement && video.stream) {
                if (videoElement.srcObject !== video.stream) {
                    console.log(`Updating video element srcObject for ${video.socketId}`);
                    videoElement.srcObject = video.stream;
                    videoElement.play().catch((e) => console.log("Play error:", e));
                } else {
                    const currentTracks = videoElement.srcObject?.getTracks() || [];
                    const newTracks = video.stream?.getTracks() || [];

                    if (currentTracks.length !== newTracks.length) {
                        console.log(
                            `Track count changed for ${video.socketId}, refreshing`
                        );
                        videoElement.srcObject = video.stream;
                        videoElement.play().catch((e) => console.log("Play error:", e));
                    }
                }

                if (userState.video === true || userState.screen === true) {
                    if (videoElement.paused) {
                        console.log(
                            `Video paused but should be playing for ${video.socketId}, playing now`
                        );
                        videoElement.play().catch((e) => console.log("Play error:", e));
                    }
                }
            }
        });
    }, [videos, remoteUserStates]);

    const handleVideo = useCallback(() => {
        if (!screen) {
            setVideo((prev) => {
                const newState = !prev;
                videoStateRef.current = newState;

                if (localStreamRef.current) {
                    const videoTracks = localStreamRef.current.getVideoTracks();
                    videoTracks.forEach((track) => {
                        if (track.label && !track.label.includes("canvas")) {
                            track.enabled = newState;
                            console.log("Video toggled to:", newState, "Track:", track.label);
                        }
                    });
                }

                if (socketRef.current) {
                    socketRef.current.emit("media-state-change", {
                        video: newState,
                        audio: audio,
                        screen: screen,
                    });
                }

                return newState;
            });
        }
    }, [screen, audio]);

    const handleAudio = useCallback(() => {
        setAudio((prev) => {
            const newState = !prev;
            audioStateRef.current = newState;

            if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks();
                audioTracks.forEach((track) => {
                    if (
                        track.label &&
                        !track.label.includes("MediaStreamAudioDestinationNode")
                    ) {
                        track.enabled = newState;
                        console.log("Audio toggled to:", newState, "Track:", track.label);
                    }
                });
            }

            if (socketRef.current) {
                socketRef.current.emit("media-state-change", {
                    video: video,
                    audio: newState,
                    screen: screen,
                });
            }

            return newState;
        });
    }, [video, screen]);

    const handleScreen = useCallback(() => {
        setScreen((prev) => !prev);
    }, []);

    const handleCameraToggle = useCallback(async () => {
        if (screen || isScreenSharingRef.current || !videoAvailable || !video) {
            console.log("Camera toggle blocked");
            return;
        }

        if (isSwitchingCamera || isSwitchingCameraRef.current) {
            console.log("Camera switch already in progress");
            return;
        }

        setIsSwitchingCamera(true);
        isSwitchingCameraRef.current = true;

        const newFacingMode = cameraFacingMode === "user" ? "environment" : "user";
        console.log("Switching camera to:", newFacingMode);

        const savedAudioState = audioStateRef.current;
        console.log("Saved audio state before camera switch:", savedAudioState);

        try {
            let currentAudioTrack = null;
            if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks();
                if (audioTracks.length > 0) {
                    currentAudioTrack = audioTracks[0];
                }
            }

            if (localStreamRef.current) {
                localStreamRef.current
                    .getVideoTracks()
                    .forEach((track) => track.stop());
            }

            const newVideoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 1280,
                    height: 720,
                    facingMode: { exact: newFacingMode },
                },
                audio: false,
            });

            const newVideoTrack = newVideoStream.getVideoTracks()[0];
            newVideoTrack.enabled = true;

            const newStream = new MediaStream([newVideoTrack]);

            if (currentAudioTrack) {
                newStream.addTrack(currentAudioTrack);
                currentAudioTrack.enabled = savedAudioState;
                console.log("Audio track preserved with state:", savedAudioState);
            }

            localStreamRef.current = newStream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = newStream;
            }

            for (const [id, peerConnection] of Object.entries(
                connectionsRef.current
            )) {
                if (id === socketIdRef.current) continue;

                try {
                    const senders = peerConnection.getSenders();
                    const videoSender = senders.find(
                        (s) => s.track && s.track.kind === "video"
                    );

                    if (videoSender && newVideoTrack) {
                        await videoSender.replaceTrack(newVideoTrack);
                        console.log(`Replaced video track for peer ${id}`);
                    }
                } catch (e) {
                    console.error(`Error replacing video for peer ${id}:`, e);
                }
            }

            setCameraFacingMode(newFacingMode);

            setTimeout(() => {
                enforceTrackStates();
                console.log("Track states re-enforced after camera switch");
            }, 150);

            console.log("Camera switched successfully");
        } catch (error) {
            console.error("Camera switch error:", error);

            try {
                let currentAudioTrack = null;
                if (localStreamRef.current) {
                    const audioTracks = localStreamRef.current.getAudioTracks();
                    if (audioTracks.length > 0) {
                        currentAudioTrack = audioTracks[0];
                    }
                }

                if (localStreamRef.current) {
                    localStreamRef.current
                        .getVideoTracks()
                        .forEach((track) => track.stop());
                }

                const newVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 1280,
                        height: 720,
                        facingMode: newFacingMode,
                    },
                    audio: false,
                });

                const newVideoTrack = newVideoStream.getVideoTracks()[0];
                newVideoTrack.enabled = true;

                const newStream = new MediaStream([newVideoTrack]);

                if (currentAudioTrack) {
                    newStream.addTrack(currentAudioTrack);
                    currentAudioTrack.enabled = savedAudioState;
                }

                localStreamRef.current = newStream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = newStream;
                }

                for (const [id, peerConnection] of Object.entries(
                    connectionsRef.current
                )) {
                    if (id === socketIdRef.current) continue;

                    try {
                        const senders = peerConnection.getSenders();
                        const videoSender = senders.find(
                            (s) => s.track && s.track.kind === "video"
                        );

                        if (videoSender && newVideoTrack) {
                            await videoSender.replaceTrack(newVideoTrack);
                        }
                    } catch (e) {
                        console.error(`Error replacing video for peer ${id}:`, e);
                    }
                }

                setCameraFacingMode(newFacingMode);

                setTimeout(() => {
                    enforceTrackStates();
                }, 150);

                console.log("Camera switched (fallback) successfully");
            } catch (fallbackError) {
                console.error("Fallback camera switch failed:", fallbackError);
            }
        } finally {
            setTimeout(() => {
                setIsSwitchingCamera(false);
                isSwitchingCameraRef.current = false;
                enforceTrackStates();
                console.log("Camera switch complete");
            }, 200);
        }
    }, [
        cameraFacingMode,
        screen,
        video,
        videoAvailable,
        isSwitchingCamera,
        enforceTrackStates,
    ]);

    const handleChat = useCallback(() => {
        setShowModal((prev) => {
            const newState = !prev
            isChatOpenRef.current = newState
            if (newState) {
                setNewMessages(0)
            }
            return newState
        })
    }, [])

    // Minimum swipe distance (in px)
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        // If chat is open and user swipes right, close it
        if (showModal && isRightSwipe) {
            setShowModal(false);
            setNewMessages(0);
        }
    };

    const onScreenTouchStart = (e) => {
        // Only trigger on right edge of screen when chat is closed
        if (!showModal && e.targetTouches[0].clientX > window.innerWidth - 50) {
            setTouchEnd(null);
            setTouchStart(e.targetTouches[0].clientX);
        }
    };

    const onScreenTouchMove = (e) => {
        if (touchStart !== null) {
            setTouchEnd(e.targetTouches[0].clientX);
        }
    };

    const onScreenTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;

        // If chat is closed and user swipes left from right edge, open it
        if (!showModal && isLeftSwipe) {
            setShowModal(true);
            setNewMessages(0);
        }

        setTouchStart(null);
        setTouchEnd(null);
    };

    const sendMessage = useCallback(() => {
        if (message.trim() && socketRef.current) {
            socketRef.current.emit("chat-message", message, username);
            setMessage("");
        }
    }, [message, username]);

    const handleEndCall = useCallback(() => {
        try {
            stopLocalStream();

            Object.values(connectionsRef.current).forEach((connection) => {
                connection.close();
            });
            connectionsRef.current = {};

            if (socketRef.current) {
                socketRef.current.emit("leave-call");
                socketRef.current.off();
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            setVideos([]);
            setVideo(false);
            setAudio(false);
            setScreen(false);
            setMessages([]);
            setNewMessages(0);
            setShowModal(false);
            isScreenSharingRef.current = false;
        } catch (e) {
            console.error("End call error:", e);
        } finally {
            navigate("/home");
        }
    }, [navigate, stopLocalStream]);

    const gridLayout = useMemo(() => {
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
    }, [videos.length]);

    useEffect(() => {
        if (localStreamRef.current && !screen && !isGettingUserMediaRef.current) {
            const videoTracks = localStreamRef.current.getVideoTracks();

            videoTracks.forEach((track) => {
                if (track.label && !track.label.includes("canvas")) {
                    const shouldBeEnabled = videoStateRef.current;
                    track.enabled = shouldBeEnabled;
                    console.log(
                        "Video track enabled state enforced to:",
                        shouldBeEnabled
                    );
                }
            });
        }
    }, [video, screen]);

    useEffect(() => {
        if (
            localStreamRef.current &&
            !isSwitchingCamera &&
            !isSwitchingCameraRef.current
        ) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            audioTracks.forEach((track) => {
                if (
                    track.label &&
                    !track.label.includes("MediaStreamAudioDestinationNode")
                ) {
                    const shouldBeEnabled = audioStateRef.current;
                    track.enabled = shouldBeEnabled;
                    console.log(
                        "Audio track enabled state enforced to:",
                        shouldBeEnabled
                    );
                }
            });
        }
    }, [audio, isSwitchingCamera]);

    useEffect(() => {
        if (
            !screen &&
            !isScreenSharingRef.current &&
            !isSwitchingCamera &&
            !isSwitchingCameraRef.current &&
            !isScreenShareOperationRef.current &&
            !isGettingUserMediaRef.current
        ) {
            const shouldGetMedia = videoStateRef.current && videoAvailable;

            if (shouldGetMedia) {
                console.log("Camera facing mode changed, getting new user media");
                getUserMedia();
            }
        }
    }, [
        cameraFacingMode,
        screen,
        isSwitchingCamera,
        getUserMedia,
        videoAvailable,
    ]);

    const handleCopyLink = useCallback(() => {
        const shareableLink = `${window.location.origin}/previewMeeting/${meetingCode}`;
        navigator.clipboard.writeText(shareableLink);
        setShowCopyFeedback(true);
        setTimeout(() => setShowCopyFeedback(false), 2000);
    }, [meetingCode]);

    return (
        <div
            className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden"
            onTouchStart={onScreenTouchStart}
            onTouchMove={onScreenTouchMove}
            onTouchEnd={onScreenTouchEnd}
        >
            <div className="absolute inset-0 bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

            <div className="absolute inset-0 flex items-center justify-center p-2 md:p-4 pb-24 md:pb-28">
                <div
                    className="w-full h-full grid gap-2 md:gap-3"
                    style={{
                        gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
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
                                <p className="text-white text-lg md:text-xl font-semibold">
                                    Waiting for others to join...
                                </p>
                                <p className="text-gray-400 text-xs md:text-sm mt-2">
                                    Share the meeting link
                                </p>
                            </motion.div>
                        </div>
                    ) : (
                        videos.map((video) => {
                            const userState = remoteUserStates[video.socketId] || {};
                            const isVideoOff =
                                userState.video !== true && userState.screen !== true;
                            const isAudioOff = userState.audio === false;
                            const isScreenSharing = userState.screen === true;

                            return (
                                <div
                                    key={`${video.socketId}-${video.streamId}`}
                                    className="relative rounded-lg md:rounded-xl overflow-hidden bg-gray-900 border border-white/10"
                                >
                                    <video
                                        key={`${video.socketId}-${video.streamId}`}
                                        ref={(ref) => {
                                            if (ref) {
                                                videoRefs.current[video.socketId] = ref;
                                                if (video.stream && ref.srcObject !== video.stream) {
                                                    console.log(
                                                        `Setting srcObject for ${video.socketId} in render`
                                                    );
                                                    ref.srcObject = video.stream;
                                                    ref
                                                        .play()
                                                        .catch((e) => console.log("Play error:", e));
                                                }
                                            }
                                        }}
                                        autoPlay
                                        playsInline
                                        muted={false}
                                        className={`w-full h-full object-contain bg-black transition-opacity duration-300 ${isVideoOff ? "opacity-0" : "opacity-100"
                                            }`}
                                        style={{ display: isVideoOff ? "none" : "block" }}
                                    />
                                    {isVideoOff && (
                                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center">
                                            <VideoOff
                                                size={24}
                                                className="text-white/70 md:w-8 md:h-8"
                                            />
                                            <p className="text-white/70 text-xs md:text-sm mt-2">
                                                Camera Off
                                            </p>
                                        </div>
                                    )}
                                    <div className="absolute top-2 left-2 flex items-center gap-2">
                                        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
                                            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-base md:text-lg">
                                                {video.username?.charAt(0).toUpperCase() || "U"}
                                            </div>
                                            <span className="text-white font-semibold text-sm md:text-base truncate max-w-[120px]">
                                                {video.username || "Unknown"}
                                            </span>
                                        </div>

                                        {isScreenSharing && (
                                            <div className="px-2 py-1 bg-green-500/90 rounded-full backdrop-blur-sm flex items-center gap-1">
                                                <MonitorUp size={12} className="text-white" />
                                                <span className="text-white text-xs font-medium">
                                                    Sharing
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {isAudioOff && (
                                        <div className="absolute top-2 right-2 bg-red-500/90 p-1.5 rounded-full backdrop-blur-sm">
                                            <MicOff size={14} className="text-white" />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <motion.div className="fixed bottom-20 md:bottom-24 right-2 md:right-4 w-28 h-20 sm:w-36 sm:h-28 md:w-48 md:h-36 rounded-lg md:rounded-xl overflow-hidden border-2 border-orange-500 shadow-2xl z-30 bg-black">
                <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain bg-black"
                    style={{ transform: screen ? "none" : "scaleX(-1)" }}
                />
                {!video && !screen && (
                    <div className="absolute inset-0 bg-black flex items-center justify-center">
                        <VideoOff size={24} className="text-white" />
                    </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 text-center text-xs text-white font-semibold truncate">
                    {username} (You) {screen && "- Sharing"}
                </div>
                {!audio && (
                    <div className="absolute top-1 right-1 bg-red-500/90 p-1.5 rounded-full backdrop-blur-sm">
                        <MicOff size={10} className="text-white md:w-3 md:h-3" />
                    </div>
                )}
            </motion.div>

            <motion.div className="fixed bottom-3 left-1/2 transform -translate-x-1/2 backdrop-blur-xl bg-white/10 border border-white/20 rounded-full shadow-2xl px-3 md:px-6 py-2.5 md:py-3.5 flex items-center gap-2 md:gap-3 z-40">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleVideo}
                    disabled={screen || !videoAvailable}
                    className={`p-2.5 md:p-3.5 rounded-full transition-all ${screen || !videoAvailable
                        ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                        : video
                            ? "bg-gray-200 text-black hover:bg-gray-300"
                            : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}
                    title={
                        !videoAvailable
                            ? "Camera not available"
                            : screen
                                ? "Stop screen sharing first"
                                : video
                                    ? "Turn off camera"
                                    : "Turn on camera"
                    }
                >
                    {video ? (
                        <Video size={18} className="md:w-5 md:h-5" />
                    ) : (
                        <VideoOff size={18} className="md:w-5 md:h-5" />
                    )}
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAudio}
                    disabled={!audioAvailable}
                    className={`p-2.5 md:p-3.5 rounded-full transition-all ${!audioAvailable
                        ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                        : audio
                            ? "bg-gray-200 text-black hover:bg-gray-300"
                            : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}
                    title={
                        !audioAvailable
                            ? "Microphone not available"
                            : audio
                                ? "Mute"
                                : "Unmute"
                    }
                >
                    {audio ? (
                        <Mic size={18} className="md:w-5 md:h-5" />
                    ) : (
                        <MicOff size={18} className="md:w-5 md:h-5" />
                    )}
                </motion.button>

                {hasMultipleCameras && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCameraToggle}
                        disabled={screen || !videoAvailable || isSwitchingCamera}
                        className={`p-2.5 md:p-3.5 rounded-full transition-all ${screen || !videoAvailable || isSwitchingCamera
                            ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                            : "bg-gray-200 text-black hover:bg-gray-300"
                            }`}
                        title={
                            !videoAvailable
                                ? "Camera not available"
                                : screen
                                    ? "Stop screen sharing first"
                                    : isSwitchingCamera
                                        ? "Switching..."
                                        : `Switch to ${cameraFacingMode === "user" ? "back" : "front"
                                        } camera`
                        }
                    >
                        <SwitchCamera size={18} className="md:w-5 md:h-5" />
                    </motion.button>
                )}

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleScreen}
                    disabled={!screenAvailable}
                    className={`p-2.5 md:p-3.5 rounded-full transition-all ${!screenAvailable
                        ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                        : screen
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : "bg-gray-200 text-black hover:bg-gray-300"
                        }`}
                    title={
                        screenAvailable
                            ? screen
                                ? "Stop sharing"
                                : "Share screen"
                            : "Screen sharing not available"
                    }
                >
                    {screen ? (
                        <MonitorUp size={18} className="md:w-5 md:h-5" />
                    ) : (
                        <MonitorStop size={18} className="md:w-5 md:h-5" />
                    )}
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopyLink}
                    className="relative p-2.5 md:p-3.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/30"
                    title="Copy meeting link"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-[18px] h-[18px] md:w-5 md:h-5"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                        />
                    </svg>
                    <AnimatePresence>
                        {showCopyFeedback && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.8 }}
                                className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg whitespace-nowrap"
                            >
                                Link Copied! ✓
                                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-green-500"></div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.button>

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
                            {newMessages > 9 ? "9+" : newMessages}
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
                    <>
                        {/* Backdrop for mobile */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleChat}
                            className="fixed inset-0 bg-black/50 z-40 md:hidden"
                        />

                        {/* Chat Panel */}
                        <motion.div
                            ref={chatPanelRef}
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                            className="fixed top-0 right-0 h-full w-full md:w-96 bg-white shadow-2xl z-50 flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                                <div className="flex items-center gap-3">
                                    <MessageSquare size={24} />
                                    <h3 className="text-xl font-bold">Chat</h3>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleChat}
                                    className="p-2 rounded-full hover:bg-white/20 transition-colors"
                                >
                                    <X size={24} />
                                </motion.button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                                            <MessageSquare size={40} className="text-orange-500" />
                                        </div>
                                        <p className="text-gray-400 text-sm">No messages yet</p>
                                        <p className="text-gray-300 text-xs mt-1">
                                            Start the conversation!
                                        </p>
                                    </div>
                                ) : (
                                    messages.map((msg, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{
                                                opacity: 0,
                                                x: msg.sender === username ? 20 : -20,
                                            }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className={`flex ${msg.sender === username
                                                ? "justify-end"
                                                : "justify-start"
                                                }`}
                                        >
                                            {msg.sender !== username && (
                                                <div className="flex-shrink-0 mr-2">
                                                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                        {msg.sender?.charAt(0).toUpperCase() || "U"}
                                                    </div>
                                                </div>
                                            )}
                                            <div
                                                className={`max-w-[80%] ${msg.sender === username
                                                    ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30"
                                                    : "bg-white text-gray-800 border border-gray-200"
                                                    } px-4 py-2.5 rounded-2xl ${msg.sender === username
                                                        ? "rounded-tr-sm"
                                                        : "rounded-tl-sm"
                                                    }`}
                                            >
                                                {msg.sender !== username && (
                                                    <p className="text-xs font-semibold mb-1 text-gray-600">
                                                        {msg.sender}
                                                    </p>
                                                )}
                                                <p className="text-sm break-words leading-relaxed whitespace-pre-wrap">{msg.data}</p>
                                            </div>
                                            {msg.sender === username && (
                                                <div className="flex-shrink-0 ml-2">
                                                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                        {msg.sender?.charAt(0).toUpperCase() || "Y"}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Input */}
                            <div className="px-4 py-4 border-t border-gray-200 bg-white">
                                <div className="flex items-end gap-2">
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                sendMessage();
                                            }
                                        }}
                                        placeholder="Type a message..."
                                        rows={1}
                                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 border-none focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm placeholder-gray-400 resize-none max-h-32 overflow-y-auto scrollbar-hide"
                                        style={{
                                            minHeight: "44px",
                                            height: "auto",
                                            scrollbarWidth: "none",
                                            msOverflowStyle: "none",
                                        }}
                                        onInput={(e) => {
                                            e.target.style.height = "44px";
                                            e.target.style.height =
                                                Math.min(e.target.scrollHeight, 128) + "px";
                                        }}
                                    />
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={sendMessage}
                                        disabled={!message.trim()}
                                        className="p-3 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none mb-0.5"
                                    >
                                        <Send size={18} />
                                    </motion.button>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Press Enter to send, Shift+Enter for new line
                                </p>

                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
