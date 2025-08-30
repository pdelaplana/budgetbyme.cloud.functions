import * as Sentry from '@sentry/node';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeFirebase } from '../config/firebase';
import type { Job } from '../types/jobTypes';

export const queueJob = onCall(async (request) => {
  return Sentry.startSpan(
    { name: 'queueJob', op: 'function.https.onCall', attributes: request.data },
    async () => {
      // Check if user is authenticated
      if (request?.auth === null) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to use this function.');
      }

      if (!request.data.jobType) {
        throw new HttpsError('invalid-argument', 'Job type is required.');
      }

      const userId = request.auth?.uid;
      const userEmail = request.auth?.token.email;

      if (!userId) {
        throw new HttpsError('invalid-argument', 'User ID is required.');
      }

      const { jobType, priority, ...data } = request.data;

      try {
        const { db } = initializeFirebase();
        // Create a task with standard fields plus any custom data
        const job: Job = {
          // Standard task fields
          userId: userId,
          userEmail: userEmail,
          jobType: jobType,
          status: 'pending',
          priority: priority || 1,
          createdAt: Timestamp.now(),
          completedAt: null,
          errors: [],
          attempts: 0,

          // Any additional task-specific data
          ...data.taskData,
        };

        // Add to the tasks collection

        console.log(`Database Id: ${db.databaseId}`);
        console.log(`Queueing job: ${JSON.stringify(job)}`);
        const jobRef = await db.collection('jobs').add(job);
        const jobId = jobRef.id;

        console.log(`Task queued: ${jobId} (Type: ${jobType})`);

        return {
          success: true,
          message: `Your ${jobType} task has been queued.`,
          jobId,
        };
      } catch (error) {
        Sentry.captureException(error);

        throw new HttpsError('internal', `Error adding task to queue: ${error}`);
      }
    },
  );
});
