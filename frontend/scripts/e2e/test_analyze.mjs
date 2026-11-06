import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/analyze...");
  await browser.navigate("http://localhost:3000/analyze", 3000);

  const initialCheck = await browser.eval(`
    (() => {
      const presets = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.includes('Workload') || t.includes('W1') || t.includes('W2') || t.includes('W3'));
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      const hasEditor = document.querySelector('.monaco-editor') !== null || document.querySelector('textarea') !== null;
      return { presets, buttons, hasEditor };
    })()
  `);
  console.log("Analyze Initial State:", JSON.stringify(initialCheck, null, 2));

  // Click on a preset button, e.g. "W1: Aggregation & Join" or first preset
  console.log("Clicking preset button...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1') || b.textContent.includes('Workload 1'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Find and click the "Analyze Query" button
  console.log("Clicking 'Analyze Query' button...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Analyze Query|Optimize Query/i.test(b.textContent));
      if (btn) btn.click();
      else throw new Error("Analyze button not found");
    })()
  `);

  console.log("Waiting for analysis results to arrive and render...");
  // Wait up to 10 seconds for results
  let gotResults = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await browser.eval(`
      (() => {
        const text = document.body.innerText;
        return {
          hasSummary: text.includes('Analysis Summary') || text.includes('SUMMARY') || text.includes('Cost'),
          hasML: text.includes('PREDICTED') || text.includes('Random Forest') || text.includes('Execution Time'),
          hasOR: text.includes('Operations Research') || text.includes('Alternative') || text.includes('Knapsack'),
          hasBottlenecks: text.includes('Bottlenecks') || text.includes('Sequential Scan') || text.includes('No issues'),
          hasTree: text.includes('EXPLAIN') || text.includes('Execution Tree'),
          snippet: text.slice(text.indexOf('Analysis Summary') > -1 ? text.indexOf('Analysis Summary') : 500, 1500)
        };
      })()
    `);
    if (check.hasSummary || check.hasML || check.hasOR) {
      gotResults = true;
      console.log("Results Rendered:", JSON.stringify(check, null, 2));
      break;
    }
  }

  console.log("Console Errors:", browser.consoleErrors);
  console.log("Network Errors:", browser.networkErrors);
} catch (e) {
  console.error("Test failed:", e);
} finally {
  await browser.close();
}
