import { User } from "../models/users.model.js";
import httpStatus from "http-status";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Metting } from "../models/meetings.models.js";

// REGISTER
const register = async (req, res) => {
    const { name, username, password } = req.body;
    try {
        const userExist = await User.findOne({ username });
        if (userExist) {
            return res.status(httpStatus.CONFLICT).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, username, password: hashedPassword });
        await newUser.save();

        res.status(httpStatus.CREATED).json({ message: "User Registered" });
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${error}` });
    }
};

// LOGIN
const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: "Username and Password are required" });
        }

        const user = await User.findOne({ username });
        if (!user) return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid Username or Password" });

        const token = crypto.randomBytes(30).toString("hex");
        user.token = token;
        await user.save();

        res.status(httpStatus.OK).json({ token, user: { name: user.name, username: user.username } });
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${error}` });
    }
};

// AUTH TOKEN
const authToken = async (req, res) => {
    const { token } = req.query;
    try {
        if (!token) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid token" });

        res.status(httpStatus.OK).json({ user: { name: user.name, username: user.username } });
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${error}` });
    }
};

// GET USER HISTORY
const getUserHistory = async (req, res) => {
    const { token } = req.query;
    try {
        if (!token) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid token" });

        const meetings = await Metting.find({ user_id: user.username });
        res.status(httpStatus.OK).json(meetings);
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${error}` });
    }
};

// ADD TO USER HISTORY
const addToUserHistory = async (req, res) => {
    const { token, meeting_code } = req.body;
    try {
        if (!token) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid token" });

        const newMetting = new Metting({ user_id: user.username, meeting_code });
        await newMetting.save();

        res.status(httpStatus.CREATED).json({ message: "Added to history" });
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${error}` });
    }
};


// Delete History 


const deleteUserHistoryItem = async (req, res) => {
    const { token, meetingId } = req.body;

    try {
        if (!token) return res.status(401).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(401).json({ message: "Invalid token" });

        await Metting.deleteOne({ _id: meetingId, user_id: user.username });
        res.status(200).json({ message: "History item deleted" });
    } catch (error) {
        res.status(500).json({ message: `Something went wrong: ${error}` });
    }
};

const clearUserHistory = async (req, res) => {
    const { token } = req.body;

    try {
        if (!token) return res.status(401).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(401).json({ message: "Invalid token" });

        await Metting.deleteMany({ user_id: user.username });
        res.status(200).json({ message: "All history cleared" });
    } catch (error) {
        res.status(500).json({ message: `Something went wrong: ${error}` });
    }
};



export { login, register, getUserHistory, addToUserHistory, authToken, deleteUserHistoryItem, clearUserHistory };
