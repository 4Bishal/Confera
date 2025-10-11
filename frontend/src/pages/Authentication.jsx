import React, { useState, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import authImage from "../assets/authImage.jpg";
import { User, Mail, Lock, Loader } from "lucide-react";
import withPublic from "../utils/withPublic";

function Authentication() {
    const navigate = useNavigate();
    const { handleRegister, handleLogin } = useContext(AuthContext);

    const [formState, setFormState] = useState(0); // 0=Register, 1=Login

    const [registerData, setRegisterData] = useState({ name: "", username: "", password: "" });
    const [registerMessage, setRegisterMessage] = useState("");
    const [registerError, setRegisterError] = useState("");
    const [registerLoading, setRegisterLoading] = useState(false);

    const [loginData, setLoginData] = useState({ username: "", password: "" });
    const [loginMessage, setLoginMessage] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);

    const clearRegister = () => setRegisterData({ name: "", username: "", password: "" });
    const clearLogin = () => setLoginData({ username: "", password: "" });

    const handleAuth = async () => {
        if (formState === 0) {
            try {
                setRegisterLoading(true);
                setRegisterError("");
                const res = await handleRegister(registerData.name, registerData.username, registerData.password);
                setRegisterMessage(res);
                clearRegister();
                setTimeout(() => setFormState(1), 1000);
            } catch (err) {
                setRegisterError(err.response?.data?.message || "Something went wrong");
            } finally {
                setRegisterLoading(false);
            }
        } else {
            try {
                setLoginLoading(true);
                setLoginError("");
                const res = await handleLogin(loginData.username, loginData.password);
                setLoginMessage(res);
                clearLogin();
            } catch (err) {
                setLoginError(err.response?.data?.message || "Something went wrong");
            } finally {
                setLoginLoading(false);
            }
        }
    };

    // Handle Enter key submit
    const handleKeyPress = (e) => {
        if (e.key === "Enter") handleAuth();
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-[#fffaf5] to-[#ffe6cc]">
            {/* Left side */}
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
                            onClick={() => { setFormState(0); clearRegister(); }}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${formState === 0
                                ? "bg-[#FF9839] text-white shadow-md"
                                : "border border-[#FF9839] text-[#FF9839] hover:bg-[#FF9839]/10"
                                }`}
                        >
                            Register
                        </button>
                        <button
                            onClick={() => { setFormState(1); clearLogin(); }}
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
                        {formState === 0 ? (
                            <motion.div
                                key="register"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                onKeyDown={handleKeyPress}
                            >
                                <div className="space-y-3">
                                    <div className="relative">
                                        <User size={18} className="absolute left-3 top-3 text-[#FF9839]" />
                                        <input
                                            type="text"
                                            placeholder="Full Name"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                            value={registerData.name}
                                            onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="relative">
                                        <Mail size={18} className="absolute left-3 top-3 text-[#FF9839]" />
                                        <input
                                            type="text"
                                            placeholder="Username"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                            value={registerData.username}
                                            onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-3 top-3 text-[#FF9839]" />
                                        <input
                                            type="password"
                                            placeholder="Password"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                            value={registerData.password}
                                            onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                                        />
                                    </div>

                                    {registerError && <p className="text-red-500 text-sm mb-2">{registerError}</p>}

                                    <button
                                        onClick={handleAuth}
                                        disabled={registerLoading}
                                        className="w-full mt-2 bg-[#FF9839] hover:bg-[#e98025] text-white py-2 rounded-lg font-semibold shadow-md transition-all flex justify-center items-center gap-2"
                                    >
                                        {registerLoading && <Loader className="animate-spin" size={18} />}
                                        {registerLoading ? "Processing..." : "Register"}
                                    </button>

                                    {registerMessage && <p className="mt-4 text-center text-[#FF9839] text-sm">{registerMessage}</p>}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="login"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                onKeyDown={handleKeyPress}
                            >
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Mail size={18} className="absolute left-3 top-3 text-[#FF9839]" />
                                        <input
                                            type="text"
                                            placeholder="Username"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                            value={loginData.username}
                                            onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-3 top-3 text-[#FF9839]" />
                                        <input
                                            type="password"
                                            placeholder="Password"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF9839] focus:outline-none"
                                            value={loginData.password}
                                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                                        />
                                    </div>

                                    {loginError && <p className="text-red-500 text-sm mb-2">{loginError}</p>}

                                    <button
                                        onClick={handleAuth}
                                        disabled={loginLoading}
                                        className="w-full mt-2 bg-[#FF9839] hover:bg-[#e98025] text-white py-2 rounded-lg font-semibold shadow-md transition-all flex justify-center items-center gap-2"
                                    >
                                        {loginLoading && <Loader className="animate-spin" size={18} />}
                                        {loginLoading ? "Processing..." : "Login"}
                                    </button>

                                    {loginMessage && <p className="mt-4 text-center text-[#FF9839] text-sm">{loginMessage}</p>}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

export default withPublic(Authentication);
