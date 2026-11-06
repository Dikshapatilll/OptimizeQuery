import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/history...");
  await browser.navigate("http://localhost:3000/history", 2500);

  const historyState = await browser.eval(`
    (() => {
      const searchInput = document.querySelector('input[type="text"], input[type="search"]');
      const tableRows = document.querySelectorAll('tr, .border.rounded-xl, [role="row"]').length;
      const text = document.body.innerText;
      return {
        hasSearch: !!searchInput,
        tableRows,
        hasHistoryEntries: text.includes('SELECT') || text.includes('ms') || text.includes('History'),
        snippet: text.slice(200, 800)
      };
    })()
  `);
  console.log("History Page State:", JSON.stringify(historyState, null, 2));

  // Test search filter
  if (historyState.hasSearch) {
    console.log("Testing search filter...");
    await browser.eval(`
      (() => {
        const input = document.querySelector('input[type="text"], input[type="search"]');
        if (input) {
          input.value = "orders";
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));
    const searchResult = await browser.eval(`
      (() => {
        return {
          filteredText: document.body.innerText.slice(200, 700),
          rows: document.querySelectorAll('tr, .border.rounded-xl').length
        };
      })()
    `);
    console.log("Search Result:", searchResult);
  }

  console.log("Console Errors on History:", browser.consoleErrors);
} catch (e) {
  console.error("History test failed:", e);
} finally {
  await browser.close();
}
