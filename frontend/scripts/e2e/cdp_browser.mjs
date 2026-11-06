import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export class CdpBrowser {
  constructor(options = {}) {
    this.port = options.port || 9222;
    this.userDataDir = options.userDataDir || `/tmp/chrome_e2e_${Date.now()}`;
    this.proc = null;
    this.ws = null;
    this.msgId = 0;
    this.callbacks = new Map();
    this.consoleLogs = [];
    this.consoleErrors = [];
    this.networkErrors = [];
    this.httpResponses = [];
  }

  async launch() {
    this.proc = spawn(CHROME_PATH, [
      "--headless=new",
      `--remote-debugging-port=${this.port}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${this.userDataDir}`,
      "--window-size=1440,960",
    ]);

    // Poll until debugging port is ready
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await new Promise(r => setTimeout(r, 200));
        await this._getJson(`http://127.0.0.1:${this.port}/json/version`);
        connected = true;
        break;
      } catch (e) {}
    }

    if (!connected) {
      throw new Error("Could not connect to Chrome debugging port");
    }

    // Get active page target or create one
    const targets = await this._getJson(`http://127.0.0.1:${this.port}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || (await this._getJson(`http://127.0.0.1:${this.port}/json/new?about:blank`));

    // Connect WebSocket
    this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this._handleEvent(msg.method, msg.params);
      }
    };

    // Enable domains
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  _handleEvent(method, params) {
    if (method === "Runtime.consoleAPICalled") {
      const text = params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(" ");
      this.consoleLogs.push({ type: params.type, text });
      if (params.type === "error" || params.type === "warning") {
        this.consoleErrors.push({ type: params.type, text });
      }
    } else if (method === "Runtime.exceptionThrown") {
      this.consoleErrors.push({
        type: "exception",
        text: params.exceptionDetails.exception?.description || params.exceptionDetails.text
      });
    } else if (method === "Network.responseReceived") {
      this.httpResponses.push({
        url: params.response.url,
        status: params.response.status,
        statusText: params.response.statusText
      });
      if (params.response.status >= 400 && !params.response.url.includes('/notfound') && !params.response.url.includes('/test-invalid')) {
        this.networkErrors.push({
          url: params.response.url,
          status: params.response.status
        });
      }
    } else if (method === "Network.loadingFailed") {
      this.networkErrors.push({
        url: params.url,
        error: params.errorText
      });
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url, waitMs = 1500) {
    this.consoleLogs = [];
    this.consoleErrors = [];
    this.networkErrors = [];
    this.httpResponses = [];
    await this.send("Page.navigate", { url });
    await new Promise(r => setTimeout(r, waitMs));
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async click(selector) {
    return await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found: " + ${JSON.stringify(selector)});
        el.click();
        return true;
      })()
    `);
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });
  }

  async setColorScheme(scheme) {
    await this.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }]
    });
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this.proc) {
      this.proc.kill();
    }
  }

  _getJson(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
  }
}
