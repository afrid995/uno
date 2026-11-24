import { chromium } from '@playwright/test';

async function run() {
  console.log('Testing keyboard navigation and focus management...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');

  // Test 1: Autofocus / Tab navigation to input
  const activeTag = await page.evaluate(() => document.activeElement?.id);
  console.log('Active element on landing page:', activeTag);

  // Type username via keyboard
  await page.keyboard.type('KeyMaster');
  await page.keyboard.press('Enter');

  // Wait for Dashboard
  await page.waitForURL(/\/dashboard/);
  console.log('Navigated to dashboard via Enter key!');

  // Open Create Room modal via keyboard
  const createBtn = page.locator('[data-testid="create-room-btn"]');
  await createBtn.focus();
  await page.keyboard.press('Enter');

  await page.waitForSelector('text=Select Game Variant');
  console.log('Opened Create Room modal via Enter key!');

  // Verify modal is open and has role="dialog"
  const dialog = page.locator('[role="dialog"]');
  console.log('Dialog role detected:', await dialog.getAttribute('role'));

  // Press Escape to dismiss
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const isDialogVisible = await dialog.isVisible();
  console.log('Dialog dismissed via Escape key? Closed successfully:', !isDialogVisible);

  await browser.close();
  console.log('Keyboard accessibility test completed successfully.');
}

run().catch(err => {
  console.error('Keyboard a11y failed:', err);
  process.exit(1);
});
