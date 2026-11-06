import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/settings...");
  await browser.navigate("http://localhost:3000/settings", 2500);

  const initialCheck = await browser.eval(`
    (() => {
      const text = document.body.innerText;
      const selects = Array.from(document.querySelectorAll('select')).map(s => s.value);
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, placeholder: i.placeholder }));
      return {
        hasProviders: text.includes('LLM Provider') || text.includes('Configuration') || text.includes('Google') || text.includes('Gemini'),
        hasMLTelemetry: text.includes('ML Model Engine') || text.includes('Random Forest') || text.includes('XGBoost') || text.includes('Active'),
        hasORSolverStatus: text.includes('Operations Research') || text.includes('PuLP') || text.includes('CBC') || text.includes('Knapsack'),
        buttons,
        selects,
        inputs
      };
    })()
  `);
  console.log("Settings Initial State:", JSON.stringify(initialCheck, null, 2));

  // Test Theme Toggle from Settings / Header
  console.log("Testing Theme Toggle button...");
  const initialTheme = await browser.eval(`document.documentElement.classList.contains('dark') ? 'dark' : 'light'`);
  console.log("Initial theme:", initialTheme);

  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Dark Mode|Light Mode/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const toggledTheme = await browser.eval(`document.documentElement.classList.contains('dark') ? 'dark' : 'light'`);
  console.log("Toggled theme:", toggledTheme);

  // Toggle back
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Dark Mode|Light Mode/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  console.log("Console Errors on Settings:", browser.consoleErrors);
} catch (e) {
  console.error("Settings test failed:", e);
} finally {
  await browser.close();
}
