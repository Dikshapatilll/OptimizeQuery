import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/analyze...");
  await browser.navigate("http://localhost:3000/analyze", 3000);

  // Click "No Connection" mode
  console.log("Switching to 'No Connection' mode...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('No Connection'));
      if (btn) btn.click();
      else throw new Error("No Connection button not found");
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Click preset W1: Join & Aggregation
  console.log("Clicking preset W1...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1'));
      if (btn) btn.click();
      else throw new Error("Preset W1 button not found");
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Click "Analyze Query"
  console.log("Clicking 'Analyze Query'...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Analyze Query/i.test(b.textContent));
      if (btn) btn.click();
      else throw new Error("Analyze button not found");
    })()
  `);

  console.log("Waiting for analysis results...");
  let found = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const text = await browser.eval(`document.body.innerText`);
    if (text.includes('Analysis & Optimization Output') || text.includes('ML Prediction') || text.includes('ANALYSIS SUMMARY')) {
      found = true;
      console.log("SUCCESS! Output found.");
      const details = await browser.eval(`
        (() => {
          return {
            hasML: document.body.innerText.includes('Random Forest') || document.body.innerText.includes('XGBoost') || document.body.innerText.includes('PREDICTED'),
            hasOR: document.body.innerText.includes('Operations Research') || document.body.innerText.includes('Knapsack') || document.body.innerText.includes('Ranked'),
            hasBottlenecks: document.body.innerText.includes('Bottleneck') || document.body.innerText.includes('Sequential Scan'),
            hasRecommendations: document.body.innerText.includes('Index Recommendations') || document.body.innerText.includes('CREATE INDEX') || document.body.innerText.includes('No index'),
            hasRewrites: document.body.innerText.includes('Query Rewrites') || document.body.innerText.includes('Original') || document.body.innerText.includes('No rewrite')
          };
        })()
      `);
      console.log("Diagnostic Panels Rendered:", JSON.stringify(details, null, 2));
      break;
    }
  }

  if (!found) {
    const errorText = await browser.eval(`document.querySelector('.text-rose-600, .text-rose-400')?.textContent || 'No error banner'`);
    console.error("Analysis did not render output. Banner:", errorText);
  }

  console.log("Console Errors:", browser.consoleErrors);
  console.log("Network Responses:", browser.httpResponses.map(r => `${r.status} ${r.url}`));
} catch (e) {
  console.error("Test failed with exception:", e);
} finally {
  await browser.close();
}
