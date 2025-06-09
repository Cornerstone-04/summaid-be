declare namespace Express {
  export interface Request {
    user?: import("firebase-admin/auth").DecodedIdToken; // Attach decoded Firebase user
  }
}
