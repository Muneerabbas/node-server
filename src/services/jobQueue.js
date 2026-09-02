export class JobQueue {
  constructor({ concurrency = 1 } = {}) { this.concurrency = concurrency; this.running = 0; this.jobs = []; }
  add(job) { return new Promise((resolve, reject) => { this.jobs.push({ job, resolve, reject }); this.run(); }); }
  run() { while (this.running < this.concurrency && this.jobs.length) { const item = this.jobs.shift(); this.running += 1; Promise.resolve().then(item.job).then(item.resolve, item.reject).finally(() => { this.running -= 1; this.run(); }); } }
}
