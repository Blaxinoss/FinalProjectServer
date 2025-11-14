// services/firebaseAdmin.ts
import admin, { type ServiceAccount } from "firebase-admin";

const FIREBASE_ADMIN_STRING = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!FIREBASE_ADMIN_STRING) {
    console.error("⚠️ CRITICAL: FIREBASE_ADMIN_PRIVATE_KEY is not set in environment variables.");
    throw new Error("FIREBASE_ADMIN_PRIVATE_KEY is not set. Firebase Admin SDK cannot initialize.");
}

let serviceAccount: ServiceAccount;
try {
    serviceAccount = JSON.parse(FIREBASE_ADMIN_STRING) as ServiceAccount;
} catch (error: any) {
    console.error("⚠️ CRITICAL: Couldn't parse the FIREBASE_ADMIN_PRIVATE_KEY JSON string.", error.message);
    throw new Error("Failed to parse Firebase service account JSON. Check .env file.");
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin SDK Initialized Successfully.");
} else {
    console.log("Firebase Admin SDK already initialized.");
}

export { admin };