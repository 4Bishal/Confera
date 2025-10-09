import { createContext, useContext, useState } from "react";
import httpStatus from 'http-status';
import { useNavigate } from "react-router";
import axios from 'axios';
import server from "../environment.js";

export const AuthContext = createContext({});


const client = axios.create({
    baseURL: `${server}/api/v1/users`, withCredentials: true
})


export const AuthProvider = ({ children }) => {
    const authContext = useContext(AuthContext);

    const router = useNavigate();
    const [userData, setUserData] = useState(authContext);

    const handleRegister = async (name, username, password) => {
        try {
            let request = await client.post("/register", {
                name: name,
                username: username,
                password: password
            }, { withCredentials: true })

            if (request.status === httpStatus.CREATED) {
                return request.data.message
            }
        } catch (err) {
            throw err;
        }
    }

    const handleLogin = async (username, password) => {
        try {

            let request = await client.post("/login", {
                username: username,
                password: password
            }, { withCredentials: true })
            console.log(request);

            if (request.status === httpStatus.OK) {
                localStorage.setItem("token", request.data.token);
                router("/home")
            }
        } catch (err) {
            throw err
        }
    }

    const getHistoryOfUser = async () => {
        try {
            let request = await client.get("/get_all_activity", {
                params: {
                    token: localStorage.getItem("token")
                }
            })
            return request.data;
        } catch (error) {
            throw error
        }
    }

    const addToUserHistory = async (meetingCode) => {
        try {
            let request = await client.post("/add_to_activity", {
                token: localStorage.getItem("token"),
                meeting_code: meetingCode
            })
            return request
        } catch (error) {
            throw error
        }
    }

    const authToken = async (token) => {
        try {
            let request = await client.get("/auth_token", {
                token: token
            });
            return request
        } catch (error) {
            throw error
        }
    }


    const data = {
        userData, setUserData, handleRegister, handleLogin, getHistoryOfUser, addToUserHistory, authToken
    }

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    )
}



