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
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Analyze Query/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);

  console.log("Waiting for results...");
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const done = await browser.eval(`document.body.innerText.includes('Analysis & Optimization Output')`);
    if (done) break;
  }

  // Click "Open Index Selector"
  console.log("Opening Knapsack Index Selector...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Open Index Selector'));
      if (btn) btn.click();
      else throw new Error("Open Index Selector button not found");
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  const sliderState = await browser.eval(`
    (() => {
      const slider = document.querySelector('#budget-slider');
      return {
        hasSlider: !!slider,
        val: slider?.value
      };
    })()
  `);
  console.log("Slider revealed:", sliderState);

  // Click "Solve Optimal Selection"
  console.log("Clicking Solve Optimal Selection...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Solve Optimal Selection'));
      if (btn) btn.click();
      else throw new Error("Solve button not found");
    })()
  `);

  // Wait for solver result
  console.log("Waiting for Knapsack solver result...");
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const resText = await browser.eval(`
      (() => {
        const text = document.body.innerText;
        if (text.includes('Optimal') || text.includes('Solver Status') || text.includes('Storage Consumed')) {
          return {
            hasStatus: text.includes('Optimal') || text.includes('Optimal'),
            snippet: text.slice(text.indexOf('Solver Status'), text.indexOf('Solver Status') + 300)
          };
        }
        return null;
      })()
    `);
    if (resText) {
      console.log("Knapsack Solver Output:", JSON.stringify(resText, null, 2));
      break;
    }
  }

  console.log("Console Errors:", browser.consoleErrors);
} catch (e) {
  console.error("Knapsack test failed:", e);
} finally {
  await browser.close();
}
