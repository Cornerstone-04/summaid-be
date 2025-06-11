// summaid-backend/src/controllers/document.controller.ts
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/request.d";
import { documentProcessingService } from "../services/document.service";

/**
 * Handles requests to initiate document processing for a given session.
 * This controller initiates a long-running background task and responds
 * immediately with a 202 Accepted status. The actual processing status
 * will be updated in the database by the documentProcessingService.
 */
export const processDocument = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const authenticatedUser = req.user;
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ message: "Bad Request: sessionId is required." });
    return; // Explicitly return to end function execution
  }

  if (!authenticatedUser || !authenticatedUser.uid) {
    res
      .status(401)
      .json({
        message: "Unauthorized: User not authenticated or UID missing.",
      });
    return; // Explicitly return to end function execution
  }

  try {
    // Send an immediate 202 Accepted response.
    if (!res.headersSent) {
      res.status(202).json({
        message:
          "Document processing initiated. Check session status for updates.",
        sessionId: sessionId,
      });
    }

    // Initiate the long-running document processing in the background.
    // Errors during this background processing will be handled within the service.
    documentProcessingService
      .initiateProcessing(sessionId, authenticatedUser.uid)
      .catch((serviceError) => {
        // Log any unhandled errors that escape the documentProcessingService
        console.error(
          `Unhandled error in background document processing for session ${sessionId}:`,
          serviceError
        );
      });
  } catch (error: any) {
    // Handle synchronous errors that occur before the 202 response is sent.
    console.error(
      "Unexpected synchronous error in processDocument controller:",
      error
    );
    if (!res.headersSent) {
      res.status(500).json({
        message:
          error.message ||
          "Internal server error during document processing initiation.",
      });
    }
  }
};
