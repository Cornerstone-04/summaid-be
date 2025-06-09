import * as admin from "firebase-admin";
import { FIREBASE_SERVICE_ACCOUNT_KEY_JSON } from "./env";

// Initialize Firebase Admin SDK
// For deployment, FIREBASE_SERVICE_ACCOUNT_KEY_JSON must be set as an environment variable
// with the entire content of your Firebase service account JSON key file.
try {
  if (!admin.apps.length) {
    if (FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
      const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin SDK initialized using service account.");
    } else {
      // For local development, if not using service account JSON env var,
      // Firebase might try to auto-init if gcloud auth is active.
      admin.initializeApp();
      console.log(
        "Firebase Admin SDK initialized (possibly via default credentials)."
      );
    }
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
}

const db = admin.firestore();
const auth = admin.auth(); // Export auth for ID token verification

export { db, auth, admin }; // Export admin itself for things like FieldValue
