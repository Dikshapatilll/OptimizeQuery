import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser();
try {
  await browser.launch();
  await browser.navigate("http://localhost:3000/benchmark", 2500);

  const buttons = await browser.eval(`
    Array.from(document.querySelectorAll('button')).map((b, i) => ({
      index: i,
      text: b.textContent.replace(/\\s+/g, ' ').trim(),
      classes: b.className
    }))
  `);
  console.log("All Buttons on Benchmark page:", JSON.stringify(buttons, null, 2));
} finally {
  await browser.close();
}
