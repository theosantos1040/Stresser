class StatsManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.target = '';
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.sentCount = 0;
    this.startTime = null;
    this.endTime = null;
    this.progress = 0;
    this.isRunning = false;
  }

  setTarget(target) {
    this.target = target;
  }

  setTotalRequests(total) {
    this.totalRequests = total;
  }

  increment(success) {
    if (success) {
      this.successCount++;
    } else {
      this.errorCount++;
    }
    this.sentCount++;
  }

  updateProgress(sent, max) {
    this.progress = max > 0 ? (sent / max) * 100 : 0;
  }

  finish(duration, totalSent) {
    this.endTime = Date.now();
    this.isRunning = false;
    this.sentCount = totalSent;
  }

  getSummary() {
    const now = Date.now();
    const elapsed = this.startTime ? (now - this.startTime) / 1000 : 0;
    const rps = elapsed > 0 ? this.sentCount / elapsed : 0;

    return {
      target: this.target,
      isRunning: this.isRunning,
      totalRequests: this.totalRequests,
      sentCount: this.sentCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      progress: this.progress,
      rps: rps.toFixed(2),
      elapsed: elapsed.toFixed(2),
      startTime: this.startTime,
      endTime: this.endTime,
      successRate: this.sentCount > 0 ? ((this.successCount / this.sentCount) * 100).toFixed(2) : 0
    };
  }

  start() {
    this.reset();
    this.startTime = Date.now();
    this.isRunning = true;
  }

  // Para SSE, retorna um objeto com dados atualizados
  getSSEData() {
    const summary = this.getSummary();
    return {
      ...summary,
      timestamp: Date.now()
    };
  }
}

module.exports = new StatsManager();
