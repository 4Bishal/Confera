import { createContext, useContext, useState, useEffect } from "react";
import httpStatus from "http-status";
import { useNavigate } from "react-router";
import axios from "axios";
import server from "../environment.js";

export const AuthContext = createContext({});

const client = axios.create({
    baseURL: `${server}/api/v1/users`,
    withCredentials: true,
});


export const AuthProvider = ({ children }) => {
    const router = useNavigate();
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    const token = localStorage.getItem("token");

    // Check token on mount
    useEffect(() => {
        const checkToken = async () => {
            if (token) {
                try {
                    const res = await authToken(token);
                    if (res?.data) setUserData(res.data);
                    else localStorage.removeItem("token");
                } catch (err) {
                    localStorage.removeItem("token");
                    setUserData(null);
                }
            }
            setLoading(false);
        };
        checkToken();
    }, []);

    // Register new user
    const handleRegister = async (name, username, password) => {
        try {
            const request = await client.post("/register", { name, username, password });
            if (request.status === httpStatus.CREATED) return request.data.message;
        } catch (err) {
            throw err;
        }
    };

    // Login user
    const handleLogin = async (username, password) => {
        try {
            const request = await client.post("/login", { username, password });
            if (request.status === httpStatus.OK) {
                localStorage.setItem("token", request.data.token);

                // Fetch user info after login
                const res = await authToken(request.data.token);
                setUserData(res.data);

                router("/home");
            }
        } catch (err) {
            throw err;
        }
    };

    // Verify token
    const authToken = async (token) => {
        if (!token) return null;
        try {
            const request = await client.get("/auth_token", { params: { token } });
            return request;
        } catch (error) {
            throw error;
        }
    };

    // Logout
    const logout = () => {
        localStorage.removeItem("token");
        setUserData(null);
        router("/auth");
    };

    // Get user meeting history
    const getHistoryOfUser = async () => {
        try {
            const token = localStorage.getItem("token");
            const request = await client.get("/get_all_activity", { params: { token } });
            return request.data;
        } catch (error) {
            throw error;
        }
    };

    // Add meeting to user history
    const addToUserHistory = async (meetingCode) => {
        try {
            const token = localStorage.getItem("token");
            const request = await client.post("/add_to_activity", { token, meeting_code: meetingCode });
            return request.data;
        } catch (error) {
            throw error;
        }
    };

    // Delete single history item
    const deleteUserHistoryItem = async (meetingId) => {
        try {
            const token = localStorage.getItem("token");
            const request = await client.post("/delete_activity", { token, meetingId });
            return request.data;
        } catch (error) {
            throw error;
        }
    };

    // Clear all history
    const clearUserHistory = async () => {
        try {
            const token = localStorage.getItem("token");
            const request = await client.post("/clear_activity", { token });
            return request.data;
        } catch (error) {
            throw error;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                userData,
                loading,
                setUserData,
                handleRegister,
                handleLogin,
                authToken,
                logout,
                getHistoryOfUser,
                addToUserHistory,
                deleteUserHistoryItem,
                clearUserHistory,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
