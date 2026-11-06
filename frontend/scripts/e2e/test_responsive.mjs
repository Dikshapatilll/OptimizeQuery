import { CdpBrowser } from './cdp_browser.mjs';

const VIEWPORTS = [
  { name: "Desktop", width: 1440, height: 900 },
  { name: "Laptop", width: 1280, height: 800 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Mobile", width: 390, height: 844 },
];

const PAGES = [
  "/dashboard",
  "/analyze",
  "/benchmark",
  "/history",
  "/connections",
  "/settings",
];

const browser = new CdpBrowser();
try {
  await browser.launch();
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    await browser.setViewport(vp.width, vp.height);

    for (const path of PAGES) {
      await browser.navigate(`http://localhost:3000${path}`, 1500);

      const check = await browser.eval(`
        (() => {
          const bodyWidth = document.body.scrollWidth;
          const docWidth = document.documentElement.scrollWidth;
          const windowWidth = window.innerWidth;
          const hasHorizontalOverflow = docWidth > windowWidth + 1 || bodyWidth > windowWidth + 1;
          const navVisible = document.querySelector('aside')?.offsetParent !== null;
          return {
            path: ${JSON.stringify(path)},
            viewport: "${vp.name}",
            windowWidth,
            docWidth,
            hasHorizontalOverflow,
            navVisible
          };
        })()
      `);

      results.push(check);
      const statusStr = check.hasHorizontalOverflow ? "⚠️ OVERFLOW" : "✓ OK";
      console.log(`  ${check.path.padEnd(16)} -> ${statusStr} (doc: ${check.docWidth}px, win: ${check.windowWidth}px, nav: ${check.navVisible})`);
    }
  }

  const overflowIssues = results.filter(r => r.hasHorizontalOverflow);
  console.log(`\nTotal responsive tests: ${results.length}. Overflows detected: ${overflowIssues.length}`);
  if (overflowIssues.length > 0) {
    console.log("Pages with horizontal overflow:", overflowIssues);
  } else {
    console.log("All pages pass responsive viewport checks with 0 horizontal overflows!");
  }
} catch (e) {
  console.error("Responsive test error:", e);
} finally {
  await browser.close();
}
