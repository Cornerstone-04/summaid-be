// summaid-backend/src/routes/index.ts
import { Router } from "express";
import userRoutes from "./auth.routes"; // Import your user routes
import documentRoutes from "./document.routes"; // NEW: Import document processing routes

const router = Router();

// Define a simple test route for this router (already exists)
router.get("/test", (req, res) => {
  res.status(200).json({ message: "API v1 router is working!" });
});

// Use your specific routers
router.use("/users", userRoutes); // Mount user routes under /api/v1/users
router.use("/documents", documentRoutes); // NEW: Mount document routes under /api/v1/documents

export default router;
