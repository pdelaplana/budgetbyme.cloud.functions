import Sentry from '@sentry/node';
import { initializeFirebase } from '../config/firebase';
import { sendEmailNotification } from '../helpers/sendEmail';

export const deleteAccount = async ({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) => {
  return Sentry.startSpan({ name: 'deleteAccount', op: 'function.job.deleteAccount' }, async () => {
    if (!userId) {
      throw new Error('User ID is required.');
    }

    try {
      const { auth, db, storage } = initializeFirebase();

      // Get a reference to the workspace document
      const workspaceRef = db.collection('workspaces').doc(userId);

      // Get workspace data before deletion (for audit/confirmation purposes)
      const workspaceSnapshot = await workspaceRef.get();

      if (!workspaceSnapshot.exists) {
        throw new Error(`Workspace Doc with ID ${userId} not found.`);
      }

      // Delete subcollections recursively
      // Note: Firestore doesn't automatically delete subcollections when a document is deleted

      // 1. Delete events subcollection and their nested subcollections
      const eventsSnapshot = await workspaceRef.collection('events').get();

      for (const eventDoc of eventsSnapshot.docs) {
        // Delete expenses subcollection for this event
        const expensesSnapshot = await eventDoc.ref.collection('expenses').get();
        const deleteExpensesPromises = expensesSnapshot.docs.map(async (expenseDoc) => {
          await expenseDoc.ref.delete();
        });
        await Promise.all(deleteExpensesPromises);

        // Delete categories subcollection for this event
        const categoriesSnapshot = await eventDoc.ref.collection('categories').get();
        const deleteCategoriesPromises = categoriesSnapshot.docs.map(async (categoryDoc) => {
          await categoryDoc.ref.delete();
        });
        await Promise.all(deleteCategoriesPromises);

        // Delete the event document itself
        await eventDoc.ref.delete();
      }

      // 2. Delete the workspace document
      await workspaceRef.delete();

      // 3. Delete user from Firebase Authentication
      await auth.deleteUser(userId);

      // 4. Delete user's storage files
      try {
        // Get storage bucket name from parameters or use default
        const defaultBucket = storage.bucket().name;
        console.log('Default bucket:', defaultBucket);
        const bucket = storage.bucket(defaultBucket);

        await bucket.deleteFiles({
          prefix: `users/${userId}/`,
        });
      } catch (storageError) {
        // Log but don't fail if storage deletion has issues
        console.warn(`Storage cleanup error for user ${userId}:`, storageError);
        Sentry.captureException(storageError);
      }

      // Send confirmation email
      await sendEmailNotification({
        from: '"BudgetByMe" <noreply@BudgetByMe.com>',
        to: userEmail,
        subject: 'Your account has been deleted',
        html: `
          <h2>Account Deletion Confirmation</h2>
          <p>Hello,</p>
          <p>This is a confirmation that your BudgetByMe account and all associated data have been successfully deleted from our system.</p>
          <p>We're sorry to see you go. If you have any feedback about your experience with BudgetByMe, please feel free to reply to this email.</p>
          <p>If you deleted your account by mistake or wish to rejoin in the future, you'll need to create a new account.</p>
          <p>Thank you for using BudgetByMe.</p>
        `,
      });

      return {
        success: true,
        message: `Account for ${userEmail} deleted successfully.`,
        accountId: userId,
      };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error deleting account:', error);
      return {
        success: false,
        message: `${error}`,
      };
    }
  });
};
