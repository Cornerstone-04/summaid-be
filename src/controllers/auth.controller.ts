import { Response } from "express";
import { AuthenticatedRequest } from "../types/request.d"; // Import AuthenticatedRequest

/**
 * Handles requests to get authenticated user profile.
 */
export const getAuthenticatedUserProfile = (
  req: AuthenticatedRequest,
  res: Response
) => {
  // Ensure req.user exists and is not null/undefined
  if (!req.user) {
    res.status(403).json({ message: "Forbidden: User not authenticated." });
    return;
  }

  // Safely access properties from req.user.user_metadata, with fallbacks
  const userMetadata = req.user.user_metadata || {};
  const displayName = userMetadata.name || req.user.email; // Fallback to email if name is not in metadata
  const userPicture = userMetadata.picture || null; // Null if picture is not in metadata

  res.status(200).json({
    message: "Authenticated user data retrieved.",
    uid: req.user.uid,
    email: req.user.email,
    displayName: displayName,
    picture: userPicture,
  });
};
