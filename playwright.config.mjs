import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  expect:{timeout:7_500},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  workers:1,
  reporter:process.env.CI
    ?[['line'],['html',{outputFolder:'playwright-report',open:'never'}]]
    :[['list']],
  use:{
    ...devices['Desktop Chrome'],
    viewport:{width:390,height:844},
    isMobile:true,
    hasTouch:true,
    locale:'ru-RU',
    timezoneId:'Asia/Ho_Chi_Minh',
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'off',
  },
});
