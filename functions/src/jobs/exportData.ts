import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Sentry from '@sentry/node';
import params from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

import { parse } from 'json2csv';
import { initializeFirebase } from '../config/firebase';
import { sendEmailNotification } from '../helpers/sendEmail';

export const exportData = async ({ userId, userEmail }: { userId: string; userEmail: string }) => {
  return Sentry.startSpan({ name: 'exportData', op: 'function.job.exportData' }, async () => {
    if (!userId) {
      throw new Error('User ID is required.');
    }

    try {
      const { db, storage } = initializeFirebase();

      // Validate collection name (you can add more validation as needed)
      const workspacesRef = db.collection('workspaces').doc(userId ?? '');

      if (!workspacesRef) {
        throw new Error(`Workspace Document for ID ${userId} not found.`);
      }

      // get events collection
      const eventsSnapshot = await workspacesRef.collection('events').get();
      const eventDocs = eventsSnapshot.docs;

      // Convert Firestore data to array
      // biome-ignore lint/suspicious/noExplicitAny: Firestore document data has dynamic structure
      const expensesData: any[] = [];

      // Process events and their expenses subcollection
      for (const eventDoc of eventDocs) {
        const eventData = eventDoc.data();

        // Get expenses subcollection for this event
        const expensesSnapshot = await eventDoc.ref.collection('expenses').get();
        const expenseDocs = expensesSnapshot.docs;

        // Process expenses for this event - each expense gets event data prepended
        for (const expenseDoc of expenseDocs) {
          const expenseData = expenseDoc.data();

          const paymentData = expenseData.oneOffPayment
            ? {
                expense_payment_name: expenseData.oneOffPayment.name,
                expense_payment_description: expenseData.oneOffPayment.description,
                expense_payment_amount: expenseData.oneOffPayment.amount,
                expense_payment_isPaid: expenseData.oneOffPayment.isPaid,
                expense_payment_date: expenseData.oneOffPayment.date?.toDate(),
                expense_payment_method: expenseData.oneOffPayment.method,
              }
            : expenseData.paymentSchedule?.length > 0
              ? {
                  expense_payment_name:
                    expenseData.paymentSchedule[expenseData.paymentSchedule.length - 1].name,
                  expense_payment_description:
                    expenseData.paymentSchedule[expenseData.paymentSchedule.length - 1].description,
                  expense_payment_amount: expenseData.paymentSchedule.reduce(
                    (total: number, payment: { amount: number }) => total + payment.amount,
                    0,
                  ),
                  expense_payment_isPaid:
                    expenseData.paymentSchedule[expenseData.paymentSchedule.length - 1].isPaid,
                  expense_payment_date:
                    expenseData.paymentSchedule[
                      expenseData.paymentSchedule.length - 1
                    ].date?.toDate(),
                  expense_payment_method:
                    expenseData.paymentSchedule[expenseData.paymentSchedule.length - 1].method,
                }
              : {};

          expensesData.push({
            // Event information (prefixed with event_)
            event_id: eventDoc.id,
            event_name: eventData.name,
            event_description: eventData.description,
            event_date: eventData.eventDate?.toDate(),
            event_created: eventData._createdDate?.toDate(),
            event_createdBy: eventData._createdBy,
            event_updated: eventData._updatedDate?.toDate(),
            eventData_updatedBy: eventData._updatedBy,

            // Expense information
            expense_id: expenseDoc.id,
            expense_date: expenseData.date?.toDate(),
            expense_name: expenseData.name,
            expense_description: expenseData.description,
            expense_amount: expenseData.amount,
            expense_currency: expenseData.currency,
            expense_notes: expenseData.notes,
            expense_category: expenseData.category.name,

            expense_vendor_name: expenseData.vendor?.name,
            expense_vendor_email: expenseData.vendor?.email,
            expense_vendor_website: expenseData.vendor?.website,
            expense_vendor_address: expenseData.vendor?.address,

            ...paymentData,
            expense_created: expenseData._createdDate?.toDate(),
            expense_createdBy: expenseData._createdBy,
            expense_updated: expenseData._updatedDate?.toDate(),
            expense_updatedBy: expenseData._updatedBy,
          });
        }
      }

      // If we have no expenses, throw an error
      if (expensesData.length === 0) {
        throw new HttpsError('not-found', `No expense data found for ${userEmail}.`);
      }

      // Convert JSON to CSV
      const csv = parse(expensesData);

      // Create temp file
      const timestamp = Date.now();
      const tempFilePath = path.join(os.tmpdir(), `expenses-export-${userId}-${timestamp}.csv`);
      fs.writeFileSync(tempFilePath, csv);

      // Upload to Firebase Storage
      const defaultBucket = params?.storageBucket?.value() || storage.bucket().name;
      console.log('Default bucket:', defaultBucket);
      const bucket = storage.bucket(defaultBucket);
      const storageFilePath = `users/${userId}/exports/event-expenses-${timestamp}.csv`;

      await bucket.upload(tempFilePath, {
        destination: storageFilePath,
        metadata: {
          contentType: 'text/csv',
        },
      });

      // Clean up temp file
      fs.unlinkSync(tempFilePath);

      const [url] = await bucket.file(storageFilePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Send email notification
      await sendEmailNotification({
        from: '"BudgetByMe" <noreply@BudgetByMe.com>',
        to: userEmail,
        subject: 'Your data export is ready',
        html: `
          <h2>Your data  export is ready</h2>
          <p>You requested an export of your expenses data with event information. Your file is now ready for download.</p>
          <p><a href="${url}">Click here to download your CSV file</a></p>
          <p>This link will expire in 7 days.</p>
        `,
      });

      // Optionally, also send a notification via Firebase messaging
      //await sendFirebaseNotification(userId, collectionName, url);

      // Return success with download URL
      return {
        success: true,
        message: `${userEmail} data exported successfully.`,
        downloadUrl: url,
      };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error exporting data:', error);
      return {
        success: false,
        message: `${error}`,
      };
    }
  });
};
