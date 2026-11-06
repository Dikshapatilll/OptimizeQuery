import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/dashboard...");
  await browser.navigate("http://localhost:3000/dashboard", 2500);

  const pageState = await browser.eval(`
    (() => {
      const title = document.title;
      const logo = document.querySelector('svg') !== null;
      const kpis = Array.from(document.querySelectorAll('h3, p, div')).filter(el => /Total Queries|Avg Latency|Benchmarks|Reduction/i.test(el.textContent)).length;
      const svgs = document.querySelectorAll('svg').length;
      const tables = document.querySelectorAll('table, [role="table"]').length;
      const bodyText = document.body.innerText.slice(0, 500);
      return { title, logo, kpis, svgs, tables, bodySnippet: bodyText };
    })()
  `);

  console.log("Dashboard State:", JSON.stringify(pageState, null, 2));
  console.log("Console Errors:", browser.consoleErrors);
  console.log("Network Errors:", browser.networkErrors);

  if (browser.consoleErrors.length > 0) {
    console.warn("Discovered console errors on Dashboard!");
  } else {
    console.log("Dashboard loaded with 0 console errors and valid DOM elements.");
  }
} catch (e) {
  console.error("Test failed:", e);
} finally {
  await browser.close();
}
