import * as fs from 'node:fs';
import * as admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import { defineString } from 'firebase-functions/params';
import { params } from 'firebase-functions/v2';

export const databaseId = defineString('DATABASE_ID', {
  default: '(default)',
  description: 'The ID of the Firestore database to use',
});
export const storageBucket = defineString('STORAGE_BUCKET', {
  default: 'budgetbyme-f7fc6.firebasestorage.app',
  description: 'The name of the Firebase Storage bucket',
});

let dbInstance: FirebaseFirestore.Firestore | undefined;
let authInstance: Auth | undefined;
let storageInstance: Storage | undefined;
let adminInstance: typeof admin | undefined;
let currentDatabaseId: string;

export const initializeFirebase = () => {
  if (adminInstance && dbInstance && authInstance && storageInstance) {
    return {
      admin: adminInstance,
      db: dbInstance,
      auth: authInstance,
      storage: storageInstance,
    };
  }

  try {
    currentDatabaseId = databaseId.value();

    const serviceAccountPath = './firebase-service-account.json';

    if (fs.existsSync(serviceAccountPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        storageBucket: storageBucket.value(),
      });
      console.log(`Using service account from file: ${serviceAccountPath}`);
    } else {
      admin.initializeApp();
    }
    console.log(`Firebase Admin SDK initialized successfully with database: ${currentDatabaseId}`);

    // Get project ID from parameters
    const projectId = params.projectID.value();

    if (!projectId) {
      throw new Error('Project ID not found in Firebase app configuration');
    }

    dbInstance = new Firestore({
      projectId, // Get the project ID from your initialized Firebase app
      databaseId: currentDatabaseId, // Use the actual environment variable value
      keyFilename: serviceAccountPath, // Use the service account file if it exists
    });

    authInstance = admin.auth();
    storageInstance = admin.storage();

    console.log(`Firestore initialized successfully with database: ${currentDatabaseId}`);

    adminInstance = admin;
    return {
      admin: adminInstance,
      db: dbInstance,
      auth: authInstance,
      storage: storageInstance,
    };
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
  }
};

export const getCurrentDatabaseId = () => {
  return databaseId.value();
};
