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

app.use(cors());

app.use(express.json({ limit: "40kb" }));

app.use(express.urlencoded({ limit: "40kb", extended: true }));


app.use("/api/v1/users", userRoutes);

app.get("/test", (req, res) => {
    return res.json({ message: "Hello" });
});


const start = async () => {
    const connectionDb = await mongoose.connect(process.env.MONGO_URL);
    console.log(`Connection established with host  : ${connectionDb.connection.host}`);
    server.listen(app.get("port"), () => {
        console.log("App listening on 8000!!!");
    })
}


start();