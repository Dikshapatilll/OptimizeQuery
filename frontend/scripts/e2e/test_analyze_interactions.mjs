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

  // 1. Test Share Link
  console.log("Testing Share Link button...");
  await browser.eval(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Share Link'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const shareState = await browser.eval(`
    (() => {
      return {
        hasCopiedNotice: document.body.innerText.includes('copied to clipboard') || document.body.innerText.includes('/p/'),
        btnText: Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Share'))?.textContent || ''
      };
    })()
  `);
  console.log("Share Link Result:", shareState);

  // 2. Test Knapsack budget slider / input
  console.log("Testing Knapsack budget slider...");
  const budgetTest = await browser.eval(`
    (() => {
      const slider = document.querySelector('input[type="range"]');
      const numberInput = document.querySelector('input[type="number"]');
      if (slider) {
        slider.value = 50;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        hasSlider: !!slider,
        sliderVal: slider?.value,
        hasNumberInput: !!numberInput,
        numVal: numberInput?.value
      };
    })()
  `);
  console.log("Knapsack Budget Selector:", budgetTest);

  // 3. Test inline Benchmark buttons
  console.log("Testing inline Benchmark buttons on index / rewrite...");
  const benchmarkBtns = await browser.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button, a')).filter(el => /Benchmark|Compare/i.test(el.textContent));
      return btns.map(b => ({
        tag: b.tagName,
        text: b.textContent.trim(),
        href: b.getAttribute('href')
      }));
    })()
  `);
  console.log("Inline Benchmark Action Targets:", benchmarkBtns);

  console.log("Console Errors during interactions:", browser.consoleErrors);
} catch (e) {
  console.error("Interaction test error:", e);
} finally {
  await browser.close();
}
