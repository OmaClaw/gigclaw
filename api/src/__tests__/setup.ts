// Test setup file
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock console methods during tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set default test timeout
jest.setTimeout(10000);
