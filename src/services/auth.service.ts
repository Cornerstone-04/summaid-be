import { SUPABASE_JWT_SECRET } from "../config/env";
import jwt from "jsonwebtoken";

// Define the expected structure of a decoded Supabase JWT payload
interface SupabaseDecodedToken {
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
  uid?: string;
}

class AuthService {
  /**
   * Verifies a Supabase JWT.
   * @param token The Supabase JWT string from the client.
   * @returns A decoded Supabase JWT payload if valid.
   * @throws An error if the token is invalid or expired.
   */
  async verifySupabaseToken(token: string): Promise<SupabaseDecodedToken> {
    if (!SUPABASE_JWT_SECRET) {
      throw new Error(
        "Supabase JWT secret not configured in environment variables."
      );
    }

    try {
      // Verify the token using the JWT secret
      // jwt.verify automatically handles expiration, signature validity etc.
      const decoded = jwt.verify(
        token,
        SUPABASE_JWT_SECRET
      ) as SupabaseDecodedToken;

      decoded.uid = decoded.sub;

      return decoded;
    } catch (error) {
      console.error("Error verifying Supabase JWT:", error);
      // Re-throw a more specific error for client-side handling
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Authentication token has expired.");
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid authentication token.");
      }
      throw new Error("Failed to verify authentication token.");
    }
  }
}

export const authService = new AuthService();
