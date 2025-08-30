import * as fs from 'node:fs';

import { initializeFirebase } from '../../config/firebase';
import { sendEmailNotification } from '../../helpers/sendEmail';
import { exportData } from '../../jobs/exportData';

// Mock the firebase config module
jest.mock('../../config/firebase', () => {
  const mockDb = {
    collection: jest.fn(),
  };

  const mockAdmin = {
    auth: jest.fn(),
    storage: jest.fn(),
    apps: { length: 0 },
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
  };

  return {
    initializeFirebase: jest.fn(() => ({
      admin: mockAdmin,
      db: mockDb,
      auth: mockAdmin.auth(),
      storage: mockAdmin.storage(),
      currentDatabaseId: 'development',
    })),
    databaseId: {
      value: jest.fn().mockReturnValue('development'),
    },
    storageBucket: {
      value: jest.fn().mockReturnValue('test-bucket'),
    },
  };
});

jest.mock('node:fs', () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false), // Mock existsSync to return false (no service account file)
}));

// Mock firebase-functions
jest.mock('firebase-functions', () => ({
  params: {
    storageBucket: {
      value: jest.fn().mockReturnValue('test-bucket'),
    },
  },
}));

// Mock firebase-functions/v2
jest.mock('firebase-functions/v2', () => ({
  params: {
    projectID: {
      value: jest.fn().mockReturnValue('test-project-id'),
    },
  },
}));

// Mock firebase-functions params
jest.mock('firebase-functions/params', () => ({
  defineString: jest.fn((_name, config) => ({
    value: jest.fn().mockReturnValue(config.default),
  })),
}));
jest.mock('../../helpers/sendEmail', () => ({
  sendEmailNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('@sentry/node', () => ({
  startSpan: jest.fn().mockImplementation((_, fn) => fn()),
  captureException: jest.fn(),
}));

describe('exportData job', () => {
  const bucket = {
    name: 'test-bucket',
    upload: jest.fn().mockResolvedValue([]),
    file: jest.fn().mockReturnValue({
      getSignedUrl: jest.fn().mockResolvedValue(['https://download-url.com']),
    }),
  };

  const mockWorkspaceRef = {
    collection: jest.fn(),
    get: jest.fn(),
  };

  const mockEventsSnapshot = {
    docs: [
      {
        id: 'event1',
        ref: {
          collection: jest.fn(),
        },
        data: () => ({
          name: 'Test Event',
          description: 'A test event',
          eventDate: { toDate: () => new Date('2025-01-15') },
          _createdDate: { toDate: () => new Date('2025-01-15') },
          _createdBy: 'user1',
          _updatedDate: { toDate: () => new Date('2025-01-15') },
          _updatedBy: 'user1',
        }),
      },
    ],
  };

  const mockExpensesSnapshot = {
    docs: [
      {
        id: 'expense1',
        data: () => ({
          name: 'Test Expense',
          description: 'A test expense',
          amount: 100,
          currency: 'USD',
          notes: 'Test notes',
          category: { name: 'Food' },
          vendor: {
            name: 'Test Vendor',
            email: 'vendor@example.com',
            website: 'vendor.com',
            address: '123 Test St',
          },
          oneOffPayment: {
            name: 'One-off payment',
            description: 'Single payment',
            amount: 100,
            isPaid: true,
            date: { toDate: () => new Date('2025-01-15') },
            method: 'card',
          },
          paymentSchedule: [],
          date: { toDate: () => new Date('2025-01-15') },
          _createdDate: { toDate: () => new Date('2025-01-15') },
          _createdBy: 'user1',
          _updatedDate: { toDate: () => new Date('2025-01-15') },
          _updatedBy: 'user1',
        }),
      },
    ],
  };

  const mockWorkspaceSnapshot = {
    data: () => ({
      id: 'user1',
      name: 'Test Workspace',
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup the initializeFirebase mock to return our test objects
    const mockStorage = {
      bucket: jest.fn(() => bucket),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockWorkspaceRef),
      }),
    };

    const mockAdmin = {
      storage: jest.fn().mockReturnValue(mockStorage),
    };

    (initializeFirebase as jest.Mock).mockReturnValue({
      admin: mockAdmin,
      db: mockDb,
      storage: mockStorage,
      currentDatabaseId: 'development',
    });

    mockWorkspaceRef.get.mockResolvedValue(mockWorkspaceSnapshot);

    mockWorkspaceRef.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'events') {
        return { get: jest.fn().mockResolvedValue(mockEventsSnapshot) };
      }
      return { get: jest.fn().mockResolvedValue({ docs: [] }) };
    });

    // Setup event expenses subcollection
    mockEventsSnapshot.docs.forEach((eventDoc) => {
      eventDoc.ref.collection.mockImplementation((subcollectionName: string) => {
        if (subcollectionName === 'expenses') {
          return { get: jest.fn().mockResolvedValue(mockExpensesSnapshot) };
        }
        return { get: jest.fn().mockResolvedValue({ docs: [] }) };
      });
    });
  });

  it('should successfully export data', async () => {
    // Call the function
    const result = await exportData({
      userId: 'user1',
      userEmail: 'user@example.com',
    });

    // Get the mocked initializeFirebase result for verification
    const mockInitResult = (initializeFirebase as jest.Mock).mock.results[0].value;

    // Verify database operations
    expect(mockInitResult.db.collection).toHaveBeenCalledWith('workspaces');
    expect(mockInitResult.db.collection().doc).toHaveBeenCalledWith('user1');

    // Verify Firestore queries
    expect(mockWorkspaceRef.collection).toHaveBeenCalledWith('events');

    // Verify event expenses subcollection was queried
    expect(mockEventsSnapshot.docs[0].ref.collection).toHaveBeenCalledWith('expenses');

    // Verify file operations
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();

    // Verify storage operations
    expect(mockInitResult.storage.bucket).toHaveBeenCalled();
    expect(mockInitResult.storage.bucket().upload).toHaveBeenCalled();
    expect(mockInitResult.storage.bucket().file).toHaveBeenCalledWith(
      expect.stringMatching(/users\/user1\/exports\/event-expenses-.*\.csv/),
    );

    // Verify email sent
    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Your data export is ready',
      }),
    );

    // Verify successful result
    expect(result).toEqual({
      success: true,
      message: 'user@example.com data exported successfully.',
      downloadUrl: 'https://download-url.com',
    });
  });

  it('should handle missing userId', async () => {
    await expect(exportData({ userId: '', userEmail: 'user@example.com' })).rejects.toThrow(
      'User ID is required.',
    );
  });

  it('should handle no expenses data', async () => {
    // Mock empty expenses collections
    mockEventsSnapshot.docs.forEach((eventDoc) => {
      eventDoc.ref.collection.mockImplementation((subcollectionName: string) => {
        if (subcollectionName === 'expenses') {
          return { get: jest.fn().mockResolvedValue({ docs: [] }) };
        }
        return { get: jest.fn().mockResolvedValue({ docs: [] }) };
      });
    });

    // Call the function
    const result = await exportData({
      userId: 'user1',
      userEmail: 'user@example.com',
    });

    // Should fail with appropriate message
    expect(result).toEqual({
      success: false,
      message: expect.stringContaining('No expense data found'),
    });
  });

  it('should handle errors during execution', async () => {
    // Force an error in the database operation
    const mockDb = {
      collection: jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      }),
    };

    (initializeFirebase as jest.Mock).mockReturnValue({
      admin: {},
      db: mockDb,
    });

    // Call the function
    const result = await exportData({
      userId: 'user1',
      userEmail: 'user@example.com',
    });

    // Should return failure
    expect(result).toEqual({
      success: false,
      message: expect.stringContaining('Test error'),
    });
  });
});
