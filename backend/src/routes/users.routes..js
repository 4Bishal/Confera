import { Router } from "express";
import { addToUserHistory, authToken, getUserHistory, login, register } from "../controllers/users.controllers.js";



const router = Router();



router.route("/login").post(login);
router.route("/register").post(register);
router.route("/add_to_activity").post(addToUserHistory);
router.route("/get_all_activity").get(getUserHistory);
router.route("/auth_token").get(authToken);


export default router;