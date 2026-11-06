import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/connections...");
  await browser.navigate("http://localhost:3000/connections", 2500);

  // Click "+Add Connection"
  console.log("Opening connection form...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Connection'));
      if (btn) btn.click();
      else throw new Error("Add Connection button not found");
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Verify form inputs
  const formCheck = await browser.eval(`
    (() => {
      const inputs = Array.from(document.querySelectorAll('input, select')).map(el => ({
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder
      }));
      const hasPasswordMasked = inputs.some(i => i.type === 'password');
      return { inputsCount: inputs.length, hasPasswordMasked, inputs };
    })()
  `);
  console.log("Form check after toggle:", JSON.stringify(formCheck, null, 2));

  // Fill in test connection fields
  console.log("Filling in test connection fields...");
  await browser.eval(`
    (() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      // Find by placeholder or position
      const nameInput = inputs.find(i => /name|production/i.test(i.placeholder || i.name));
      const hostInput = inputs.find(i => /host|localhost/i.test(i.placeholder || i.name));
      const portInput = inputs.find(i => /port|5432/i.test(i.placeholder || i.name || i.type === 'number'));
      const dbInput = inputs.find(i => /database|db/i.test(i.placeholder || i.name));
      const userInput = inputs.find(i => /user/i.test(i.placeholder || i.name));
      const passInput = inputs.find(i => i.type === 'password');

      if (nameInput) { nameInput.value = "QA Test DB"; nameInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (hostInput) { hostInput.value = "127.0.0.1"; hostInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (portInput) { portInput.value = "5432"; portInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (dbInput) { dbInput.value = "testdb"; dbInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (userInput) { userInput.value = "postgres"; userInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (passInput) { passInput.value = "secret123"; passInput.dispatchEvent(new Event('input', { bubbles: true })); }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // Click "Test Connection"
  console.log("Clicking 'Test Connection'...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Test Connection|Test/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  const testFeedback = await browser.eval(`
    (() => {
      const errorEl = document.querySelector('.text-rose-600, .text-rose-400, .text-red-500, .text-emerald-500, .text-emerald-600');
      return { feedback: errorEl?.textContent || 'No status message rendered' };
    })()
  `);
  console.log("Test Connection Feedback:", testFeedback);

  console.log("Console Errors on Connections:", browser.consoleErrors);
} catch (e) {
  console.error("Connections test failed:", e);
} finally {
  await browser.close();
}
