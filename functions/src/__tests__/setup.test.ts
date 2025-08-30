import { test } from './test-setup';

describe('Test Setup', () => {
  it('should initialize firebase-functions-test', () => {
    expect(test).toBeDefined();
  });

  it('should have Jest globals available', () => {
    expect(jest).toBeDefined();
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
  });
});
