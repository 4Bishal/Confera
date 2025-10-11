import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    LogIn,
    UserPlus,
    Users,
    Video,
    Shield,
    MessageSquare,
    Globe,
    Menu,
    X,
} from "lucide-react";
import withPublic from "../utils/withPublic";
import { v4 as uuidv4 } from "uuid"; // ✅ Import UUID
function LandingPage() {
    const router = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);

    const features = [
        {
            icon: <Video size={32} className="text-orange-500" />,
            title: "Seamless Video Calls",
            desc: "Connect with anyone instantly using high-quality video and audio.",
        },
        {
            icon: <Shield size={32} className="text-orange-500" />,
            title: "Secure & Private",
            desc: "Your data stays protected with end-to-end encryption.",
        },
        {
            icon: <MessageSquare size={32} className="text-orange-500" />,
            title: "Real-time Messaging",
            desc: "Chat live, share media, and stay connected anytime.",
        },
        {
            icon: <Globe size={32} className="text-orange-500" />,
            title: "Global Reach",
            desc: "Connect across borders with one click — no barriers.",
        },
    ];

    // ✅ Function to generate dynamic guest room
    const handleGuestJoin = () => {
        const roomId = uuidv4();
        router(`/${roomId}`);
    };
    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-gray-50 text-gray-800 overflow-x-hidden">
            {/* Navbar */}
            <nav className="fixed top-0 left-1/2 transform -translate-x-1/2 w-full md:w-full flex items-center justify-between px-6 md:px-10 py-4 shadow-lg bg-white/90 backdrop-blur-md z-50">
                <h2 className="text-2xl md:text-3xl font-bold text-orange-500">
                    Confera
                </h2>

                {/* Desktop Menu */}
                <div className="hidden sm:flex gap-5 md:gap-6 items-center text-sm md:text-base font-medium">
                    <button
                        onClick={handleGuestJoin}
                        className="flex items-center gap-2 hover:text-orange-500 transition"
                    >
                        <Users size={18} />
                        Join as Guest
                    </button>
                    <button
                        onClick={() => router("/auth")}
                        className="flex items-center gap-2 hover:text-orange-500 transition"
                    >
                        <UserPlus size={18} />
                        Register
                    </button>
                    <button
                        onClick={() => router("/auth")}
                        className="flex items-center gap-2 bg-orange-500 text-white px-3 md:px-4 py-2 rounded-xl hover:bg-orange-600 transition"
                    >
                        <LogIn size={18} />
                        Login
                    </button>
                </div>

                {/* Mobile Menu Toggle */}
                <button
                    className="sm:hidden text-gray-700 hover:text-orange-500 transition"
                    onClick={() => setMenuOpen(!menuOpen)}
                >
                    {menuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>

                {/* Animated Mobile Menu */}
                <AnimatePresence>
                    {menuOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3 }}
                            className="absolute top-full left-0 w-full bg-white/95 backdrop-blur-md shadow-md sm:hidden flex flex-col items-center py-4 space-y-3 border-t border-gray-200"
                        >
                            <button
                                onClick={() => {
                                    handleGuestJoin();
                                    setMenuOpen(false);
                                }}
                                className="flex items-center gap-2 hover:text-orange-500 transition"
                            >
                                <Users size={18} />
                                Join as Guest
                            </button>
                            <button
                                onClick={() => {
                                    router("/auth");
                                    setMenuOpen(false);
                                }}
                                className="flex items-center gap-2 hover:text-orange-500 transition"
                            >
                                <UserPlus size={18} />
                                Register
                            </button>
                            <button
                                onClick={() => {
                                    router("/auth");
                                    setMenuOpen(false);
                                }}
                                className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 transition"
                            >
                                <LogIn size={18} />
                                Login
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Hero Section */}
            <section className="flex flex-col md:flex-row items-center justify-between px-6 sm:px-10 md:px-20 lg:px-28 py-16 md:py-20">
                {/* Text Section */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-xl text-center md:text-left space-y-5 md:space-y-6"
                >
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight">
                        <span className="text-orange-500">Connect</span> with your loved ones
                    </h1>

                    <p className="text-base sm:text-lg text-gray-600 px-2 md:px-0">
                        Break distance barriers with{" "}
                        <span className="font-semibold text-orange-500">Confera</span> — the
                        easiest way to video call and chat with anyone, anywhere.
                    </p>

                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        className="inline-block"
                    >
                        <Link
                            to="/auth"
                            className="bg-orange-500 text-white font-semibold px-5 sm:px-6 py-3 rounded-xl shadow hover:bg-orange-600 transition"
                        >
                            Get Started
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Image Section */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="mt-10 md:mt-0 flex justify-center"
                >
                    <img
                        src="/mobile.png"
                        alt="App preview"
                        className="w-[260px] sm:w-[320px] md:w-[420px] drop-shadow-2xl"
                    />
                </motion.div>
            </section>

            {/* Features Section */}
            <section className="py-16 md:py-20 bg-white">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why Choose Confera?</h2>
                    <p className="text-gray-600 mb-10 sm:mb-12 text-base sm:text-lg">
                        Experience smooth, fast, and secure communication tools built for the
                        modern world.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
                        {features.map((f, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                className="bg-gray-50 p-6 sm:p-8 rounded-2xl shadow hover:shadow-lg transition"
                            >
                                <div className="flex justify-center mb-4">{f.icon}</div>
                                <h3 className="font-semibold text-lg sm:text-xl mb-2">
                                    {f.title}
                                </h3>
                                <p className="text-gray-600 text-sm sm:text-base">{f.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-16 md:py-20 bg-gray-50">
                <div className="max-w-5xl mx-auto px-6 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
                    <p className="text-gray-600 mb-10 sm:mb-12 text-base sm:text-lg">
                        Getting started with Confera is simple — just follow these three steps.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
                        {["Sign Up", "Create or Join Room", "Start Talking"].map(
                            (step, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.2 }}
                                    viewport={{ once: true }}
                                    className="p-6 sm:p-8 bg-white rounded-2xl shadow hover:shadow-lg transition"
                                >
                                    <div className="text-3xl sm:text-4xl font-bold text-orange-500 mb-3">
                                        {idx + 1}
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-semibold mb-2">
                                        {step}
                                    </h3>
                                    <p className="text-gray-600 text-sm sm:text-base">
                                        {idx === 0
                                            ? "Create your free account in seconds."
                                            : idx === 1
                                                ? "Share your room code or join an existing one."
                                                : "Connect instantly with friends, family, or colleagues."}
                                    </p>
                                </motion.div>
                            )
                        )}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white py-8 md:py-10 border-t border-gray-200 text-center">
                <p className="text-gray-600 text-sm sm:text-base">
                    © {new Date().getFullYear()}{" "}
                    <span className="font-semibold">Confera</span> — All rights reserved.
                </p>
            </footer>
        </div>
    );
}


export default withPublic(LandingPage);