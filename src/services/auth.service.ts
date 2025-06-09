import { auth } from "../config/firebase";

class AuthService {
  /**
   * Verifies a Firebase ID token.
   * @param idToken The Firebase ID token string.
   * @returns A decoded Firebase ID token if valid.
   * @throws An error if the token is invalid or expired.
   */
  async verifyIdToken(idToken: string) {
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error("Error verifying Firebase ID token:", error);
      // Re-throw a more specific error or handle it as needed
      throw new Error("Invalid or expired authentication token.");
    }
  }
}

export const authService = new AuthService();
