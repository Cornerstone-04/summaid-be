// summaid-backend/src/routes/document.routes.ts
import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware"; // Import your auth middleware
import { processDocument } from "../controllers/document.controller"; // Import your controller

const router = Router();

// Define the POST route for initiating document processing
// It's protected by the authenticateToken middleware.
router.post("/process", authenticateToken, processDocument);

export default router;
