import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Ensure env variables are loaded
dotenv.config();

try {
    if (!admin.apps.length) {
        // 1. Parse the single-line JSON string from the .env file back into a JavaScript object
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        // 2. Pass the whole object directly to Firebase
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        
        console.log("✅ Firebase Admin initialized securely from parsed .env JSON.");
    }
} catch (error) {
    console.error("❌ Firebase Admin Initialization Error:", error);
}

export default admin;