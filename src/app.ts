// summaid-backend/src/app.ts
import express from "express";
import cors from "cors";
import routes from "./routes"; // Import your root router

const app = express();

app.use(cors()); // Enable CORS for all origins (for development)
app.use(express.json()); // Enable JSON body parsing

// Root route for API versioning or health check
app.get("/", (req, res) => {
  res.status(200).json({ message: "SummAid Backend API is running!" });
});

// Mount your main API routes
app.use("/api/v1", routes); // All your API routes will be under /api/v1

export default app;
