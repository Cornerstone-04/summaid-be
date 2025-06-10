// summaid-backend/src/config/env.ts
import dotenv from "dotenv";
dotenv.config();

// Export environment variables for easy access
export const PORT = process.env.PORT || 5000;
export const NODE_ENV = process.env.NODE_ENV || "development";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

// Firebase Service Account (JSON content as a string)
export const FIREBASE_SERVICE_ACCOUNT_KEY_JSON =
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON || "";
export const FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 =
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 || "";

// PostgreSQL Database URL
export const DATABASE_URL = process.env.DATABASE_URL || "";

// Add other environment variables as needed
export const NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED;
