// summaid-backend/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { AuthenticatedRequest } from "../types/request.d"; // NEW: Import AuthenticatedRequest

/**
 * Middleware to verify Firebase ID token from Authorization header.
 * Attaches the decoded user token to req.user if authentication is successful.
 */
export const authenticateToken = async (
  req: AuthenticatedRequest, // Use AuthenticatedRequest here
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

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await authService.verifyIdToken(idToken);
    req.user = decodedToken; // TypeScript now knows req.user exists
    next();
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    res.status(403).json({ message: "Forbidden: Invalid or expired token." });
    return;
  }
};
