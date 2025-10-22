import React, { useContext, useState } from "react";
import withAuth from "../utils/withAuth";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

function Home() {
    const navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const { logout } = useContext(AuthContext);

    const handleJoinVideoCall = async () => {
        navigate(`/previewMeeting/${meetingCode}`);
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            handleJoinVideoCall();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#fffaf5] to-[#ffe6cc]">
            {/* Navbar */}
            <nav className="flex justify-between items-center px-6 py-4 bg-white/50 backdrop-blur-md shadow-md fixed w-full z-50">
                <h2 className="text-2xl font-bold text-[#FF9839] cursor-pointer" onClick={() => navigate("/")}>
                    Confera
                </h2>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate("/history")}
                        className="flex items-center gap-1 text-[#FF9839] font-semibold hover:underline"
                    >
                        ⏱ History
                    </button>
                    <button
                        onClick={logout}
                        className="bg-[#FF9839] text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-all shadow-md"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex flex-col md:flex-row items-center justify-center min-h-screen pt-24 md:pt-32 px-6 gap-10">
                {/* Left Panel */}
                <div className="md:w-1/2 flex flex-col gap-4">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-800">
                        Quality Video Calls, Just Like Quality Education
                    </h2>
                    <p className="text-gray-600">
                        Connect instantly with friends, family, or colleagues.
                    </p>
                    <div className="flex gap-2 mt-4 max-w-md">
                        <input
                            type="text"
                            placeholder="Enter Meeting Code"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF9839]"
                            value={meetingCode}
                            onChange={(e) => setMeetingCode(e.target.value)}
                            onKeyDown={handleKeyPress} // Enter key support
                        />
                        <button
                            onClick={() => {
                                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                                let newRoomId = '';
                                for (let i = 0; i < 18; i++) {
                                    newRoomId += characters.charAt(Math.floor(Math.random() * characters.length));
                                }
                                setMeetingCode(newRoomId);
                            }}
                            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg shadow-md hover:bg-gray-300 transition-all"
                        >
                            Generate-RoomId
                        </button>
                        <button
                            onClick={handleJoinVideoCall}
                            className="bg-[#FF9839] text-white px-4 py-2 rounded-lg shadow-md hover:bg-orange-600 transition-all"
                        >
                            Join
                        </button>
                    </div>
                </div>


                {/* Right Panel */}
                <div className="md:w-1/2 flex justify-center">
                    <img
                        src="/logo3.png"
                        alt="Confera Logo"
                        className="w-60 h-60 md:w-72 md:h-72 object-contain"
                    />
                </div>
            </div>
        </div>
    );
}

export default withAuth(Home);
