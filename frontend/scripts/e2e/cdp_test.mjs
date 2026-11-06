import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const chromeProc = spawn(CHROME_PATH, [
  "--headless=new",
  "--remote-debugging-port=9222",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/chrome_test_profile"
]);

await new Promise(r => setTimeout(r, 2000));

http.get("http://127.0.0.1:9222/json/version", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log("CDP Connected successfully:", JSON.parse(data).Browser);
    chromeProc.kill();
    process.exit(0);
  });
}).on("error", (err) => {
  console.error("CDP connect failed:", err.message);
  chromeProc.kill();
  process.exit(1);
});
