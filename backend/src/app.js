import express, { urlencoded } from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";

import cors from "cors";

import dotenv from 'dotenv';
import { connectToSocket } from "./controllers/socketManager.js";

import userRoutes from "./routes/users.routes..js"


dotenv.config();



const app = express();

const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT || 8000));

app.use(cors({
    origin: (origin, callback) => {
        const allowed = [
            "https://confera-08ud.onrender.com/",
            "http://localhost:5173",
        ];
        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS not allowed for this origin"));
        }
    },
    credentials: true,
}));



app.use(express.json({ limit: "40kb" }));

app.use(express.urlencoded({ limit: "40kb", extended: true }));


app.use("/api/v1/users", userRoutes);



const start = async () => {
    const connectionDb = await mongoose.connect(process.env.MONGO_URL);
    console.log(`Connection established with host  : ${connectionDb.connection.host}`);
    server.listen(app.get("port"), () => {
        console.log("App listening on 8000!!!");
    })
}


start();