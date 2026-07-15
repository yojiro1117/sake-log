import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 150_000,
  expect: { timeout: 20_000 },
  retries: 2,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://yojiro1117.github.io/sake-log/',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'iPhone', use: { ...devices['iPhone 13'] } },
    { name: 'Android', use: { ...devices['Pixel 5'] } },
    { name: 'iPhoneSE-375', use: { ...devices['iPhone SE'] } },
    { name: 'AndroidLarge-430', use: { ...devices['Galaxy S9+'], viewport: { width: 430, height: 932 } } }
  ]
});
