import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";

/**
 * Middleware to verify Supabase JWT token from Authorization header.
 * Attaches the decoded user token to req.user if authentication is successful.
 */
export const authenticateToken = async (
  req: Request, // Use standard Request instead of AuthenticatedRequest
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ message: "Unauthorized: No token provided or invalid format." });
    return;
  }

  const accessToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await authService.verifySupabaseToken(accessToken);
    req.user = decodedToken; // This now works thanks to module augmentation
    next();
  } catch (error: unknown) {
    console.error("Authentication failed:", error);

    // Handle specific error messages from authService
    const errorMessage =
      error instanceof Error ? error.message : "Invalid or expired token";
    res.status(403).json({ message: `Forbidden: ${errorMessage}` });
    return;
  }
};
