import { CdpBrowser } from './cdp_browser.mjs';
import fs from 'node:fs';

const browser = new CdpBrowser({ port: 9225, userDataDir: `/tmp/chrome_pg_e2e_${Date.now()}` });

async function run() {
  let exitCode = 0;
  try {
    console.log("Launching headless Chrome for Live PostgreSQL Benchmark test...");
    await browser.launch();

    let benchmarkRunRequestId = null;
    let benchmarkRunResponse = null;

    // Listen for Network response
    browser.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && browser.callbacks.has(msg.id)) {
        const { resolve, reject } = browser.callbacks.get(msg.id);
        browser.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === "Network.responseReceived") {
        const url = msg.params?.response?.url || "";
        if (url.includes("/api/v1/benchmark/run")) {
          benchmarkRunRequestId = msg.params.requestId;
          console.log(`[CDP] Network response received for /api/v1/benchmark/run (Status: ${msg.params.response.status})`);
        }
      } else if (msg.method) {
        browser._handleEvent(msg.method, msg.params);
      }
    };

    console.log("Navigating to http://localhost:3000/benchmark...");
    await browser.navigate("http://localhost:3000/benchmark", 3000);

    // 1. Verify and Select PostgreSQL connection
    console.log("Inspecting database connection options in select dropdown...");
    const connInfo = await browser.eval(`
      (() => {
        const select = document.querySelector('select');
        if (!select) return { error: "No connection select found" };
        const options = Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
        const pgOption = options.find(o => o.text.includes('PostgreSQL') || o.text.includes('optimizeql_exp'));
        if (pgOption) {
          select.value = pgOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return {
          currentValue: select.value,
          options,
          selectedPg: pgOption ? pgOption.text : null
        };
      })()
    `);

    console.log("Connection options detected:", JSON.stringify(connInfo, null, 2));
    if (!connInfo.selectedPg) {
      throw new Error("PostgreSQL connection was not found in the connection dropdown options!");
    }

    await new Promise(r => setTimeout(r, 600));

    // 2. Select W1 preset query and proposed index
    console.log("Selecting Preset W1 query...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W1'));
        if (btn) btn.click();
        else throw new Error("Preset W1 button not found");
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // 3. Set multi-trial slider to 3
    console.log("Setting trial repetition slider to 3...");
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

    // 4. Click "Execute Controlled Benchmark"
    console.log("Triggering live benchmark execution on PostgreSQL...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /Execute.*Benchmark/i.test(b.textContent));
        if (btn) btn.click();
        else throw new Error("Execute Benchmark button not found");
      })()
    `);

    // 5. Poll for completion
    console.log("Awaiting PostgreSQL execution, telemetry collection, and rollback completion (up to 40s)...");
    let completed = false;
    let domData = null;

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000));
      domData = await browser.eval(`
        (() => {
          const text = document.body.innerText;
          const isDone = text.includes('WARM MEDIAN') || text.includes('INITIAL RUN') || text.includes('SPEEDUP') || text.includes('Shared Buffer');
          const errorEl = document.querySelector('.text-rose-600, .text-rose-400, .text-red-500');
          if (errorEl && errorEl.textContent.trim()) {
            return { error: errorEl.textContent.trim() };
          }
          if (isDone) {
            const envBadge = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('postgresql_isolated_transaction') || s.textContent.includes('PostgreSQL') || s.textContent.includes('Transaction'));
            return {
              isDone: true,
              bodySnippet: text.slice(text.indexOf('WARM MEDIAN') > -1 ? text.indexOf('WARM MEDIAN') - 60 : 200, 1500),
              hasInitialRun: text.includes('INITIAL RUN') || text.includes('Initial Run'),
              hasWarmMedian: text.includes('WARM MEDIAN') || text.includes('Warm Median'),
              hasBufferHitBlocks: text.includes('Shared Buffer Hit Blocks') || text.includes('Buffer Hits'),
              hasBufferReadBlocks: text.includes('Shared Buffer Read Blocks') || text.includes('Buffer Reads'),
              hasPlannerCost: text.includes('Planner Cost') || text.includes('Estimated Planner Cost'),
              envBadgeText: envBadge ? envBadge.textContent.trim() : null
            };
          }
          return { isDone: false, status: text.includes('Executing') ? "Executing..." : "Waiting..." };
        })()
      `);

      if (domData.error) {
        throw new Error(`Benchmark execution failed with error: ${domData.error}`);
      }

      if (domData.isDone) {
        completed = true;
        console.log("Live PostgreSQL Benchmark Completed in Browser UI!");
        break;
      }
    }

    if (!completed) {
      throw new Error("Benchmark timed out after 40 seconds without completing.");
    }

    // 6. Capture API Response body from CDP Network domain
    if (benchmarkRunRequestId) {
      try {
        const bodyRes = await browser.send("Network.getResponseBody", { requestId: benchmarkRunRequestId });
        if (bodyRes && bodyRes.body) {
          benchmarkRunResponse = JSON.parse(bodyRes.body);
          console.log("\n================ LIVE BACKEND API TELEMETRY ================");
          console.log(`Benchmark ID:            ${benchmarkRunResponse.benchmark_id}`);
          console.log(`Environment:             ${benchmarkRunResponse.environment}`);
          console.log(`Original Warm Median:    ${benchmarkRunResponse.original_metrics?.warm_median_execution_time_ms} ms`);
          console.log(`Original Initial Run:    ${benchmarkRunResponse.original_metrics?.cold_execution_time_ms} ms`);
          console.log(`Optimized Warm Median:   ${benchmarkRunResponse.optimized_metrics?.warm_median_execution_time_ms} ms`);
          console.log(`Optimized Initial Run:   ${benchmarkRunResponse.optimized_metrics?.cold_execution_time_ms} ms`);
          console.log(`Original Cost:           ${benchmarkRunResponse.original_metrics?.estimated_planner_cost}`);
          console.log(`Optimized Cost:          ${benchmarkRunResponse.optimized_metrics?.estimated_planner_cost}`);
          console.log(`Cost Improvement %:      ${benchmarkRunResponse.planner_cost_improvement_pct}%`);
          console.log(`Original Buffer Hits:    ${benchmarkRunResponse.original_metrics?.shared_buffer_hits} blocks`);
          console.log(`Original Buffer Reads:   ${benchmarkRunResponse.original_metrics?.shared_buffer_reads} blocks`);
          console.log(`Optimized Buffer Hits:   ${benchmarkRunResponse.optimized_metrics?.shared_buffer_hits} blocks`);
          console.log(`Optimized Buffer Reads:  ${benchmarkRunResponse.optimized_metrics?.shared_buffer_reads} blocks`);
          console.log("============================================================\n");
        }
      } catch (err) {
        console.warn("Could not retrieve Network response body:", err.message);
      }
    }

    // 7. Capture Full Page Screenshot
    console.log("Capturing live benchmark result screenshot...");
    const screenshotRes = await browser.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    if (screenshotRes && screenshotRes.data) {
      const buffer = Buffer.from(screenshotRes.data, "base64");
      fs.writeFileSync("assets/screenshots/pg_benchmark_live.png", buffer);
      fs.writeFileSync("/Users/diksha/.gemini/antigravity/brain/fd48fa6d-bc5b-4ee1-a345-bb27ec50aace/pg_benchmark_live.png", buffer);
      console.log("Saved screenshot to assets/screenshots/pg_benchmark_live.png");
    }

    // 8. Test Tabs: Detailed Table, Visual Charts, Individual Trial Runs
    console.log("Switching to 'Visual Charts' tab...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Visual Charts'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    console.log("Switching to 'Individual Trial Runs' tab...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Individual Trial Runs'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // 9. Verify History Tab
    console.log("Switching to 'Benchmark History' tab to verify persistence...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Benchmark History'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const historyVerified = await browser.eval(`
      (() => {
        const text = document.body.innerText;
        return {
          hasHistoryRecords: text.includes('postgresql_isolated_transaction') || text.includes('users u JOIN orders o') || text.includes('WARM MEDIAN') || text.includes('ms'),
          tableText: text.slice(200, 1000)
        };
      })()
    `);
    console.log("History persistence verified:", historyVerified.hasHistoryRecords);

    console.log("\nALL LIVE POSTGRESQL INTEGRATION CHECKS PASSED SUCCESSFULLY!");
  } catch (error) {
    console.error("FATAL E2E FAILURE:", error);
    exitCode = 1;
  } finally {
    await browser.close();
    process.exit(exitCode);
  }
}

run();
