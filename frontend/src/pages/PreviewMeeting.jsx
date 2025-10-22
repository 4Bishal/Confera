import { useEffect, useState, useRef, useCallback, useContext } from "react"
import { useNavigate, useParams } from "react-router"
import { motion } from "framer-motion"
import { Video, VideoOff, Mic, MicOff, SwitchCamera } from "lucide-react"
import { AuthContext } from "../contexts/AuthContext"


export const PreviewMeeting = () => {
    const { userData, addToUserHistory } = useContext(AuthContext);

    const navigate = useNavigate()
    const { meetingCode } = useParams()
    const previewVideoRef = useRef()
    const previewStreamRef = useRef(null)

    const [videoAvailable, setVideoAvailable] = useState(true)
    const [audioAvailable, setAudioAvailable] = useState(true)
    const [previewVideo, setPreviewVideo] = useState(true)
    const [previewAudio, setPreviewAudio] = useState(true)
    const [username, setUsername] = useState("")
    const [cameraFacingMode, setCameraFacingMode] = useState("user")
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false)

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
    }, [])

    useEffect(() => {
        getPermissions()

        return () => {
            stopPreviewStream()
        }
    }, [getPermissions, stopPreviewStream])

    useEffect(() => {
        if (videoAvailable && audioAvailable) {
            getPreviewMedia()
        }

        return () => {
            stopPreviewStream()
        }
    }, [videoAvailable, audioAvailable, previewVideo, previewAudio, getPreviewMedia, stopPreviewStream])

    const handlePreviewCameraToggle = useCallback(async () => {
        const newFacingMode = cameraFacingMode === "user" ? "environment" : "user"
        setCameraFacingMode(newFacingMode)
    }, [cameraFacingMode])

    const handleJoinMeeting = useCallback(async () => {


        if (userData) {
            await addToUserHistory(meetingCode);
            console.log(userData)
        }

        if (!username.trim()) return

        // Stop preview stream before navigating
        console.log("Stopping preview stream before joining")
        stopPreviewStream()

        // Navigate to meeting room with state
        setTimeout(() => {
            navigate(`/meeting/${meetingCode}`, {
                state: {
                    username: username.trim(),
                    previewVideo,
                    previewAudio,
                    videoAvailable,
                    audioAvailable,
                    cameraFacingMode
                }
            })
        }, 100)
    }, [username, meetingCode, previewVideo, previewAudio, videoAvailable, audioAvailable, cameraFacingMode, navigate, stopPreviewStream])

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />


            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-screen p-4"
            >
                <div className="w-full max-w-2xl space-y-6 backdrop-blur-xl bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate("/home")}
                        className="w-full py-3 rounded-xl bg-gray-700 text-white font-semibold hover:bg-gray-800 transition-all shadow-lg shadow-black/20"
                    >
                        Cancel & Go Home
                    </motion.button>


                    <div className="text-center space-y-2">
                        <h2 className="text-4xl font-bold text-white">Join Meeting</h2>
                        <p className="text-gray-400">Enter your name to continue</p>
                        {meetingCode && (
                            <p className="text-sm text-orange-400 font-mono">Meeting Code: {meetingCode}</p>
                        )}
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
                        onKeyPress={(e) => e.key === "Enter" && username.trim() && handleJoinMeeting()}
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
                        onClick={handleJoinMeeting}
                        disabled={!username.trim()}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Join with {videoAvailable && previewVideo ? "Video" : "Video Off"} and {audioAvailable && previewAudio ? "Audio" : "Audio Off"}
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
        </div>
    )
}