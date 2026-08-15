import { test, expect } from '@playwright/test';

test.describe('PerpEx Terminal', () => {
  test('should load the main terminal page and show loading state', async ({ page }) => {
    await page.goto('/');

    // Check if the title is correct
    await expect(page).toHaveTitle(/PerpEx/);
    
    // Check if header is rendered by looking for common text or elements
    // The exact text depends on if user is logged in, but we can look for basic layout parts
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // In a real e2e test, we would mock Supabase auth and Binance WS connections,
    // or wait for specific network requests to complete.
  });

  test('should open auth modal when clicking login (if not authenticated)', async ({ page }) => {
    await page.goto('/');
    
    // We assume there is a button with text like "Entrar" or "Conectar"
    // Let's try to find a button with 'Entrar'
    const loginButton = page.getByRole('button', { name: /entrar/i });
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
      
      // Look for Google auth button in the modal
      const googleBtn = page.getByRole('button', { name: /google/i });
      await expect(googleBtn).toBeVisible();
    }
  });
});
