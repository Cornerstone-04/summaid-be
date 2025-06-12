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

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";

// PostgreSQL Database URL
export const DATABASE_URL = process.env.DATABASE_URL || "";
