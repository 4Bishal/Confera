import { createContext, useContext, useState } from "react";
import httpStatus from 'http-status';
import { useNavigate } from "react-router";
import axios from 'axios';


export const AuthContext = createContext({});


const client = axios.create({
    baseURL: "http://localhost:8000/api/v1/users", withCredentials: true
})


export const AuthProvider = ({ children }) => {
    const authContext = useContext(AuthContext);


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
            }
        } catch (err) {
            throw err
        }
    }

    const router = useNavigate();

    const data = {
        userData, setUserData, handleRegister, handleLogin
    }

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    )
}



