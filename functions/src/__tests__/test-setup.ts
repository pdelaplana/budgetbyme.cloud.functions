import functionsTest from 'firebase-functions-test';

// Initialize firebase-functions-test
const test = functionsTest();

// Export for use in tests
export { test };

// Mock firebase-functions/params to avoid runtime parameter issues in tests
jest.mock('firebase-functions/params', () => ({
  defineString: jest.fn((_name: string, config: { default?: string }) => ({
    value: () => config.default || 'mock-value',
  })),
}));

// Mock Admin SDK initialization to avoid credential errors
jest.mock('firebase-admin', () => {
  const mockCollection = {
    add: jest.fn(),
    doc: jest.fn(),
    get: jest.fn(),
  };

  const mockBucket = {
    upload: jest.fn(),
    file: jest.fn().mockReturnValue({
      getSignedUrl: jest.fn(),
    }),
    deleteFiles: jest.fn(),
  };

  // Create a consistent firestore mock instance
  const mockFirestore = {
    collection: jest.fn().mockReturnValue(mockCollection),
    settings: jest.fn(),
  };

  return {
    apps: [], // Mock the apps array for admin.apps.length check
    initializeApp: jest.fn(),
    credential: {
      applicationDefault: jest.fn(),
      cert: jest.fn(),
    },
    firestore: jest.fn().mockReturnValue(mockFirestore),
    storage: jest.fn().mockReturnValue({
      bucket: jest.fn().mockReturnValue(mockBucket),
    }),
    auth: jest.fn().mockReturnValue({
      verifyIdToken: jest.fn(),
      deleteUser: jest.fn(),
    }),
  };
});

// Clean up function to run after tests
export const cleanup = async () => {
  test.cleanup();
};

// Mock console.log to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(async () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  await cleanup();
});
