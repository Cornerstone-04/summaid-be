// summaid-backend/src/controllers/document.controller.ts
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/request.d"; // Ensure this path is correct
import { documentProcessingService } from "../services/document.service"; // Import the new service

/**
 * Handles requests to initiate document processing for a given session.
 */
export const processDocument = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const authenticatedUser = req.user;

  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ message: "Bad Request: sessionId is required." });
    return;
  }

  if (!authenticatedUser) {
    res.status(401).json({ message: "Unauthorized: User not authenticated." });
    return;
  }

  try {
    // Call the service to initiate processing (it will run in the background)
    // We don't await the full processing, but rather let the service start it
    // and update Firestore status. The frontend observes Firestore changes.
    // For a long-running process, you might use a message queue or a background task.
    // For now, we'll just await the initiation and let the service handle the rest.
    documentProcessingService
      .initiateProcessing(sessionId, authenticatedUser.uid)
      .then((result) => {
        console.log(
          `Background processing started for session ${sessionId}. Result:`,
          result
        );
        // Respond quickly to the frontend that processing has started
        res.status(202).json({
          message:
            "Document processing initiated successfully. Check session status.",
          sessionId: sessionId,
        });
      })
      .catch((serviceError) => {
        console.error(
          `Error in document processing service for session ${sessionId}:`,
          serviceError
        );
        // If the *initiation* itself fails, send a 500 error
        res.status(500).json({
          message: `Failed to initiate document processing: ${
            serviceError.message || "Unknown error."
          }`,
        });
      });
    return; // Return immediately after sending 202 or handling initial error
  } catch (error: any) {
    console.error("Unexpected error in processDocument controller:", error);
    res.status(500).json({
      message:
        error.message ||
        "Internal server error during document processing initiation.",
    });
    return;
  }
};
