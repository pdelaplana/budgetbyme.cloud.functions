import { initializeFirebase } from '../../config/firebase';
import { sendEmailNotification } from '../../helpers/sendEmail';
import { deleteAccount } from '../../jobs/deleteAccount';

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

// Mock node:fs
jest.mock('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(false), // Mock existsSync to return false (no service account file)
}));

// Mock firebase-functions
jest.mock('firebase-functions', () => {
  const mockStorageBucket = {
    value: jest.fn().mockReturnValue('test-bucket'),
  };

  return {
    params: {
      storageBucket: mockStorageBucket,
    },
  };
});

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
})); // Mock email sending
jest.mock('../../helpers/sendEmail', () => ({
  sendEmailNotification: jest.fn().mockResolvedValue({}),
}));

// Mock Sentry
jest.mock('@sentry/node', () => ({
  startSpan: jest.fn().mockImplementation((_, fn) => fn()),
  captureException: jest.fn(),
}));

describe('deleteAccount job', () => {
  const mockWorkspaceDocRef = {
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
    collection: jest.fn(),
  };

  const mockWorkspaceSnapshot = {
    exists: true,
    data: jest.fn().mockReturnValue({
      id: 'user1',
      name: 'Test Workspace',
    }),
  };

  const mockEventsCollection = {
    get: jest.fn(),
  };

  const mockEventsSnapshot = {
    docs: [
      {
        ref: {
          delete: jest.fn().mockResolvedValue({}),
          collection: jest.fn(),
        },
        id: 'event1',
      },
      {
        ref: {
          delete: jest.fn().mockResolvedValue({}),
          collection: jest.fn(),
        },
        id: 'event2',
      },
    ],
  };

  const mockExpensesSnapshot = {
    docs: [
      {
        ref: {
          delete: jest.fn().mockResolvedValue({}),
        },
        id: 'expense1',
      },
    ],
  };

  const mockCategoriesSnapshot = {
    docs: [
      {
        ref: {
          delete: jest.fn().mockResolvedValue({}),
        },
        id: 'category1',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup the initializeFirebase mock to return our test objects
    const mockBucket = {
      deleteFiles: jest.fn().mockResolvedValue([]),
      name: 'default-bucket',
    };

    const mockAuth = {
      deleteUser: jest.fn().mockResolvedValue({}),
    };

    const mockStorage = {
      bucket: jest.fn().mockReturnValue(mockBucket),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockWorkspaceDocRef),
      }),
    };

    const mockAdmin = {
      auth: jest.fn().mockReturnValue(mockAuth),
      storage: jest.fn().mockReturnValue(mockStorage),
    };

    (initializeFirebase as jest.Mock).mockReturnValue({
      admin: mockAdmin,
      db: mockDb,
      auth: mockAuth,
      storage: mockStorage,
      currentDatabaseId: 'development',
    });

    mockWorkspaceDocRef.get.mockResolvedValue(mockWorkspaceSnapshot);

    // Setup collection mocks
    mockWorkspaceDocRef.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'events') {
        return mockEventsCollection;
      }
      return {
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    mockEventsCollection.get.mockResolvedValue(mockEventsSnapshot);

    // Setup event subcollection mocks
    mockEventsSnapshot.docs.forEach((eventDoc) => {
      eventDoc.ref.collection.mockImplementation((subcollectionName: string) => {
        if (subcollectionName === 'expenses') {
          return { get: jest.fn().mockResolvedValue(mockExpensesSnapshot) };
        }
        if (subcollectionName === 'categories') {
          return { get: jest.fn().mockResolvedValue(mockCategoriesSnapshot) };
        }
        return { get: jest.fn().mockResolvedValue({ docs: [] }) };
      });
    });
  });

  it('should successfully delete account and all associated data', async () => {
    // Call the function
    const result = await deleteAccount({
      userId: 'user1',
      userEmail: 'user@example.com',
    });

    // Verify workspace lookup
    expect(mockWorkspaceDocRef.get).toHaveBeenCalled();

    // Verify subcollections were queried
    expect(mockWorkspaceDocRef.collection).toHaveBeenCalledWith('events');

    // Verify event subcollections were queried
    expect(mockEventsSnapshot.docs[0].ref.collection).toHaveBeenCalledWith('expenses');
    expect(mockEventsSnapshot.docs[0].ref.collection).toHaveBeenCalledWith('categories');
    expect(mockEventsSnapshot.docs[1].ref.collection).toHaveBeenCalledWith('expenses');
    expect(mockEventsSnapshot.docs[1].ref.collection).toHaveBeenCalledWith('categories');

    // Verify document deletion operations
    expect(mockExpensesSnapshot.docs[0].ref.delete).toHaveBeenCalled();
    expect(mockCategoriesSnapshot.docs[0].ref.delete).toHaveBeenCalled();
    expect(mockEventsSnapshot.docs[0].ref.delete).toHaveBeenCalled();
    expect(mockEventsSnapshot.docs[1].ref.delete).toHaveBeenCalled();
    expect(mockWorkspaceDocRef.delete).toHaveBeenCalled();

    // Get the mocked initializeFirebase result for verification
    const mockInitResult = (initializeFirebase as jest.Mock).mock.results[0].value;

    // Verify authentication deletion
    expect(mockInitResult.auth.deleteUser).toHaveBeenCalledWith('user1');

    // Verify storage cleanup
    expect(mockInitResult.storage.bucket).toHaveBeenCalled();
    expect(mockInitResult.storage.bucket().deleteFiles).toHaveBeenCalledWith({
      prefix: 'users/user1/',
    });

    // Verify email sent
    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Your account has been deleted',
      }),
    );

    // Verify successful result
    expect(result).toEqual({
      success: true,
      message: 'Account for user@example.com deleted successfully.',
      accountId: 'user1',
    });
  });

  it('should handle missing userId', async () => {
    await expect(deleteAccount({ userId: '', userEmail: 'user@example.com' })).rejects.toThrow(
      'User ID is required.',
    );
  });

  it('should handle non-existent account', async () => {
    // Setup mock to return a non-existent account
    mockWorkspaceDocRef.get.mockResolvedValue({
      exists: false,
    });

    // Call the function
    const result = await deleteAccount({
      userId: 'nonexistent',
      userEmail: 'user@example.com',
    });

    // Should fail with appropriate message
    expect(result).toEqual({
      success: false,
      message: expect.stringContaining('Workspace Doc with ID nonexistent not found'),
    });
  });

  it('should handle storage errors gracefully', async () => {
    // Setup a new mock with storage error for this test
    const mockBucket = {
      deleteFiles: jest.fn().mockRejectedValue(new Error('Storage error')),
      name: 'default-bucket',
    };

    const mockAuth = {
      deleteUser: jest.fn().mockResolvedValue({}),
    };

    const mockStorage = {
      bucket: jest.fn().mockReturnValue(mockBucket),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockWorkspaceDocRef),
      }),
    };

    const mockAdmin = {
      auth: jest.fn().mockReturnValue(mockAuth),
      storage: jest.fn().mockReturnValue(mockStorage),
    };

    (initializeFirebase as jest.Mock).mockReturnValue({
      admin: mockAdmin,
      db: mockDb,
      auth: mockAuth,
      storage: mockStorage,
      currentDatabaseId: 'development',
    });

    // Call the function
    const result = await deleteAccount({
      userId: 'user1',
      userEmail: 'user@example.com',
    });

    // Should still succeed despite storage error
    expect(result.success).toBe(true);
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
    const result = await deleteAccount({
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
