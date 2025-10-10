import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Video, Trash2, Trash } from "lucide-react";
import withAuth from "../utils/withAuth";

const History = () => {
    const { getHistoryOfUser, deleteUserHistoryItem, clearUserHistory } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch (err) {
                console.error("Failed to load history:", err);
            }
        };
        fetchHistory();
    }, []);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this meeting?")) {
            await deleteUserHistoryItem(id);
            setMeetings((prev) => prev.filter((item) => item._id !== id));
        }
    };

    const handleClearAll = async () => {
        if (meetings.length === 0) return;
        if (window.confirm("Are you sure you want to clear all history?")) {
            await clearUserHistory();
            setMeetings([]);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-800 p-6 sm:p-10 flex flex-col items-center">
            {/* Top bar */}
            <div className="flex items-center justify-between w-full max-w-4xl mb-8">
                <h1 className="text-3xl font-bold text-orange-500">Meeting History</h1>
                <div className="flex items-center gap-4">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate("/home")}
                        className="flex items-center gap-2 text-gray-700 hover:text-orange-500 transition"
                    >
                        <Home size={24} />
                        <span className="hidden sm:inline font-medium">Home</span>
                    </motion.button>
                    {meetings.length > 0 && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleClearAll}
                            className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
                        >
                            <Trash size={18} />
                            Clear All
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Meeting Cards */}
            {meetings.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                    {meetings.map((meeting, index) => (
                        <motion.div
                            key={meeting._id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white rounded-2xl shadow-md hover:shadow-lg transition p-6 flex flex-col gap-3 border border-gray-100 relative"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Video className="text-orange-500" size={28} />
                                <h2 className="font-semibold text-lg text-gray-800">
                                    Meeting {index + 1}
                                </h2>
                            </div>

                            <div className="text-gray-600 text-sm sm:text-base">
                                <p>
                                    <span className="font-medium text-gray-700">Code:</span>{" "}
                                    {meeting.meeting_code}
                                </p>
                                <p>
                                    <span className="font-medium text-gray-700">Date:</span>{" "}
                                    {formatDate(meeting.date)}
                                </p>
                            </div>

                            {/* Delete Icon */}
                            <Trash2
                                className="absolute top-4 right-4 text-red-500 cursor-pointer hover:text-red-700"
                                onClick={() => handleDelete(meeting._id)}
                            />
                        </motion.div>
                    ))}
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                    className="flex flex-col items-center justify-center mt-20 text-center"
                >
                    <Video size={60} className="text-orange-400 mb-4" />
                    <p className="text-gray-500 text-lg font-medium">
                        No meetings yet — start your first call!
                    </p>
                </motion.div>
            )}
        </div>
    );
};

export default withAuth(History);
