// summaid-backend/src/types/request.d.ts
import { Request } from "express";

// Define the expected structure of a decoded Supabase JWT payload
export interface SupabaseDecodedToken {
  aud: string; // audience
  exp: number; // expiration time
  iat: number; // issued at time
  iss: string; // issuer
  sub: string; // subject (user ID)
  email?: string;
  phone?: string;
  app_metadata: {
    provider?: string;
    [key: string]: any;
  };
  user_metadata: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
    [key: string]: any;
  };
  role: string;
  uid?: string; // Added for compatibility
}

// Extend Express Request to include authenticated user
export interface AuthenticatedRequest extends Request {
  user?: SupabaseDecodedToken;
}

// Declare global module augmentation to override Express types
declare global {
  namespace Express {
    interface Request {
      user?: SupabaseDecodedToken;
    }
  }
}
