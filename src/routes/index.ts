// summaid-backend/src/routes/index.ts
import { Router } from "express";
// Import your specific routers here as they are created
// import authRoutes from './auth.routes';
// import summarizationRoutes from './summarization.routes';

const router = Router();

// Define a simple test route for this router
router.get("/test", (req, res) => {
  res.status(200).json({ message: "API v1 router is working!" });
});

// Use your specific routers
// router.use('/auth', authRoutes);
// router.use('/summarization', summarizationRoutes);

export default router;
