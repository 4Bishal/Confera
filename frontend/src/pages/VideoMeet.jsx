import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { io } from "socket.io-client"
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
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router"
import server from "../environment"

const PEER_CONFIG = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    iceCandidatePoolSize: 10,
}

const BLACK_VIDEO_DIMS = { width: 640, height: 480 }

export const VideoMeet = () => {
    const navigate = useNavigate()
    const socketRef = useRef()
    const socketIdRef = useRef()
    const localVideoRef = useRef()
    const previewVideoRef = useRef()
    const connectionsRef = useRef({})
    const isMountedRef = useRef(true)
    const isScreenSharingRef = useRef(false)
    const localStreamRef = useRef(null)
    const previewStreamRef = useRef(null)
    const persistentAudioTrackRef = useRef(null)
    const chatEndRef = useRef()
    const audioStateRef = useRef(true)
    const videoStateRef = useRef(true)
    const isGettingUserMediaRef = useRef(false)
    const dedicatedAudioStreamRef = useRef(null)

    const [videoAvailable, setVideoAvailable] = useState(true)
    const [audioAvailable, setAudioAvailable] = useState(true)
    const [video, setVideo] = useState(true)
    const [audio, setAudio] = useState(true)
    const [previewVideo, setPreviewVideo] = useState(true)
    const [previewAudio, setPreviewAudio] = useState(true)
    const [screen, setScreen] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [screenAvailable, setScreenAvailable] = useState(true)
    const [message, setMessage] = useState("")
    const [messages, setMessages] = useState([])
    const [newMessages, setNewMessages] = useState(0)
    const [askForUsername, setAskForUsername] = useState(true)
    const [username, setUsername] = useState("")
    const [videos, setVideos] = useState([])
    const [remoteUserStates, setRemoteUserStates] = useState({})
    const [showCopyFeedback, setShowCopyFeedback] = useState(false)
    const [cameraFacingMode, setCameraFacingMode] = useState("user")
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
    const videoRefs = useRef({})
    const isSwitchingCameraRef = useRef(false)
    const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
    const isScreenShareOperationRef = useRef(false)

    useEffect(() => {
        audioStateRef.current = audio
    }, [audio])

    useEffect(() => {
        videoStateRef.current = video
    }, [video])

    const enforceTrackStates = useCallback(() => {
        if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks()
            const videoTracks = localStreamRef.current.getVideoTracks()

            audioTracks.forEach((track) => {
                if (track.label && !track.label.includes("MediaStreamAudioDestinationNode")) {
                    track.enabled = audioStateRef.current
                }
            })

            if (!isScreenSharingRef.current) {
                videoTracks.forEach((track) => {
                    if (track.label && !track.label.includes("canvas")) {
                        track.enabled = videoStateRef.current
                    }
                })
            }
        }
    }, [])

    const createSilentAudioTrack = useCallback(() => {
        const ctx = new AudioContext()
        const oscillator = ctx.createOscillator()
        const dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }, [])

    const createBlackVideoTrack = useCallback(({ width = 640, height = 480 } = {}) => {
        const canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext("2d").fillRect(0, 0, width, height)
        const stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }, [])

    const createBlackSilenceStream = useCallback(() => {
        return new MediaStream([createBlackVideoTrack(BLACK_VIDEO_DIMS), createSilentAudioTrack()])
    }, [createBlackVideoTrack, createSilentAudioTrack])

    const renegotiateWithPeers = useCallback(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))

        const renegotiatePromises = Object.entries(connectionsRef.current).map(async ([id, connection]) => {
            if (id === socketIdRef.current) return

            const currentState = connection.signalingState

            if (currentState !== "stable") {
                console.log(`Skipping renegotiation for peer ${id}, state: ${currentState}`)
                return
            }

            try {
                console.log(`Creating offer for peer ${id}, screen sharing: ${isScreenSharingRef.current}`)
                const description = await connection.createOffer()
                await connection.setLocalDescription(description)

                socketRef.current?.emit(
                    "signal",
                    id,
                    JSON.stringify({
                        sdp: connection.localDescription,
                    }),
                )

                console.log(`Offer sent to peer ${id}`)
            } catch (e) {
                console.error(`Renegotiation error for peer ${id}:`, e)
            }
        })

        await Promise.all(renegotiatePromises)
        console.log("Renegotiation complete for all peers")
    }, [])

    const replaceStreamForPeers = useCallback(
        async (newStream, options = {}) => {
            console.log("Replacing stream for all peers", options)

            const replacePromises = []

            for (const [id, peerConnection] of Object.entries(connectionsRef.current)) {
                if (id === socketIdRef.current) continue

                const replacePromise = (async () => {
                    try {
                        const senders = peerConnection.getSenders()
                        const videoTrack = newStream.getVideoTracks()[0]
                        const audioTrack = newStream.getAudioTracks()[0]

                        const videoSender = senders.find((s) => s.track && s.track.kind === "video")
                        if (videoSender && videoTrack) {
                            console.log(`Replacing video track for peer ${id}`)
                            videoTrack.enabled = isScreenSharingRef.current ? true : videoStateRef.current
                            await videoSender.replaceTrack(videoTrack)
                            await new Promise((resolve) => setTimeout(resolve, 50))
                        }

                        const audioSender = senders.find((s) => s.track && s.track.kind === "audio")
                        if (audioSender && audioTrack) {
                            if (options.skipAudio) {
                                console.log(`Skipping audio track replacement for peer ${id}`)
                            } else if (audioSender.track !== audioTrack) {
                                console.log(`Replacing audio track for peer ${id}`)
                                const shouldBeEnabled = audioStateRef.current
                                audioTrack.enabled = shouldBeEnabled
                                await audioSender.replaceTrack(audioTrack)
                                console.log(`Audio track replaced with state: ${shouldBeEnabled}`)
                            } else {
                                console.log(`Skipping audio track replacement for peer ${id} (same track)`)
                            }
                        }
                    } catch (e) {
                        console.error(`Error replacing tracks for peer ${id}:`, e)
                    }
                })()

                replacePromises.push(replacePromise)
            }

            await Promise.all(replacePromises)

            await new Promise((resolve) => setTimeout(resolve, 100))

            if (!options.skipRenegotiation) {
                console.log("All tracks replaced, starting renegotiation...")
                await renegotiateWithPeers()
            } else {
                console.log("Skipping renegotiation as requested")
            }

            setTimeout(() => {
                enforceTrackStates()
            }, 150)
        },
        [renegotiateWithPeers, enforceTrackStates],
    )

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((track) => {
                track.stop()
            })
            localStreamRef.current = null
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null
        }
    }, [])

    const stopPreviewStream = useCallback(() => {
        if (previewStreamRef.current) {
            previewStreamRef.current.getTracks().forEach((track) => {
                track.stop()
            })
            previewStreamRef.current = null
        }
        if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = null
        }
    }, [])

    const handleTrackEnded = useCallback(async () => {
        if (isScreenSharingRef.current) {
            setScreen(false)
            setVideo(false)
            setAudio(false)
        } else {
            setVideo(false)
            setAudio(false)
        }

        stopLocalStream()
        const blackSilence = createBlackSilenceStream()
        localStreamRef.current = blackSilence
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = blackSilence
        }
        isScreenSharingRef.current = false

        await replaceStreamForPeers(blackSilence)
    }, [stopLocalStream, createBlackSilenceStream, replaceStreamForPeers])

    const getPreviewMedia = useCallback(async () => {
        try {
            const constraints = {
                video: videoAvailable && previewVideo ? {
                    width: 1280,
                    height: 720,
                    facingMode: cameraFacingMode,
                } : false,
                audio: audioAvailable && previewAudio ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                } : false
            }

            if (!constraints.video && !constraints.audio) {
                stopPreviewStream()
                return
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints)

            if (stream.getVideoTracks().length > 0) {
                stream.getVideoTracks()[0].enabled = previewVideo
            }
            if (stream.getAudioTracks().length > 0) {
                stream.getAudioTracks()[0].enabled = false // Mute preview audio to avoid feedback
            }

            previewStreamRef.current = stream
            if (previewVideoRef.current) {
                previewVideoRef.current.srcObject = stream
            }
        } catch (e) {
            console.error("Preview media error:", e)
        }
    }, [videoAvailable, audioAvailable, previewVideo, previewAudio, cameraFacingMode, stopPreviewStream])

    const getUserMedia = useCallback(async () => {
        if (isGettingUserMediaRef.current) {
            console.log("getUserMedia already in progress, skipping")
            return
        }

        try {
            isGettingUserMediaRef.current = true

            let videoStream = null
            let audioStream = null

            // ALWAYS request audio if available (we'll control it with enabled state)
            if (audioAvailable) {
                try {
                    audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false
                    })
                    console.log("Audio stream obtained successfully")
                } catch (e) {
                    console.error("Audio stream error:", e)
                }
            }

            // ALWAYS request video if available (we'll control it with enabled state)
            if (videoAvailable) {
                try {
                    videoStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: 1280,
                            height: 720,
                            facingMode: cameraFacingMode,
                        },
                        audio: false
                    })
                    console.log("Video stream obtained successfully")
                } catch (e) {
                    console.error("Video stream error:", e)
                }
            }

            stopLocalStream()

            const combinedStream = new MediaStream()

            // Add video track (real or black)
            if (videoStream && videoStream.getVideoTracks().length > 0) {
                const videoTrack = videoStream.getVideoTracks()[0]
                videoTrack.enabled = videoStateRef.current
                combinedStream.addTrack(videoTrack)
                videoTrack.onended = handleTrackEnded
                console.log("Added real video track with enabled:", videoStateRef.current)
            } else {
                const blackVideo = createBlackVideoTrack(BLACK_VIDEO_DIMS)
                blackVideo.enabled = false
                combinedStream.addTrack(blackVideo)
                console.log("Added black video track")
            }

            // Add audio track (real or silent)
            if (audioStream && audioStream.getAudioTracks().length > 0) {
                const audioTrack = audioStream.getAudioTracks()[0]
                audioTrack.enabled = audioStateRef.current
                combinedStream.addTrack(audioTrack)
                persistentAudioTrackRef.current = audioTrack
                dedicatedAudioStreamRef.current = audioStream
                audioTrack.onended = handleTrackEnded
                console.log("Added real audio track with enabled:", audioStateRef.current)
            } else {
                const silentAudio = createSilentAudioTrack()
                silentAudio.enabled = false
                combinedStream.addTrack(silentAudio)
                console.log("Added silent audio track (no audio permission)")
            }

            localStreamRef.current = combinedStream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = combinedStream
            }

            isScreenSharingRef.current = false

            const peerCount = Object.keys(connectionsRef.current).length
            console.log(`Replacing stream for ${peerCount} peer(s) with new getUserMedia stream`)

            if (peerCount > 0) {
                await replaceStreamForPeers(combinedStream)
            } else {
                console.log("No peers connected, stream ready for when they join")
            }

            console.log("getUserMedia complete - Final stream tracks:", {
                video: combinedStream.getVideoTracks().length,
                audio: combinedStream.getAudioTracks().length,
                videoEnabled: combinedStream.getVideoTracks()[0]?.enabled,
                audioEnabled: combinedStream.getAudioTracks()[0]?.enabled
            })
        } catch (e) {
            console.error("getUserMedia error:", e)
        } finally {
            isGettingUserMediaRef.current = false
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
    ])

    const getDisplayMedia = useCallback(async () => {
        if (screen) {
            const displayMediaAPI =
                navigator.mediaDevices?.getDisplayMedia || navigator.getDisplayMedia || navigator.mediaDevices?.getDisplayMedia

            if (displayMediaAPI) {
                const getDisplay = displayMediaAPI.bind(navigator.mediaDevices || navigator)

                try {
                    isScreenShareOperationRef.current = true

                    const savedAudioState = audioStateRef.current
                    let audioTrackToUse = null

                    if (localStreamRef.current) {
                        const audioTracks = localStreamRef.current.getAudioTracks()
                        if (audioTracks.length > 0) {
                            audioTrackToUse = audioTracks[0]
                            persistentAudioTrackRef.current = audioTrackToUse
                            console.log("Saved audio track and state:", savedAudioState)
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
                    })

                    if (localStreamRef.current) {
                        localStreamRef.current.getVideoTracks().forEach((track) => track.stop())
                    }

                    const screenVideoTracks = stream.getVideoTracks()
                    screenVideoTracks.forEach((track) => {
                        track.enabled = true
                        console.log("Screen video track enabled")
                    })

                    if (audioTrackToUse) {
                        stream.addTrack(audioTrackToUse)
                        audioTrackToUse.enabled = savedAudioState
                        console.log("Audio track preserved with state:", savedAudioState)
                    }

                    localStreamRef.current = stream
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = stream
                    }
                    isScreenSharingRef.current = true

                    const peerCount = Object.keys(connectionsRef.current).length
                    console.log(`Screen share started, ${peerCount} peer(s) connected`)

                    if (peerCount > 0) {
                        await replaceStreamForPeers(stream, { skipRenegotiation: false })
                    } else {
                        console.log("No peers yet, screen share will be sent when peers join")
                    }

                    setTimeout(() => {
                        enforceTrackStates()
                        console.log("Track states enforced after screen share")
                    }, 200)

                    stream.getVideoTracks().forEach((track) => {
                        track.onended = () => {
                            console.log("Screen share ended by user")
                            if (isMountedRef.current) {
                                setScreen(false)
                            }
                        }
                    })
                } catch (e) {
                    console.error("getDisplayMedia error:", e)
                    setScreen(false)
                    isScreenShareOperationRef.current = false
                }
            } else {
                console.error("Screen sharing not supported")
                setScreen(false)
                setScreenAvailable(false)
                isScreenShareOperationRef.current = false
            }
        } else {
            isScreenShareOperationRef.current = false
        }
    }, [screen, replaceStreamForPeers, enforceTrackStates])

    useEffect(() => {
        if (!screen && isScreenSharingRef.current && !askForUsername && !isGettingUserMediaRef.current) {
            console.log("Screen share stopped, returning to camera")

            const savedAudioState = audioStateRef.current
            const savedVideoState = videoStateRef.current
            console.log("Saving states before returning to camera - audio:", savedAudioState, "video:", savedVideoState)

            isScreenSharingRef.current = false
            isScreenShareOperationRef.current = false

            setTimeout(() => {
                if (!isGettingUserMediaRef.current) {
                    audioStateRef.current = savedAudioState
                    videoStateRef.current = savedVideoState

                    getUserMedia().then(() => {
                        setTimeout(() => {
                            audioStateRef.current = savedAudioState
                            videoStateRef.current = savedVideoState
                            enforceTrackStates()
                            console.log("States re-enforced after screen share stop")
                        }, 100)
                    })
                }
            }, 100)
        }
    }, [screen, askForUsername, getUserMedia, enforceTrackStates])

    const gotMessageFromServer = useCallback(
        (fromId, message) => {
            const signal = JSON.parse(message)

            if (fromId === socketIdRef.current) return

            const connection = connectionsRef.current[fromId]
            if (!connection) return

            if (signal.sdp) {
                const desc = new RTCSessionDescription(signal.sdp)
                const currentState = connection.signalingState

                console.log(`Received SDP ${desc.type} from ${fromId}, current state: ${currentState}`)

                if (desc.type === "offer" && (currentState === "have-local-offer" || currentState === "stable")) {
                    const isPolite = socketIdRef.current < fromId

                    if (currentState === "have-local-offer" && !isPolite) {
                        console.log(`Ignoring offer from ${fromId} due to glare (we're impolite)`)
                        return
                    }
                }

                if (desc.type === "answer" && currentState !== "have-local-offer") {
                    console.log(`Ignoring answer from ${fromId}, we're not expecting one (state: ${currentState})`)
                    return
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
                                        }),
                                    )
                                    console.log(`Sent answer to ${fromId}`)
                                })
                        }
                    })
                    .then(() => {
                        enforceTrackStates()
                    })
                    .catch((e) => console.error(`SDP error with ${fromId}:`, e))
            }

            if (signal.ice) {
                connection
                    .addIceCandidate(new RTCIceCandidate(signal.ice))
                    .catch((e) => console.error("ICE candidate error:", e))
            }
        },
        [enforceTrackStates],
    )

    const addMessage = useCallback((data, sender, socketIdSender) => {
        if (!isMountedRef.current) return

        setMessages((prev) => [...prev, { data, sender }])

        if (socketIdRef.current !== socketIdSender) {
            setNewMessages((prev) => prev + 1)
        }
    }, [])

    const broadcastMediaState = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit("media-state-change", {
                video: video,
                audio: audio,
                screen: screen,
            })
        }
    }, [video, audio, screen])

    const connectToSocketServer = useCallback(() => {
        socketRef.current = io(server, {
            secure: false,
            transports: ["websocket", "polling"],
        })

        socketRef.current.on("signal", gotMessageFromServer)

        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", window.location.href, username)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on("chat-message", addMessage)

            socketRef.current.on("media-state-change", (socketId, mediaState) => {
                if (!isMountedRef.current) return

                setRemoteUserStates((prev) => ({
                    ...prev,
                    [socketId]: mediaState,
                }))
            })

            socketRef.current.on("user-left", (id) => {
                if (!isMountedRef.current) return

                setVideos((videos) => videos.filter((video) => video.socketId !== id))

                setRemoteUserStates((prev) => {
                    const newStates = { ...prev }
                    delete newStates[id]
                    return newStates
                })

                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close()
                    delete connectionsRef.current[id]
                }
            })

            socketRef.current.on("user-joined", (id, clients, usernames, existingMediaStates) => {
                clients.forEach((socketListId) => {
                    if (connectionsRef.current[socketListId]) return

                    const peerConnection = new RTCPeerConnection(PEER_CONFIG)
                    connectionsRef.current[socketListId] = peerConnection

                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current?.emit(
                                "signal",
                                socketListId,
                                JSON.stringify({
                                    ice: event.candidate,
                                }),
                            )
                        }
                    }

                    peerConnection.ontrack = (event) => {
                        if (socketListId === socketIdRef.current || !isMountedRef.current) return

                        console.log(`Received track from ${socketListId}:`, event.track.kind, event.track.enabled, event.track.label)

                        event.track.onunmute = () => {
                            console.log(`Track ${event.track.kind} unmuted for ${socketListId}`)
                            setVideos((videos) => {
                                const video = videos.find((v) => v.socketId === socketListId)
                                if (video) {
                                    return videos.map((v) =>
                                        v.socketId === socketListId ? { ...v, streamId: event.streams[0].id + "-" + Date.now() } : v,
                                    )
                                }
                                return videos
                            })
                        }

                        event.track.onmute = () => {
                            console.log(`Track ${event.track.kind} muted for ${socketListId}`)
                        }

                        event.track.onended = () => {
                            console.log(`Track ${event.track.kind} ended for ${socketListId}`)
                        }

                        setVideos((videos) => {
                            const exists = videos.find((v) => v.socketId === socketListId)

                            if (exists) {
                                console.log(`Updating stream for existing peer ${socketListId}`)
                                return videos.map((v) =>
                                    v.socketId === socketListId
                                        ? {
                                            ...v,
                                            stream: event.streams[0],
                                            username: usernames[socketListId],
                                            streamId: event.streams[0].id + "-" + Date.now(),
                                        }
                                        : v,
                                )
                            } else {
                                console.log(`Adding new video for peer ${socketListId}`)
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
                                ]
                            }
                        })
                    }

                    const streamToAdd = localStreamRef.current || createBlackSilenceStream()

                    const videoTracks = streamToAdd.getVideoTracks()
                    const audioTracks = streamToAdd.getAudioTracks()

                    if (videoTracks.length === 0) {
                        console.warn(`No video track, adding black video for peer ${socketListId}`)
                        const blackVideo = createBlackVideoTrack(BLACK_VIDEO_DIMS)
                        blackVideo.enabled = false
                        streamToAdd.addTrack(blackVideo)
                    }

                    if (audioTracks.length === 0) {
                        console.warn(`No audio track, adding silent audio for peer ${socketListId}`)
                        const silentAudio = createSilentAudioTrack()
                        silentAudio.enabled = false
                        streamToAdd.addTrack(silentAudio)
                    }

                    streamToAdd.getAudioTracks().forEach((track) => {
                        if (track.label && !track.label.includes("MediaStreamAudioDestinationNode")) {
                            track.enabled = audioStateRef.current
                            console.log(`Setting audio track enabled to ${audioStateRef.current} for peer ${socketListId}`)
                        }
                    })

                    if (!isScreenSharingRef.current) {
                        streamToAdd.getVideoTracks().forEach((track) => {
                            if (track.label && !track.label.includes("canvas")) {
                                track.enabled = videoStateRef.current
                                console.log(`Setting video track enabled to ${videoStateRef.current} for peer ${socketListId}`)
                            }
                        })
                    }

                    console.log(`Adding tracks to peer ${socketListId}:`, {
                        videoTracks: streamToAdd.getVideoTracks().length,
                        audioTracks: streamToAdd.getAudioTracks().length,
                        isScreenShare: isScreenSharingRef.current,
                        videoEnabled: streamToAdd.getVideoTracks()[0]?.enabled,
                        audioEnabled: streamToAdd.getAudioTracks()[0]?.enabled
                    })

                    streamToAdd.getTracks().forEach((track) => {
                        peerConnection.addTrack(track, streamToAdd)
                    })
                })

                if (id === socketIdRef.current && existingMediaStates) {
                    setRemoteUserStates(existingMediaStates)
                }

                if (id === socketIdRef.current) {
                    setTimeout(() => {
                        broadcastMediaState()
                    }, 500)

                    Object.entries(connectionsRef.current).forEach(([id2, connection]) => {
                        if (id2 === socketIdRef.current) return

                        console.log(`Creating offer for peer ${id2}, current screen state:`, isScreenSharingRef.current)

                        connection
                            .createOffer()
                            .then((description) => connection.setLocalDescription(description))
                            .then(() => {
                                socketRef.current?.emit(
                                    "signal",
                                    id2,
                                    JSON.stringify({
                                        sdp: connection.localDescription,
                                    }),
                                )
                                console.log(`Sent offer to ${id2}`)
                            })
                            .catch((e) => console.error("Offer error:", e))
                    })
                }
            })
        })
    }, [username, gotMessageFromServer, addMessage, createBlackSilenceStream, createBlackVideoTrack, createSilentAudioTrack, broadcastMediaState])

    const cleanupCall = useCallback(() => {
        try {
            stopLocalStream()

            if (dedicatedAudioStreamRef.current) {
                dedicatedAudioStreamRef.current.getTracks().forEach(track => track.stop())
                dedicatedAudioStreamRef.current = null
            }

            Object.values(connectionsRef.current).forEach((connection) => {
                connection.close()
            })
            connectionsRef.current = {}

            if (socketRef.current) {
                socketRef.current.off()
                socketRef.current.disconnect()
                socketRef.current = null
            }
        } catch (e) {
            console.error("Cleanup error:", e)
        }
    }, [stopLocalStream])

    const getPermissions = useCallback(async () => {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
            setVideoAvailable(true)
            videoStream.getTracks().forEach((track) => track.stop())
            console.log("Video permission granted")
        } catch (error) {
            console.log("Video permission denied or not available:", error.name)
            setVideoAvailable(false)
        }

        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            setAudioAvailable(true)
            audioStream.getTracks().forEach((track) => track.stop())
            console.log("Audio permission granted")
        } catch (error) {
            console.log("Audio permission denied or not available:", error.name)
            setAudioAvailable(false)
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

        const hasScreenShare =
            !isMobile &&
            !!(
                navigator.mediaDevices.getDisplayMedia ||
                navigator.getDisplayMedia ||
                (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
            )

        setScreenAvailable(hasScreenShare)

        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices()
                const videoDevices = devices.filter((device) => device.kind === "videoinput")
                setHasMultipleCameras(videoDevices.length > 1)
                console.log(`Found ${videoDevices.length} camera(s)`)
            } catch (e) {
                console.log("Could not enumerate devices:", e)
                setHasMultipleCameras(false)
            }
        }

        if (isMobile) {
            console.log("Mobile device detected - screen sharing disabled")
        }
    }, [])

    useEffect(() => {
        getPermissions()
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
            cleanupCall()
            stopPreviewStream()
        }
    }, [getPermissions, cleanupCall, stopPreviewStream])

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!askForUsername) {
                cleanupCall()
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [askForUsername, cleanupCall])

    useEffect(() => {
        if (askForUsername && videoAvailable && audioAvailable) {
            getPreviewMedia()
        }

        return () => {
            if (askForUsername) {
                stopPreviewStream()
            }
        }
    }, [askForUsername, videoAvailable, audioAvailable, previewVideo, previewAudio, getPreviewMedia, stopPreviewStream])

    useEffect(() => {
        if (!askForUsername && !localStreamRef.current && !isScreenSharingRef.current && !isGettingUserMediaRef.current) {
            console.log("Getting user media for the first time on join")
            getUserMedia().then(() => {
                console.log("Initial getUserMedia complete, stream ready:", {
                    hasStream: !!localStreamRef.current,
                    videoTracks: localStreamRef.current?.getVideoTracks().length,
                    audioTracks: localStreamRef.current?.getAudioTracks().length,
                    videoEnabled: localStreamRef.current?.getVideoTracks()[0]?.enabled,
                    audioEnabled: localStreamRef.current?.getAudioTracks()[0]?.enabled
                })
            })
        }
    }, [askForUsername, getUserMedia])

    useEffect(() => {
        if (!askForUsername) {
            getDisplayMedia()
        }
    }, [screen, askForUsername, getDisplayMedia])

    useEffect(() => {
        if (!askForUsername) {
            broadcastMediaState()
        }
    }, [video, audio, screen, askForUsername, broadcastMediaState])

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    useEffect(() => {
        videos.forEach((video) => {
            const videoElement = videoRefs.current[video.socketId]
            const userState = remoteUserStates[video.socketId] || {}

            if (videoElement && video.stream) {
                if (videoElement.srcObject !== video.stream) {
                    console.log(`Updating video element srcObject for ${video.socketId}`)
                    videoElement.srcObject = video.stream
                    videoElement.play().catch((e) => console.log("Play error:", e))
                } else {
                    const currentTracks = videoElement.srcObject?.getTracks() || []
                    const newTracks = video.stream?.getTracks() || []

                    if (currentTracks.length !== newTracks.length) {
                        console.log(`Track count changed for ${video.socketId}, refreshing`)
                        videoElement.srcObject = video.stream
                        videoElement.play().catch((e) => console.log("Play error:", e))
                    }
                }

                if (userState.video === true || userState.screen === true) {
                    if (videoElement.paused) {
                        console.log(`Video paused but should be playing for ${video.socketId}, playing now`)
                        videoElement.play().catch((e) => console.log("Play error:", e))
                    }
                }
            }
        })
    }, [videos, remoteUserStates])

    const connect = useCallback(() => {
        // Stop preview stream BEFORE changing state
        console.log("Stopping preview stream before connecting")
        stopPreviewStream()

        // Wait a bit to ensure preview stream is fully released
        setTimeout(() => {
            setAskForUsername(false)

            if (videoAvailable) {
                setVideo(previewVideo)
                videoStateRef.current = previewVideo
                console.log("Joining with video:", previewVideo)
            } else {
                setVideo(false)
                videoStateRef.current = false
            }

            if (audioAvailable) {
                setAudio(previewAudio)
                audioStateRef.current = previewAudio
                console.log("Joining with audio:", previewAudio)
            } else {
                setAudio(false)
                audioStateRef.current = false
            }

            connectToSocketServer()
        }, 100)
    }, [videoAvailable, audioAvailable, previewVideo, previewAudio, connectToSocketServer, stopPreviewStream])

    const handleVideo = useCallback(() => {
        if (!screen) {
            setVideo((prev) => {
                const newState = !prev
                videoStateRef.current = newState

                if (localStreamRef.current) {
                    const videoTracks = localStreamRef.current.getVideoTracks()
                    videoTracks.forEach((track) => {
                        if (track.label && !track.label.includes("canvas")) {
                            track.enabled = newState
                            console.log("Video toggled to:", newState, "Track:", track.label)
                        }
                    })
                }

                if (socketRef.current) {
                    socketRef.current.emit("media-state-change", {
                        video: newState,
                        audio: audio,
                        screen: screen,
                    })
                }

                return newState
            })
        }
    }, [screen, audio])

    const handleAudio = useCallback(() => {
        setAudio((prev) => {
            const newState = !prev
            audioStateRef.current = newState

            if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks()
                audioTracks.forEach((track) => {
                    if (track.label && !track.label.includes("MediaStreamAudioDestinationNode")) {
                        track.enabled = newState
                        console.log("Audio toggled to:", newState, "Track:", track.label)
                    }
                })
            }

            if (socketRef.current) {
                socketRef.current.emit("media-state-change", {
                    video: video,
                    audio: newState,
                    screen: screen,
                })
            }

            return newState
        })
    }, [video, screen])

    const handleScreen = useCallback(() => {
        setScreen((prev) => !prev)
    }, [])

    const handleCameraToggle = useCallback(async () => {
        if (screen || isScreenSharingRef.current || !videoAvailable || !video) {
            console.log("Camera toggle blocked")
            return
        }

        if (isSwitchingCamera || isSwitchingCameraRef.current) {
            console.log("Camera switch already in progress")
            return
        }

        setIsSwitchingCamera(true)
        isSwitchingCameraRef.current = true

        const newFacingMode = cameraFacingMode === "user" ? "environment" : "user"
        console.log("Switching camera to:", newFacingMode)

        const savedAudioState = audioStateRef.current
        console.log("Saved audio state before camera switch:", savedAudioState)

        try {
            let currentAudioTrack = null
            if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks()
                if (audioTracks.length > 0) {
                    currentAudioTrack = audioTracks[0]
                }
            }

            if (localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach((track) => track.stop())
            }

            const newVideoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 1280,
                    height: 720,
                    facingMode: { exact: newFacingMode },
                },
                audio: false,
            })

            const newVideoTrack = newVideoStream.getVideoTracks()[0]
            newVideoTrack.enabled = true

            const newStream = new MediaStream([newVideoTrack])

            if (currentAudioTrack) {
                newStream.addTrack(currentAudioTrack)
                currentAudioTrack.enabled = savedAudioState
                console.log("Audio track preserved with state:", savedAudioState)
            }

            localStreamRef.current = newStream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = newStream
            }

            for (const [id, peerConnection] of Object.entries(connectionsRef.current)) {
                if (id === socketIdRef.current) continue

                try {
                    const senders = peerConnection.getSenders()
                    const videoSender = senders.find((s) => s.track && s.track.kind === "video")

                    if (videoSender && newVideoTrack) {
                        await videoSender.replaceTrack(newVideoTrack)
                        console.log(`Replaced video track for peer ${id}`)
                    }
                } catch (e) {
                    console.error(`Error replacing video for peer ${id}:`, e)
                }
            }

            setCameraFacingMode(newFacingMode)

            setTimeout(() => {
                enforceTrackStates()
                console.log("Track states re-enforced after camera switch")
            }, 150)

            console.log("Camera switched successfully")
        } catch (error) {
            console.error("Camera switch error:", error)

            try {
                let currentAudioTrack = null
                if (localStreamRef.current) {
                    const audioTracks = localStreamRef.current.getAudioTracks()
                    if (audioTracks.length > 0) {
                        currentAudioTrack = audioTracks[0]
                    }
                }

                if (localStreamRef.current) {
                    localStreamRef.current.getVideoTracks().forEach((track) => track.stop())
                }

                const newVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 1280,
                        height: 720,
                        facingMode: newFacingMode,
                    },
                    audio: false,
                })

                const newVideoTrack = newVideoStream.getVideoTracks()[0]
                newVideoTrack.enabled = true

                const newStream = new MediaStream([newVideoTrack])

                if (currentAudioTrack) {
                    newStream.addTrack(currentAudioTrack)
                    currentAudioTrack.enabled = savedAudioState
                }

                localStreamRef.current = newStream
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = newStream
                }

                for (const [id, peerConnection] of Object.entries(connectionsRef.current)) {
                    if (id === socketIdRef.current) continue

                    try {
                        const senders = peerConnection.getSenders()
                        const videoSender = senders.find((s) => s.track && s.track.kind === "video")

                        if (videoSender && newVideoTrack) {
                            await videoSender.replaceTrack(newVideoTrack)
                        }
                    } catch (e) {
                        console.error(`Error replacing video for peer ${id}:`, e)
                    }
                }

                setCameraFacingMode(newFacingMode)

                setTimeout(() => {
                    enforceTrackStates()
                }, 150)

                console.log("Camera switched (fallback) successfully")
            } catch (fallbackError) {
                console.error("Fallback camera switch failed:", fallbackError)
            }
        } finally {
            setTimeout(() => {
                setIsSwitchingCamera(false)
                isSwitchingCameraRef.current = false
                enforceTrackStates()
                console.log("Camera switch complete")
            }, 200)
        }
    }, [cameraFacingMode, screen, video, videoAvailable, isSwitchingCamera, enforceTrackStates])

    const handlePreviewCameraToggle = useCallback(async () => {
        const newFacingMode = cameraFacingMode === "user" ? "environment" : "user"
        setCameraFacingMode(newFacingMode)
    }, [cameraFacingMode])

    const handleChat = useCallback(() => {
        setShowModal((prev) => {
            if (!prev) {
                setNewMessages(0)
            }
            return !prev
        })
    }, [])

    const sendMessage = useCallback(() => {
        if (message.trim() && socketRef.current) {
            socketRef.current.emit("chat-message", message, username)
            setMessage("")
        }
    }, [message, username])

    const handleEndCall = useCallback(() => {
        try {
            stopLocalStream()

            Object.values(connectionsRef.current).forEach((connection) => {
                connection.close()
            })
            connectionsRef.current = {}

            if (socketRef.current) {
                socketRef.current.emit("leave-call")
                socketRef.current.off()
                socketRef.current.disconnect()
                socketRef.current = null
            }

            setVideos([])
            setVideo(false)
            setAudio(false)
            setScreen(false)
            setMessages([])
            setNewMessages(0)
            setShowModal(false)
            isScreenSharingRef.current = false
        } catch (e) {
            console.error("End call error:", e)
        } finally {
            navigate("/home")
        }
    }, [navigate, stopLocalStream])

    const gridLayout = useMemo(() => {
        const count = videos.length
        const isMobile = window.innerWidth < 768

        if (count === 0) return { cols: 1, rows: 1 }
        if (count === 1) return { cols: 1, rows: 1 }

        if (isMobile) {
            if (count === 2) return { cols: 1, rows: 2 }
            if (count <= 4) return { cols: 2, rows: 2 }
            if (count <= 6) return { cols: 2, rows: 3 }
            return { cols: 2, rows: Math.ceil(count / 2) }
        }

        if (count === 2) return { cols: 2, rows: 1 }
        if (count <= 4) return { cols: 2, rows: 2 }
        if (count <= 6) return { cols: 3, rows: 2 }
        if (count <= 9) return { cols: 3, rows: 3 }
        return { cols: 4, rows: Math.ceil(count / 4) }
    }, [videos.length])

    useEffect(() => {
        if (!askForUsername && localStreamRef.current && !screen && !isGettingUserMediaRef.current) {
            const videoTracks = localStreamRef.current.getVideoTracks()

            videoTracks.forEach((track) => {
                if (track.label && !track.label.includes("canvas")) {
                    const shouldBeEnabled = videoStateRef.current
                    track.enabled = shouldBeEnabled
                    console.log("Video track enabled state enforced to:", shouldBeEnabled)
                }
            })
        }
    }, [video, askForUsername, screen])

    useEffect(() => {
        if (!askForUsername && localStreamRef.current && !isSwitchingCamera && !isSwitchingCameraRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks()
            audioTracks.forEach((track) => {
                if (track.label && !track.label.includes("MediaStreamAudioDestinationNode")) {
                    const shouldBeEnabled = audioStateRef.current
                    track.enabled = shouldBeEnabled
                    console.log("Audio track enabled state enforced to:", shouldBeEnabled)
                }
            })
        }
    }, [audio, askForUsername, isSwitchingCamera])

    useEffect(() => {
        if (
            !askForUsername &&
            !screen &&
            !isScreenSharingRef.current &&
            !isSwitchingCamera &&
            !isSwitchingCameraRef.current &&
            !isScreenShareOperationRef.current &&
            !isGettingUserMediaRef.current
        ) {
            const shouldGetMedia = videoStateRef.current && videoAvailable

            if (shouldGetMedia) {
                console.log("Camera facing mode changed, getting new user media")
                getUserMedia()
            }
        }
    }, [cameraFacingMode, askForUsername, screen, isSwitchingCamera, getUserMedia, videoAvailable])

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

            {askForUsername ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center min-h-screen p-4"
                >
                    <div className="w-full max-w-2xl space-y-6 backdrop-blur-xl bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">
                        <div className="text-center space-y-2">
                            <h2 className="text-4xl font-bold text-white">Join Meeting</h2>
                            <p className="text-gray-400">Enter your name to continue</p>
                        </div>

                        {/* Video Preview */}
                        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-white/10">
                            <video
                                ref={previewVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-contain"
                                style={{ transform: "scaleX(-1)" }}
                            />
                            {(!previewVideo || !videoAvailable) && (
                                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center">
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-3 shadow-lg">
                                        <VideoOff size={32} className="text-white" />
                                    </div>
                                    <p className="text-white/70 text-sm">Camera Off</p>
                                </div>
                            )}

                            {/* Preview Controls Overlay */}
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setPreviewVideo(!previewVideo)}
                                    disabled={!videoAvailable}
                                    className={`p-3 rounded-full transition-all ${!videoAvailable
                                        ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                                        : previewVideo
                                            ? "bg-white/90 text-black hover:bg-white"
                                            : "bg-red-500 text-white hover:bg-red-600"
                                        }`}
                                >
                                    {previewVideo ? <Video size={20} /> : <VideoOff size={20} />}
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setPreviewAudio(!previewAudio)}
                                    disabled={!audioAvailable}
                                    className={`p-3 rounded-full transition-all ${!audioAvailable
                                        ? "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
                                        : previewAudio
                                            ? "bg-white/90 text-black hover:bg-white"
                                            : "bg-red-500 text-white hover:bg-red-600"
                                        }`}
                                >
                                    {previewAudio ? <Mic size={20} /> : <MicOff size={20} />}
                                </motion.button>

                                {hasMultipleCameras && videoAvailable && previewVideo && (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handlePreviewCameraToggle}
                                        className="p-3 rounded-full bg-white/90 text-black hover:bg-white transition-all"
                                    >
                                        <SwitchCamera size={20} />
                                    </motion.button>
                                )}
                            </div>
                        </div>

                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && username.trim() && connect()}
                            placeholder="Your name"
                            className="w-full px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white shadow-lg transition-all"
                        />

                        <div className="w-full space-y-3">
                            <div className="flex items-center justify-between p-4 bg-white/10 rounded-xl border border-white/20">
                                <div className="flex items-center gap-3">
                                    <Video size={20} className="text-white" />
                                    <div>
                                        <p className="text-white font-medium text-sm">Camera</p>
                                        <p className="text-gray-400 text-xs">
                                            {videoAvailable ? "Available" : "Not available or denied"}
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-3 h-3 rounded-full ${videoAvailable ? "bg-green-500" : "bg-red-500"}`} />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-white/10 rounded-xl border border-white/20">
                                <div className="flex items-center gap-3">
                                    <Mic size={20} className="text-white" />
                                    <div>
                                        <p className="text-white font-medium text-sm">Microphone</p>
                                        <p className="text-gray-400 text-xs">
                                            {audioAvailable ? "Available" : "Not available or denied"}
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-3 h-3 rounded-full ${audioAvailable ? "bg-green-500" : "bg-red-500"}`} />
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={connect}
                            disabled={!username.trim()}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Join with {previewVideo ? "Video" : "Video Off"} and {previewAudio ? "Audio" : "Audio Off"}
                        </motion.button>

                        {!videoAvailable && !audioAvailable && (
                            <div className="text-center p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                                <p className="text-yellow-400 text-xs">
                                    ⚠️ No camera or microphone access. You'll join with audio/video off.
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            ) : (
                <>
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
                                        <p className="text-white text-lg md:text-xl font-semibold">Waiting for others to join...</p>
                                        <p className="text-gray-400 text-xs md:text-sm mt-2">Share the meeting link</p>
                                    </motion.div>
                                </div>
                            ) : (
                                videos.map((video) => {
                                    const userState = remoteUserStates[video.socketId] || {}
                                    const isVideoOff = userState.video !== true && userState.screen !== true
                                    const isAudioOff = userState.audio === false
                                    const isScreenSharing = userState.screen === true

                                    return (
                                        <div
                                            key={`${video.socketId}-${video.streamId}`}
                                            className="relative rounded-lg md:rounded-xl overflow-hidden bg-gray-900 border border-white/10"
                                        >
                                            <video
                                                key={`${video.socketId}-${video.streamId}`}
                                                ref={(ref) => {
                                                    if (ref) {
                                                        videoRefs.current[video.socketId] = ref
                                                        if (video.stream && ref.srcObject !== video.stream) {
                                                            console.log(`Setting srcObject for ${video.socketId} in render`)
                                                            ref.srcObject = video.stream
                                                            ref.play().catch((e) => console.log("Play error:", e))
                                                        }
                                                    }
                                                }}
                                                autoPlay
                                                playsInline
                                                muted={false}
                                                className={`w-full h-full object-contain bg-black transition-opacity duration-300 ${isVideoOff ? "opacity-0" : "opacity-100"}`}
                                                style={{ display: isVideoOff ? 'none' : 'block' }}
                                            />
                                            {isVideoOff && (
                                                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center">
                                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-3 shadow-lg">
                                                        <span className="text-2xl md:text-3xl font-bold text-white">
                                                            {video.username?.charAt(0).toUpperCase() || "U"}
                                                        </span>
                                                    </div>
                                                    <VideoOff size={24} className="text-white/70 md:w-8 md:h-8" />
                                                    <p className="text-white/70 text-xs md:text-sm mt-2">Camera Off</p>
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 flex items-center gap-2">
                                                <div className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded backdrop-blur-sm">
                                                    {video.username}
                                                </div>
                                                {isScreenSharing && (
                                                    <div className="px-2 py-1 bg-green-500/90 rounded backdrop-blur-sm flex items-center gap-1">
                                                        <MonitorUp size={12} className="text-white" />
                                                        <span className="text-white text-xs font-medium">Sharing</span>
                                                    </div>
                                                )}
                                            </div>
                                            {isAudioOff && (
                                                <div className="absolute top-2 right-2 bg-red-500/90 p-1.5 rounded-full backdrop-blur-sm">
                                                    <MicOff size={14} className="text-white" />
                                                </div>
                                            )}
                                        </div>
                                    )
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
                            {video ? <Video size={18} className="md:w-5 md:h-5" /> : <VideoOff size={18} className="md:w-5 md:h-5" />}
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
                            title={!audioAvailable ? "Microphone not available" : audio ? "Mute" : "Unmute"}
                        >
                            {audio ? <Mic size={18} className="md:w-5 md:h-5" /> : <MicOff size={18} className="md:w-5 md:h-5" />}
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
                                                : `Switch to ${cameraFacingMode === "user" ? "back" : "front"} camera`
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
                            title={screenAvailable ? (screen ? "Stop sharing" : "Share screen") : "Screen sharing not available"}
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
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                setShowCopyFeedback(true)
                                setTimeout(() => setShowCopyFeedback(false), 2000)
                            }}
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
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 flex flex-col"
                                style={{ height: "80vh" }}
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
                                                className={`flex flex-col ${msg.sender === username ? "items-end" : "items-start"}`}
                                            >
                                                <div
                                                    className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${msg.sender === username
                                                        ? "bg-orange-500 text-white rounded-br-none"
                                                        : "bg-gray-200 text-gray-800 rounded-bl-none"
                                                        }`}
                                                >
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
                                            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
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
    )
}