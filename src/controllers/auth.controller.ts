import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/request.d"; // NEW: Import AuthenticatedRequest

/**
 * Handles requests to get authenticated user profile.
 */
export const getAuthenticatedUserProfile = (
  req: AuthenticatedRequest,
  res: Response
) => {
  // TypeScript now knows req.user exists due to AuthenticatedRequest
  if (!req.user) {
    res.status(403).json({ message: "Forbidden: User not authenticated." });
    return;
  }

  res.status(200).json({
    message: "Authenticated user data retrieved.",
    uid: req.user.uid,
    email: req.user.email,
    displayName: req.user.name || req.user.email,
    picture: req.user.picture,
  });
};
