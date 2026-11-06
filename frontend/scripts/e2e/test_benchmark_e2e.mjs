import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  console.log("Navigating to http://localhost:3000/benchmark...");
  await browser.navigate("http://localhost:3000/benchmark", 2500);

  // 1. Select Preset W1
  console.log("Selecting Preset W1...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1'));
      if (btn) btn.click();
      else throw new Error("Preset W1 button not found");
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // 2. Adjust runs count slider to 3
  console.log("Adjusting trial slider to 3 runs...");
  await browser.eval(`
    (() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) {
        slider.value = 3;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // 3. Click "Execute Controlled Benchmark"
  console.log("Clicking 'Execute Controlled Benchmark'...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Execute.*Benchmark/i.test(b.textContent));
      if (btn) btn.click();
      else throw new Error("Execute Benchmark button not found");
    })()
  `);

  // 4. Poll for benchmark execution completion
  console.log("Waiting for benchmark results (up to 30s)...");
  let benchDone = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const res = await browser.eval(`
      (() => {
        const text = document.body.innerText;
        if (text.includes('WARM MEDIAN') || text.includes('INITIAL RUN') || text.includes('SPEEDUP') || text.includes('Buffer Reads') || text.includes('Buffer Hits')) {
          const hasCsvBtn = Array.from(document.querySelectorAll('button')).some(b => /Export CSV|CSV/i.test(b.textContent));
          const hasPdfBtn = Array.from(document.querySelectorAll('button')).some(b => /Export PDF|PDF/i.test(b.textContent));
          const hasEquivalence = text.includes('Identical') || text.includes('Equivalence') || text.includes('Results Match');
          const hasConfidenceInterval = text.includes('95% CI') || text.includes('±') || text.includes('Student');
          return {
            completed: true,
            hasInitialRun: text.includes('INITIAL RUN'),
            hasWarmMedian: text.includes('WARM MEDIAN'),
            hasBufferTelemetry: text.includes('Buffer Hits') || text.includes('Buffer Reads'),
            hasSpeedup: text.includes('SPEEDUP') || text.includes('Reduction'),
            hasCsvBtn,
            hasPdfBtn,
            hasEquivalence,
            hasConfidenceInterval,
            snippet: text.slice(text.indexOf('WARM MEDIAN') > -1 ? text.indexOf('WARM MEDIAN') - 50 : 200, 1000)
          };
        }
        return { completed: false, loading: text.includes('Executing') || text.includes('Isolated') };
      })()
    `);

    if (res.completed) {
      benchDone = true;
      console.log("Benchmark Completed Successfully!");
      console.log(JSON.stringify(res, null, 2));
      break;
    }
  }

  if (!benchDone) {
    const errorText = await browser.eval(`document.querySelector('.text-rose-600, .text-rose-400, .text-red-500')?.textContent || 'No error'`);
    console.error("Benchmark failed to complete. Error banner:", errorText);
  }

  // 5. Test Export CSV and Export PDF buttons
  if (benchDone) {
    console.log("Testing CSV Export click...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /Export CSV|CSV/i.test(b.textContent));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    console.log("Testing PDF Export click...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /Export PDF|PDF/i.test(b.textContent));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 6. Test History Tab
  console.log("Switching to History tab...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /History/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const historyCheck = await browser.eval(`
    (() => {
      const rows = document.querySelectorAll('tr, .border.rounded-xl').length;
      const text = document.body.innerText;
      return {
        rows,
        hasHistory: text.includes('Baseline') || text.includes('SELECT') || text.includes('Benchmark')
      };
    })()
  `);
  console.log("History Tab State:", historyCheck);

  // 7. Test Trends Tab
  console.log("Switching to Trends tab...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /Trends/i.test(b.textContent));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const trendsCheck = await browser.eval(`
    (() => {
      const svgs = document.querySelectorAll('svg').length;
      return { svgs, textSnippet: document.body.innerText.slice(200, 600) };
    })()
  `);
  console.log("Trends Tab State:", trendsCheck);

  console.log("Console Errors during benchmark:", browser.consoleErrors);
} catch (e) {
  console.error("Benchmark test failed:", e);
} finally {
  await browser.close();
}
