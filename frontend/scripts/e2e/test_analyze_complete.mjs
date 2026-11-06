import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  await browser.navigate("http://localhost:3000/analyze", 2500);

  // Switch to No Connection
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('No Connection'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // Select Preset W1
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // Click Analyze Query
  console.log("Submitting Analyze Query...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Analyze Query/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);

  console.log("Polling for full analysis results (up to 20s)...");
  let completed = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const resultCheck = await browser.eval(`
      (() => {
        const text = document.body.innerText;
        if (text.includes('Analysis & Optimization Output') || text.includes('ML Execution-Time Prediction') || text.includes('Operations Research') || text.includes('PREDICTED')) {
          const cards = Array.from(document.querySelectorAll('h3, h4')).map(h => h.textContent.trim());
          return {
            done: true,
            cards,
            hasSummary: text.includes('Analysis Summary') || text.includes('AST'),
            hasMLPrediction: text.includes('PREDICTED') || text.includes('Random Forest') || text.includes('XGBoost'),
            hasORRanking: text.includes('Operations Research') || text.includes('Knapsack') || text.includes('Rank 1'),
            hasBottlenecks: text.includes('Bottleneck'),
            hasRecommendations: text.includes('Index Recommendations'),
            hasRewrites: text.includes('Query Rewrites'),
            snippet: text.slice(text.indexOf('Analysis & Optimization Output'), text.indexOf('Analysis & Optimization Output') + 600)
          };
        }
        return { done: false, loading: text.includes('Extracting AST & Scoring') };
      })()
    `);

    if (resultCheck.done) {
      completed = true;
      console.log("Analysis Completed Successfully!");
      console.log(JSON.stringify(resultCheck, null, 2));
      break;
    }
  }

  if (!completed) {
    console.error("Analysis did not complete within timeout.");
  }

  console.log("Console Errors:", browser.consoleErrors);
} catch (e) {
  console.error("Test error:", e);
} finally {
  await browser.close();
}
