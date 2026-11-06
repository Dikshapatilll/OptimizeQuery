import { CdpBrowser } from './cdp_browser.mjs';
import http from 'node:http';

// 1. Create a share link via backend API
const shareData = JSON.stringify({
  sql_query: "SELECT id, name FROM users WHERE age > 25",
  schema_ddl: "CREATE TABLE users (id INT, name TEXT, age INT);",
  llm_response: JSON.stringify({
    summary: "Shared QA Test Analysis",
    bottlenecks: [],
    indexes: [],
    rewrites: []
  })
});

const req = http.request("http://127.0.0.1:8000/api/v1/share", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(shareData)
  }
}, (res) => {
  let body = "";
  res.on("data", c => body += c);
  res.on("end", async () => {
    const json = JSON.parse(body);
    const linkId = json.link_id;
    console.log("Created share link:", linkId);

    const browser = new CdpBrowser();
    try {
      await browser.launch();

      // Test valid share link
      console.log(`Navigating to http://localhost:3000/p/${linkId}...`);
      await browser.navigate(`http://localhost:3000/p/${linkId}`, 2500);

      const validState = await browser.eval(`
        (() => {
          const text = document.body.innerText;
          return {
            hasSql: text.includes('SELECT id, name FROM users'),
            hasSharedBadge: text.includes('Shared Analysis') || text.includes('Shared Query'),
            snippet: text.slice(200, 700)
          };
        })()
      `);
      console.log("Valid Share Page State:", validState);

      // Test invalid share link
      console.log("Navigating to http://localhost:3000/p/invalid9999...");
      await browser.navigate("http://localhost:3000/p/invalid9999", 2500);

      const invalidState = await browser.eval(`
        (() => {
          const text = document.body.innerText;
          return {
            hasNotFound: text.includes('not found') || text.includes('Not Found') || text.includes('Invalid') || text.includes('expired'),
            snippet: text.slice(200, 600)
          };
        })()
      `);
      console.log("Invalid Share Page State:", invalidState);

      console.log("Console Errors during Share testing:", browser.consoleErrors);
    } catch (e) {
      console.error("Share test failed:", e);
    } finally {
      await browser.close();
    }
  });
});

req.write(shareData);
req.end();
