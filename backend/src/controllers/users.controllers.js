import { User } from "../models/users.model.js";
import httpStatus from "http-status";
import bcrypt, { hash } from "bcrypt";
import crypto from 'crypto';

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
            res.status(httpStatus.NOT_FOUND).json("User not found");
        }
        if (bcrypt.compare(password, user.password)) {
            let token = crypto.randomBytes(30).toString("hex");
            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token });
        }
    } catch (error) {
        res.status(httpStatus[500]).json({ message: `Something went wrong  ${error}` });
    }


}


export { login, register };