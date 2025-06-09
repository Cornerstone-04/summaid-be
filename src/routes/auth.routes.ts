import { Router } from "express";
import { getAuthenticatedUserProfile } from "../controllers/auth.controller"; // Import your controller
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

// Define a protected route: it will first pass through authenticateToken
router.get("/profile", authenticateToken, getAuthenticatedUserProfile);

export default router;
