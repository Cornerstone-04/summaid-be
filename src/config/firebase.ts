// summaid-backend/src/config/firebase.ts
import * as admin from "firebase-admin";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 } from "./env"; // NEW: Import the base64 string

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    // Check if app is not already initialized
    // --- NEW: Debugging log for base64 string length ---
    console.log(
      `DEBUG: FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 length: ${FIREBASE_SERVICE_ACCOUNT_KEY_BASE64.length}`
    );
    // --- END NEW ---

    if (FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
      // Decode the base64 string first, then parse the JSON
      const serviceAccountJson = Buffer.from(
        FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
        "base64"
      ).toString("utf8");
      const serviceAccount = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log(
        "✅ Firebase Admin SDK initialized using service account (Base64)."
      );
    } else {
      admin.initializeApp(); // Fallback if env var is empty
      console.warn(
        "⚠️ Firebase Admin SDK initialized without service account (FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is empty). This will cause authentication issues in deployment."
      );
    }
  }
} catch (error) {
  console.error(
    "❌ Failed to initialize Firebase Admin SDK or decode/parse service account key:",
    error
  );
  process.exit(1);
}

const db = getFirestore();
const auth = admin.auth();

export { db, auth, admin };
