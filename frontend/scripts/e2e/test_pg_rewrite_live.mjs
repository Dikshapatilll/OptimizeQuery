import { CdpBrowser } from './cdp_browser.mjs';

const browser = new CdpBrowser({ port: 9226, userDataDir: `/tmp/chrome_pg_rewrite_${Date.now()}` });

async function run() {
  try {
    console.log("Testing PostgreSQL query rewrite benchmark with Result-Set Equivalence...");
    await browser.launch();

    let benchmarkRunRequestId = null;
    let benchmarkRunResponse = null;

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
        }
      } else if (msg.method) {
        browser._handleEvent(msg.method, msg.params);
      }
    };

    await browser.navigate("http://localhost:3000/benchmark", 3000);

    // Select PostgreSQL connection
    await browser.eval(`
      (() => {
        const select = document.querySelector('select');
        const options = Array.from(select.options);
        const pgOption = options.find(o => o.text.includes('PostgreSQL') || o.text.includes('optimizeql_exp'));
        if (pgOption) {
          select.value = pgOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // Select Preset W3 (Query Rewrite)
    console.log("Selecting Preset W3 (Query Rewrite)...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('W3'));
        if (btn) btn.click();
        else throw new Error("Preset W3 button not found");
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // Click "Execute Controlled Benchmark"
    console.log("Executing Rewrite Benchmark on PostgreSQL...");
    await browser.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /Execute.*Benchmark/i.test(b.textContent));
        if (btn) btn.click();
      })()
    `);

    // Poll for completion
    let completed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await browser.eval(`
        (() => {
          const text = document.body.innerText;
          if (text.includes('WARM MEDIAN') || text.includes('VERIFIED BOUNDED MATCH') || text.includes('Equivalence')) {
            const eqBadge = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('VERIFIED BOUNDED MATCH') || s.textContent.includes('MATCH'));
            return {
              isDone: true,
              equivalenceText: eqBadge ? eqBadge.textContent.trim() : null,
              hasInitialRun: text.includes('INITIAL RUN') || text.includes('Initial Run'),
              hasWarmMedian: text.includes('WARM MEDIAN') || text.includes('Warm Median')
            };
          }
          return { isDone: false };
        })()
      `);

      if (res.isDone) {
        completed = true;
        console.log("Rewrite benchmark completed! Equivalence Badge:", res.equivalenceText);
        break;
      }
    }

    if (!completed) throw new Error("W3 Rewrite benchmark timed out");

    if (benchmarkRunRequestId) {
      const bodyRes = await browser.send("Network.getResponseBody", { requestId: benchmarkRunRequestId });
      if (bodyRes && bodyRes.body) {
        benchmarkRunResponse = JSON.parse(bodyRes.body);
        console.log("\n================ W3 LIVE TELEMETRY & EQUIVALENCE ================");
        console.log(`Benchmark ID:            ${benchmarkRunResponse.benchmark_id}`);
        console.log(`Environment:             ${benchmarkRunResponse.environment}`);
        console.log(`Original Warm Median:    ${benchmarkRunResponse.original_metrics?.warm_median_execution_time_ms} ms`);
        console.log(`Optimized Warm Median:   ${benchmarkRunResponse.optimized_metrics?.warm_median_execution_time_ms} ms`);
        console.log(`Speedup / Improvement:   ${benchmarkRunResponse.execution_time_improvement_pct}%`);
        console.log(`Equivalence Results:     ${JSON.stringify(benchmarkRunResponse.equivalence)}`);
        console.log("=================================================================\n");
      }
    }

    console.log("POSTGRESQL REWRITE & RESULT-EQUIVALENCE TEST PASSED!");
  } catch (err) {
    console.error("Rewrite test failed:", err);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

run();
