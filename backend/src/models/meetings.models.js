import mongoose, { Schema } from "mongoose";


const mettingSchema = Schema({
    user_id: {
        type: String
    },
    meeting_code: {
        type: String,
        required: [true, "Metting Code is required!!"]
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    }
});


const Metting = mongoose.model("Metting", mettingSchema);

export { Metting };