import fs from "node:fs";
import path from "node:path";
import { MLProcessor } from "./MLProcessor.js";

export class LocalMLProcessor extends MLProcessor {
  constructor({ enabled = true, modelPath = "", timeoutMs = 5000 } = {}) { super(); this.enabled = enabled; this.modelPath = modelPath; this.timeoutMs = timeoutMs; this.adapter = null; this.lastSuccessfulInference = null; this.lastError = null; }
  get available() { return Boolean(this.enabled && this.adapter); }
  async load() {
    if (!this.enabled || !this.modelPath) return;
    const resolved = path.resolve(this.modelPath);
    if (!fs.existsSync(resolved)) { this.lastError = "Configured ML_MODEL_PATH does not exist"; return; }
    try { const module = await import(`${resolved}?v=${fs.statSync(resolved).mtimeMs}`); const adapter = module.default || module; if (typeof adapter.predict !== "function") throw new Error("ML adapter must export predict(input)"); this.adapter = adapter; this.lastError = null; } catch (error) { this.lastError = error.message; }
  }
  async predict(input) {
    if (!this.enabled || !this.adapter) throw new Error("ML_UNAVAILABLE");
    const result = await Promise.race([Promise.resolve(this.adapter.predict(input)), new Promise((_, reject) => setTimeout(() => reject(new Error("ML_TIMEOUT")), this.timeoutMs))]);
    if (!result || typeof result !== "object" || typeof result.riskLevel !== "string") throw new Error("ML_INVALID_RESPONSE");
    this.lastSuccessfulInference = new Date().toISOString(); this.lastError = null; return result;
  }
  status() { return { enabled: Boolean(this.enabled), available: this.available, modelPathConfigured: Boolean(this.modelPath), lastSuccessfulInference: this.lastSuccessfulInference, lastError: this.lastError }; }
}
