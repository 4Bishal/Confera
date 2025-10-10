import React, { useState, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import authImage from "../assets/authImage.jpg";
import withPublic from "../utils/withPublic";

function Authentication() {
    const navigate = useNavigate();
    const { handleRegister, handleLogin } = useContext(AuthContext);

    const [formState, setFormState] = useState(0); // 0=Register, 1=Login
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAuth = async () => {
        try {
            setLoading(true);
            if (formState === 0) {
                const res = await handleRegister(name, username, password);
                console.log(res);
                setMessage(res);
                setFormState(1);
                setName("");
                setUsername("");
                setPassword("");
            } else {
                const res = await handleLogin(username, password);
                console.log(res);
                setMessage(res);
                setUsername("");
                setPassword("");
            }
            setError("");
        } catch (err) {
            setError(err.response?.data?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-[#fffaf5] to-[#ffe6cc]">
            {/* Left side with image and intro */}
            <div
                className="hidden md:flex md:w-1/2 items-center justify-center relative"
                style={{
                    backgroundImage: `url(${authImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF9839]/80 to-black/40"></div>
                <div className="z-10 text-center text-white px-10">
                    <h1 className="text-4xl font-bold">Welcome to Confera</h1>
                    <p className="mt-3 text-lg opacity-90">
                        Bridge the distance and stay connected with your loved ones.
                    </p>
                </div>
            </div>

            {/* Right side (form) */}
            <div className="flex-1 flex items-center justify-center relative p-6">
                <button
                    onClick={() => navigate("/")}
                    className="absolute top-6 left-6 text-[#FF9839] font-semibold hover:underline"
                >
                    ← Home
                </button>

                <div className="bg-white/80 backdrop-blur-md shadow-xl rounded-2xl w-full max-w-md px-8 py-10">
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                        {formState === 0 ? "Create an Account" : "Welcome Back"}
                    </h2>

                    {/* Toggle buttons */}
                    <div className="flex justify-center gap-3 mb-6">
                        <button
                            onClick={() => setFormState(0)}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${formState === 0
                                ? "bg-[#FF9839] text-white shadow-md"
                                : "border border-[#FF9839] text-[#FF9839] hover:bg-[#FF9839]/10"
                                }`}
                        >
                            Register
                        </button>
                        <button
                            onClick={() => setFormState(1)}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${formState === 1
                                ? "bg-[#FF9839] text-white shadow-md"
                                : "border border-[#FF9839] text-[#FF9839] hover:bg-[#FF9839]/10"
                                }`}
                        >
                            Login
                        </button>
                    </div>

                    {/* Form animation */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={formState}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {formState === 0 && (
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    className="w-full mb-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            )}
                            <input
                                type="text"
                                placeholder="Username"
                                className="w-full mb-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full mb-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            {error && (
                                <p className="text-red-500 text-sm text-left mb-2">{error}</p>
                            )}

                            <button
                                onClick={handleAuth}
                                disabled={loading}
                                className="w-full mt-2 bg-[#FF9839] hover:bg-[#e98025] text-white py-2 rounded-lg font-semibold shadow-md transition-all"
                            >
                                {loading
                                    ? "Processing..."
                                    : formState === 0
                                        ? "Register"
                                        : "Login"}
                            </button>

                            <p className="text-sm text-center mt-5 text-gray-600">
                                {formState === 0 ? "Already have an account?" : "New here?"}{" "}
                                <span
                                    className="text-[#FF9839] font-semibold cursor-pointer hover:underline"
                                    onClick={() => setFormState(formState === 0 ? 1 : 0)}
                                >
                                    {formState === 0 ? "Login" : "Register"}
                                </span>
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Message Snackbar */}
                    {message && (
                        <motion.p
                            key={message}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 text-center text-[#FF9839] text-sm"
                        >
                            {message}
                        </motion.p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default withPublic(Authentication);