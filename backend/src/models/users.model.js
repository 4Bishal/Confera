import mongoose from "mongoose";

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: [true, "Username is required!"],
        unique: true,
    },
    name: {
        type: String,
        required: [true, "Name is required!"],
    },
    password: {
        type: String,
        required: [true, "Password is required!"],
        unique: true,
    },
    token: {
        type: String
    }
});

const User = mongoose.model("User", userSchema);

export { User };
