// summaid-backend/src/types/request.d.ts
// This file declares custom types for Express.Request.
// It's a global declaration file, so no direct imports/exports at the top.

import { Request } from "express";
import { DecodedIdToken } from "firebase-admin/auth"; // Import DecodedIdToken for type safety

declare global {
  namespace Express {
    export interface Request {
      user?: DecodedIdToken; // Attach decoded Firebase user token
      // Add other custom properties to the Request object here if needed later
    }
  }
}

// You can optionally export an interface for explicit use if needed in some contexts,
// but the declare global namespace Express will augment the Request type everywhere.
export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}
