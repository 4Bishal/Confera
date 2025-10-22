import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Ghost } from "lucide-react";

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="flex items-center justify-center h-screen w-full bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-center p-6 max-w-sm bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10"
            >
                <motion.div
                    initial={{ scale: 0.8, rotate: -5 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex justify-center"
                >
                    <Ghost className="w-16 h-16 text-pink-400 mb-4" />
                </motion.div>
                <h1 className="text-4xl font-semibold mb-2">404</h1>
                <p className="text-gray-300 mb-6">Page Not Found</p>
                <button
                    onClick={() => navigate("/")}
                    className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-red-500 hover:from-red-500 hover:to-pink-500 transition-all duration-200 rounded-full font-medium shadow-lg hover:shadow-pink-500/30"
                >
                    Go Home
                </button>
            </motion.div>
        </div>
    );
};

export default NotFound;
