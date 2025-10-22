import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { io } from "socket.io-client"
import {
    PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorStop,
    MessageSquare, Send, X, SwitchCamera,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate, useLocation } from "react-router"
import server from "../environment"

const PEER_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ],
    iceCandidatePoolSize: 10,
}

const BLACK_VIDEO_DIMS = { width: 640, height: 480 }
const MEDIA_CONSTRAINTS = {
    video: { width: 1280, height: 720 },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
}

export const MeetingRoom = () => {
    const navigate = useNavigate()
    const location = useLocation()

    // Refs
    const socketRef = useRef()
    const socketIdRef = useRef()
    const localVideoRef = useRef()
    const connectionsRef = useRef({})
    const isMountedRef = useRef(true)
    const isScreenSharingRef = useRef(false)
    const localStreamRef = useRef(null)
    const chatEndRef = useRef()
    const audioStateRef = useRef(true)
    const videoStateRef = useRef(true)
    const isGettingUserMediaRef = useRef(false)
    const videoRefs = useRef({})
    const isSwitchingCameraRef = useRef(false)
    const pendingIceCandidatesRef = useRef({})

    // States
    const [videoAvailable, setVideoAvailable] = useState(true)
    const [audioAvailable, setAudioAvailable] = useState(true)
    const [video, setVideo] = useState(true)
    const [audio, setAudio] = useState(true)
    const [screen, setScreen] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [screenAvailable, setScreenAvailable] = useState(true)
    const [message, setMessage] = useState("")
    const [messages, setMessages] = useState([])
    const [newMessages, setNewMessages] = useState(0)
    const [username, setUsername] = useState("")
    const [videos, setVideos] = useState([])
    const [remoteUserStates, setRemoteUserStates] = useState({})
    const [showCopyFeedback, setShowCopyFeedback] = useState(false)
    const [cameraFacingMode, setCameraFacingMode] = useState("user")
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
    const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)

    // Redirect if no username
    useEffect(() => {
        if (!location.state?.username) {
            const pathParts = location.pathname.split('/')
            const meetingId = pathParts[pathParts.length - 1]
            if (meetingId && meetingId !== 'meeting') {
                navigate(`/previewMeeting/${meetingId}`, { replace: true })
            } else {
                navigate('/previewMeeting', { replace: true })
            }
        } else {
            setUsername(location.state.username)
            setVideo(location.state.videoEnabled ?? true)
            setAudio(location.state.audioEnabled ?? true)
            videoStateRef.current = location.state.videoEnabled ?? true
            audioStateRef.current = location.state.audioEnabled ?? true
            setCameraFacingMode(location.state.cameraFacingMode ?? "user")
            setVideoAvailable(location.state.videoEnabled ?? true)
            setAudioAvailable(location.state.audioEnabled ?? true)
        }
    }, [location, navigate])

    // Sync refs with states
    useEffect(() => { audioStateRef.current = audio }, [audio])
    useEffect(() => { videoStateRef.current = video }, [video])

    // Track utilities
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
        return Object.assign(canvas.captureStream().getVideoTracks()[0], { enabled: false })
    }, [])

    const createBlackSilenceStream = useCallback(() => {
        return new MediaStream([createBlackVideoTrack(BLACK_VIDEO_DIMS), createSilentAudioTrack()])
    }, [createBlackVideoTrack, createSilentAudioTrack])

    const enforceTrackStates = useCallback(() => {
        if (!localStreamRef.current) return

        const audioTracks = localStreamRef.current.getAudioTracks()
        const videoTracks = localStreamRef.current.getVideoTracks()

        audioTracks.forEach(track => {
            if (track.label && !track.label.includes("MediaStreamAudioDestinationNode")) {
                track.enabled = audioStateRef.current
            }
        })

        if (!isScreenSharingRef.current) {
            videoTracks.forEach(track => {
                if (track.label && !track.label.includes("canvas")) {
                    track.enabled = videoStateRef.current
                }
            })
        }
    }, [])

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
            localStreamRef.current = null
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null
        }
    }, [])

    // Optimized peer connection - parallel operations
    const replaceStreamForPeers = useCallback(async (newStream) => {
        const peerEntries = Object.entries(connectionsRef.current)
        if (peerEntries.length === 0) return

        // Replace tracks in parallel
        await Promise.all(
            peerEntries.map(async ([id, pc]) => {
                if (id === socketIdRef.current) return

                try {
                    const senders = pc.getSenders()
                    const videoTrack = newStream.getVideoTracks()[0]
                    const audioTrack = newStream.getAudioTracks()[0]

                    const videoSender = senders.find(s => s.track?.kind === "video")
                    if (videoSender && videoTrack) {
                        videoTrack.enabled = isScreenSharingRef.current || videoStateRef.current
                        await videoSender.replaceTrack(videoTrack)
                    }

                    const audioSender = senders.find(s => s.track?.kind === "audio")
                    if (audioSender && audioTrack && audioSender.track !== audioTrack) {
                        audioTrack.enabled = audioStateRef.current
                        await audioSender.replaceTrack(audioTrack)
                    }
                } catch (e) {
                    console.error(`Error replacing tracks for peer ${id}:`, e)
                }
            })
        )

        // Renegotiate in parallel
        await Promise.all(
            peerEntries.map(async ([id, connection]) => {
                if (id === socketIdRef.current || connection.signalingState !== "stable") return

                try {
                    const offer = await connection.createOffer()
                    await connection.setLocalDescription(offer)
                    socketRef.current?.emit("signal", id, JSON.stringify({ sdp: connection.localDescription }))
                } catch (e) {
                    console.error(`Renegotiation error for peer ${id}:`, e)
                }
            })
        )

        setTimeout(enforceTrackStates, 150)
    }, [enforceTrackStates])

    const handleTrackEnded = useCallback(async () => {
        setScreen(false)
        setVideo(false)
        setAudio(false)
        stopLocalStream()

        const blackSilence = createBlackSilenceStream()
        localStreamRef.current = blackSilence
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = blackSilence
        }
        isScreenSharingRef.current = false

        await replaceStreamForPeers(blackSilence)
    }, [stopLocalStream, createBlackSilenceStream, replaceStreamForPeers])

    // Optimized getUserMedia - parallel audio/video requests
    const getUserMedia = useCallback(async () => {
        if (isGettingUserMediaRef.current) return

        try {
            isGettingUserMediaRef.current = true
            await new Promise(resolve => setTimeout(resolve, 100))

            // Request audio and video in parallel
            const [audioStream, videoStream] = await Promise.all([
                audioAvailable ? navigator.mediaDevices.getUserMedia({
                    audio: MEDIA_CONSTRAINTS.audio,
                    video: false
                }).catch(() => null) : null,
                videoAvailable ? navigator.mediaDevices.getUserMedia({
                    video: { ...MEDIA_CONSTRAINTS.video, facingMode: cameraFacingMode },
                    audio: false
                }).catch(() => null) : null
            ])

            stopLocalStream()

            const combinedStream = new MediaStream()

            // Add video track
            if (videoStream?.getVideoTracks().length > 0) {
                const videoTrack = videoStream.getVideoTracks()[0]
                videoTrack.enabled = videoStateRef.current
                videoTrack.onended = handleTrackEnded
                combinedStream.addTrack(videoTrack)
            } else {
                combinedStream.addTrack(Object.assign(createBlackVideoTrack(BLACK_VIDEO_DIMS), { enabled: false }))
            }

            // Add audio track
            if (audioStream?.getAudioTracks().length > 0) {
                const audioTrack = audioStream.getAudioTracks()[0]
                audioTrack.enabled = audioStateRef.current
                audioTrack.onended = handleTrackEnded
                combinedStream.addTrack(audioTrack)
            } else {
                combinedStream.addTrack(Object.assign(createSilentAudioTrack(), { enabled: false }))
            }

            localStreamRef.current = combinedStream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = combinedStream
            }

            isScreenSharingRef.current = false

            if (Object.keys(connectionsRef.current).length > 0) {
                await replaceStreamForPeers(combinedStream)
            }
        } catch (e) {
            console.error("getUserMedia error:", e)
        } finally {
            isGettingUserMediaRef.current = false
        }
    }, [videoAvailable, audioAvailable, cameraFacingMode, stopLocalStream, createBlackVideoTrack,
        createSilentAudioTrack, replaceStreamForPeers, handleTrackEnded])

    const getDisplayMedia = useCallback(async () => {
        if (!screen) return

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always", width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            })

            const audioTrack = localStreamRef.current?.getAudioTracks()[0]

            if (localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach(track => track.stop())
            }

            if (audioTrack) {
                stream.addTrack(audioTrack)
                audioTrack.enabled = audioStateRef.current
            }

            localStreamRef.current = stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
            }
            isScreenSharingRef.current = true

            if (Object.keys(connectionsRef.current).length > 0) {
                await replaceStreamForPeers(stream)
            }

            setTimeout(enforceTrackStates, 200)

            stream.getVideoTracks()[0].onended = () => {
                if (isMountedRef.current) setScreen(false)
            }
        } catch (e) {
            console.error("getDisplayMedia error:", e)
            setScreen(false)
        }
    }, [screen, replaceStreamForPeers, enforceTrackStates])

    // Handle screen share stop
    useEffect(() => {
        if (!screen && isScreenSharingRef.current && !isGettingUserMediaRef.current) {
            isScreenSharingRef.current = false
            setTimeout(() => {
                if (!isGettingUserMediaRef.current) {
                    getUserMedia()
                }
            }, 100)
        }
    }, [screen, getUserMedia])

    // Optimized signal handling with ICE candidate queueing
    const gotMessageFromServer = useCallback((fromId, message) => {
        const signal = JSON.parse(message)
        if (fromId === socketIdRef.current) return

        const connection = connectionsRef.current[fromId]
        if (!connection) return

        if (signal.sdp) {
            const desc = new RTCSessionDescription(signal.sdp)
            const isPolite = socketIdRef.current < fromId

            if (desc.type === "offer" && connection.signalingState === "have-local-offer" && !isPolite) {
                return // Ignore glare
            }

            if (desc.type === "answer" && connection.signalingState !== "have-local-offer") {
                return // Ignore unexpected answer
            }

            connection.setRemoteDescription(desc)
                .then(() => {
                    if (desc.type === "offer") {
                        return connection.createAnswer()
                            .then(answer => connection.setLocalDescription(answer))
                            .then(() => {
                                socketRef.current?.emit("signal", fromId,
                                    JSON.stringify({ sdp: connection.localDescription }))
                            })
                    }
                })
                .then(() => {
                    // Process queued ICE candidates
                    const pending = pendingIceCandidatesRef.current[fromId] || []
                    pending.forEach(candidate => {
                        connection.addIceCandidate(new RTCIceCandidate(candidate))
                            .catch(e => console.error("ICE candidate error:", e))
                    })
                    delete pendingIceCandidatesRef.current[fromId]
                    enforceTrackStates()
                })
                .catch(e => console.error(`SDP error with ${fromId}:`, e))
        }

        if (signal.ice) {
            if (connection.remoteDescription) {
                connection.addIceCandidate(new RTCIceCandidate(signal.ice))
                    .catch(e => console.error("ICE candidate error:", e))
            } else {
                // Queue ICE candidate
                if (!pendingIceCandidatesRef.current[fromId]) {
                    pendingIceCandidatesRef.current[fromId] = []
                }
                pendingIceCandidatesRef.current[fromId].push(signal.ice)
            }
        }
    }, [enforceTrackStates])

    const addMessage = useCallback((data, sender, socketIdSender) => {
        if (!isMountedRef.current) return
        setMessages(prev => [...prev, { data, sender }])
        if (socketIdRef.current !== socketIdSender) {
            setNewMessages(prev => prev + 1)
        }
    }, [])

    const broadcastMediaState = useCallback(() => {
        socketRef.current?.emit("media-state-change", { video, audio, screen })
    }, [video, audio, screen])

    const connectToSocketServer = useCallback(() => {
        socketRef.current = io(server, {
            secure: false,
            transports: ["websocket", "polling"],
        })

        socketRef.current.on("signal", gotMessageFromServer)
        socketRef.current.on("chat-message", addMessage)

        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", window.location.href, username)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on("media-state-change", (socketId, mediaState) => {
                if (!isMountedRef.current) return
                setRemoteUserStates(prev => ({ ...prev, [socketId]: mediaState }))
            })

            socketRef.current.on("user-left", (id) => {
                if (!isMountedRef.current) return
                setVideos(videos => videos.filter(v => v.socketId !== id))
                setRemoteUserStates(prev => {
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
                clients.forEach(socketListId => {
                    if (connectionsRef.current[socketListId]) return

                    const pc = new RTCPeerConnection(PEER_CONFIG)
                    connectionsRef.current[socketListId] = pc

                    pc.onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current?.emit("signal", socketListId,
                                JSON.stringify({ ice: event.candidate }))
                        }
                    }

                    pc.ontrack = (event) => {
                        if (socketListId === socketIdRef.current || !isMountedRef.current) return

                        setVideos(videos => {
                            const exists = videos.find(v => v.socketId === socketListId)
                            if (exists) {
                                return videos.map(v => v.socketId === socketListId ? {
                                    ...v,
                                    stream: event.streams[0],
                                    username: usernames[socketListId],
                                    streamId: event.streams[0].id + "-" + Date.now(),
                                } : v)
                            }
                            return [...videos, {
                                socketId: socketListId,
                                stream: event.streams[0],
                                username: usernames[socketListId],
                                streamId: event.streams[0].id + "-" + Date.now(),
                            }]
                        })
                    }

                    const streamToAdd = localStreamRef.current || createBlackSilenceStream()

                    // Ensure both tracks exist
                    if (streamToAdd.getVideoTracks().length === 0) {
                        streamToAdd.addTrack(Object.assign(createBlackVideoTrack(BLACK_VIDEO_DIMS), { enabled: false }))
                    }
                    if (streamToAdd.getAudioTracks().length === 0) {
                        streamToAdd.addTrack(Object.assign(createSilentAudioTrack(), { enabled: false }))
                    }

                    // Set track states
                    streamToAdd.getAudioTracks().forEach(track => {
                        if (!track.label?.includes("MediaStreamAudioDestinationNode")) {
                            track.enabled = audioStateRef.current
                        }
                    })
                    if (!isScreenSharingRef.current) {
                        streamToAdd.getVideoTracks().forEach(track => {
                            if (!track.label?.includes("canvas")) {
                                track.enabled = videoStateRef.current
                            }
                        })
                    }

                    streamToAdd.getTracks().forEach(track => pc.addTrack(track, streamToAdd))
                })

                if (id === socketIdRef.current) {
                    if (existingMediaStates) {
                        setRemoteUserStates(existingMediaStates)
                    }
                    setTimeout(broadcastMediaState, 500)

                    // Create offers in parallel
                    Promise.all(
                        Object.entries(connectionsRef.current).map(([id2, connection]) => {
                            if (id2 === socketIdRef.current) return
                            return connection.createOffer()
                                .then(desc => connection.setLocalDescription(desc))
                                .then(() => {
                                    socketRef.current?.emit("signal", id2,
                                        JSON.stringify({ sdp: connection.localDescription }))
                                })
                                .catch(e => console.error("Offer error:", e))
                        })
                    )
                }
            })
        })
    }, [username, gotMessageFromServer, addMessage, createBlackSilenceStream,
        createBlackVideoTrack, createSilentAudioTrack, broadcastMediaState])

    const cleanupCall = useCallback(() => {
        try {
            stopLocalStream()
            Object.values(connectionsRef.current).forEach(conn => conn.close())
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
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)
        setScreenAvailable(!isMobile && !!navigator.mediaDevices?.getDisplayMedia)

        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices.filter(d => d.kind === "videoinput")
            setHasMultipleCameras(videoDevices.length > 1)
        } catch (e) {
            setHasMultipleCameras(false)
        }
    }, [])

    // Control handlers
    const handleVideo = useCallback(() => {
        if (!screen) setVideo(prev => !prev)
    }, [screen])

    const handleAudio = useCallback(() => {
        setAudio(prev => {
            const newState = !prev
            audioStateRef.current = newState
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(track => {
                    if (!track.label?.includes("MediaStreamAudioDestinationNode")) {
                        track.enabled = newState
                    }
                })
            }
            socketRef.current?.emit("media-state-change", { video, audio: newState, screen })
            return newState
        })
    }, [video, screen])

    const handleScreen = useCallback(() => setScreen(prev => !prev), [])

    const handleCameraToggle = useCallback(async () => {
        if (screen || !videoAvailable || !video || isSwitchingCamera) return

        setIsSwitchingCamera(true)
        isSwitchingCameraRef.current = true

        const newFacingMode = cameraFacingMode === "user" ? "environment" : "user"
        const savedAudioState = audioStateRef.current

        try {
            const currentAudioTrack = localStreamRef.current?.getAudioTracks()[0]
            localStreamRef.current?.getVideoTracks().forEach(track => track.stop())

            const newVideoStream = await navigator.mediaDevices.getUserMedia({
                video: { ...MEDIA_CONSTRAINTS.video, facingMode: { exact: newFacingMode } },
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

            // Replace video track for all peers in parallel
            await Promise.all(
                Object.entries(connectionsRef.current).map(async ([id, pc]) => {
                    if (id === socketIdRef.current) return
                    const videoSender = pc.getSenders().find(s => s.track?.kind === "video")
                    if (videoSender) await videoSender.replaceTrack(newVideoTrack)
                })
            )

            setCameraFacingMode(newFacingMode)
            setTimeout(enforceTrackStates, 150)
        } catch (error) {
            console.error("Camera switch error:", error)
        } finally {
            setTimeout(() => {
                setIsSwitchingCamera(false)
                isSwitchingCameraRef.current = false
            }, 200)
        }
    }, [cameraFacingMode, screen, video, videoAvailable, isSwitchingCamera, enforceTrackStates])

    const handleChat = useCallback(() => {
        setShowModal(prev => {
            if (!prev) setNewMessages(0)
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
            Object.values(connectionsRef.current).forEach(conn => conn.close())
            connectionsRef.current = {}
            if (socketRef.current) {
                socketRef.current.emit("leave-call")
                socketRef.current.off()
                socketRef.current.disconnect()
            }
        } catch (e) {
            console.error("End call error:", e)
        } finally {
            navigate("/home")
        }
    }, [navigate, stopLocalStream])

    // Grid layout calculation
    const gridLayout = useMemo(() => {
        const count = videos.length
        const isMobile = window.innerWidth < 768

        if (count === 0) return { cols: 1, rows: 1 }
        if (count === 1) return { cols: 1, rows: 1 }
        if (isMobile) {
            if (count === 2) return { cols: 1, rows: 2 }
            if (count <= 4) return { cols: 2, rows: 2 }
            return { cols: 2, rows: Math.ceil(count / 2) }
        }
        if (count === 2) return { cols: 2, rows: 1 }
        if (count <= 4) return { cols: 2, rows: 2 }
        if (count <= 6) return { cols: 3, rows: 2 }
        if (count <= 9) return { cols: 3, rows: 3 }
        return { cols: 4, rows: Math.ceil(count / 4) }
    }, [videos.length])

    // Effects
    useEffect(() => {
        getPermissions()
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            cleanupCall()
        }
    }, [getPermissions, cleanupCall])

    useEffect(() => {
        const handleBeforeUnload = () => cleanupCall()
        window.addEventListener("beforeunload", handleBeforeUnload)
        return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [cleanupCall])

    useEffect(() => {
        if (username && !localStreamRef.current && !isScreenSharingRef.current && !isGettingUserMediaRef.current) {
            getUserMedia()
        }
    }, [username, getUserMedia])

    useEffect(() => {
        if (username) getDisplayMedia()
    }, [screen, username, getDisplayMedia])

    useEffect(() => {
        if (username) broadcastMediaState()
    }, [video, audio, screen, username, broadcastMediaState])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    useEffect(() => {
        videos.forEach(video => {
            const videoElement = videoRefs.current[video.socketId]
            if (videoElement && video.stream && videoElement.srcObject !== video.stream) {
                videoElement.srcObject = video.stream
                videoElement.play().catch(e => console.log("Play error:", e))
            }
        })
    }, [videos])

    useEffect(() => {
        if (username) connectToSocketServer()
    }, [username, connectToSocketServer])

    useEffect(() => {
        if (username && localStreamRef.current && !screen) {
            localStreamRef.current.getVideoTracks().forEach(track => {
                if (!track.label?.includes("canvas")) {
                    track.enabled = video
                }
            })
            broadcastMediaState()
        }
    }, [video, username, screen, broadcastMediaState])

    if (!username) return null

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
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
                                <p className="text-white text-lg md:text-xl font-semibold">Waiting for others to join...</p>
                                <p className="text-gray-400 text-xs md:text-sm mt-2">Share the meeting link</p>
                            </motion.div>
                        </div>
                    ) : (
                        videos.map(video => {
                            const userState = remoteUserStates[video.socketId] || {}
                            const isVideoOff = !userState.video && !userState.screen
                            const isAudioOff = userState.audio === false
                            const isScreenSharing = userState.screen === true

                            return (
                                <div
                                    key={`${video.socketId}-${video.streamId}`}
                                    className="relative rounded-lg md:rounded-xl overflow-hidden bg-gray-900 border border-white/10"
                                >
                                    <video
                                        ref={ref => {
                                            if (ref) {
                                                videoRefs.current[video.socketId] = ref
                                                if (video.stream && ref.srcObject !== video.stream) {
                                                    ref.srcObject = video.stream
                                                    ref.play().catch(e => console.log("Play error:", e))
                                                }
                                            }
                                        }}
                                        autoPlay
                                        playsInline
                                        muted={false}
                                        className={`w-full h-full object-contain bg-black ${isVideoOff ? "hidden" : ""}`}
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
                >
                    {screen ? <MonitorUp size={18} className="md:w-5 md:h-5" /> : <MonitorStop size={18} className="md:w-5 md:h-5" />}
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
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px] md:w-5 md:h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
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
                                    onChange={e => setMessage(e.target.value)}
                                    onKeyPress={e => e.key === "Enter" && sendMessage()}
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
        </div>
    )
}