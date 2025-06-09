// summaid-backend/src/server.ts
import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env file

import app from "./app"; // Import your Express app

const PORT = process.env.PORT || 5000; // Use port 5000 as common for backends

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
