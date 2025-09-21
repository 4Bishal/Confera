import { User } from "../models/users.model.js";
import httpStatus from "http-status";
import bcrypt, { hash } from "bcrypt";
import crypto from 'crypto';
import { Metting } from "../models/meetings.models.js";
const register = async (req, res) => {
    const { name, username, password } = req.body;

    try {
        const userExist = await User.findOne({ username });


        if (userExist) {
            return res.status(httpStatus.FOUND).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        res.status(httpStatus.CREATED).json({ message: "User Registered" });
    } catch (error) {
        res.status(httpStatus[500]).json({ message: `Something went wrong  ${error}` });
    }
};



const login = async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username) {
            res.status(httpStatus.BAD_REQUEST).json({ message: " Username cannot be empty" });
        }
        if (!password) {
            res.status(httpStatus.BAD_REQUEST).json({ message: " Password cannot be empty" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        let isPasswordCorrect = await bcrypt.compare(password, user.password)
        if (isPasswordCorrect) {
            let token = crypto.randomBytes(30).toString("hex");
            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token });
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid Username or Password" })
        }
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong  ${error}` });
    }
}

const getUserHistory = async (req, res) => {
    const { token } = req.query;

    try {
        const user = await User.findOne({ token: token })
        const meetings = await Metting.find({ user_id: user.username })
        res.json(meetings)
    } catch (error) {
        res.json({ message: `Something went wrong : ${error}` })
    }
}

const addToUserHistory = async (req, res) => {
    const { token, meeting_code } = req.body;
    try {
        const user = await User.findOne({ token: token });
        console.log(user)
        const newMetting = new Metting({
            user_id: user.username,
            meeting_code: meeting_code
        })

        await newMetting.save();
        res.status(httpStatus.CREATED).json({ message: "Added to history" })
    } catch (error) {
        res.json({ message: `Something went wrong : ${error}` })
    }
}


export { login, register, getUserHistory, addToUserHistory };