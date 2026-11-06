import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  await browser.navigate("http://localhost:3000/analyze", 2500);

  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('No Connection'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Analyze Query/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);

  console.log("Waiting 3s for API response and React re-render...");
  await new Promise(r => setTimeout(r, 3000));

  const domDump = await browser.eval(`
    (() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5')).map(h => h.textContent.trim());
      const bodyText = document.body.innerText;
      return {
        headings,
        textLength: bodyText.length,
        hasResultContainer: document.querySelector('.pt-6') !== null,
        errorBanner: document.querySelector('.text-rose-600, .text-rose-400')?.textContent || null,
        snippet: bodyText.slice(500, 2000)
      };
    })()
  `);

  console.log("DOM Dump:", JSON.stringify(domDump, null, 2));
  console.log("Console Errors:", browser.consoleErrors);
} catch (e) {
  console.error("Debug failed:", e);
} finally {
  await browser.close();
}
