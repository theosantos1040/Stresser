const fetch = require('node-fetch');

// Proxies de fallback (caso a API falhe)
const FALLBACK_PROXIES = [
  'http://104.248.176.118:80',
  'http://139.59.1.14:8080',
  'http://165.227.80.7:80',
  'http://161.35.185.170:8080',
  'http://157.230.238.104:80',
  'http://159.65.223.55:80',
  'http://142.93.215.47:8080',
  'http://134.209.48.40:8080',
  'http://159.203.119.204:80',
  'http://207.154.231.212:80'
];

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.lastUpdate = 0;
    this.ttl = parseInt(process.env.PROXY_REFRESH_INTERVAL) || 300000; // 5 min
    this.isUpdating = false;
    this._lastError = null;
  }

  // Método síncrono para obter proxies (sem atualizar)
  getProxiesSync() {
    return this.proxies;
  }

  async refresh() {
    if (this.isUpdating) {
      // Aguarda a atualização atual terminar
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (!this.isUpdating) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      return this.proxies.length;
    }

    this.isUpdating = true;
    let newProxies = [];

    try {
      console.log('🔄 Atualizando pool de proxies...');
      
      // Tentar múltiplas fontes
      const sources = [
        'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text',
        'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
        'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'
      ];

      let success = false;
      for (const source of sources) {
        try {
          console.log(`  📡 Tentando: ${source.slice(0, 50)}...`);
          const resp = await fetch(source, { 
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProxyBot/1.0)' }
          });
          
          if (!resp.ok) continue;
          
          const text = await resp.text();
          const lines = text.split('\n')
            .filter(line => line.trim() !== '')
            .filter(line => !line.includes('<!DOCTYPE') && !line.includes('<html'));
          
          const parsed = lines.map(line => {
            let p = line.trim();
            // Se não tiver protocolo, adiciona http://
            if (!p.startsWith('http://') && !p.startsWith('https://')) {
              p = 'http://' + p;
            }
            return p;
          }).filter(p => {
            // Validar formato IP:PORT ou DOMAIN:PORT
            const withoutProto = p.replace('http://', '').replace('https://', '');
            const parts = withoutProto.split(':');
            return parts.length === 2 && !isNaN(parts[1]) && parseInt(parts[1]) > 0;
          });

          if (parsed.length > 0) {
            newProxies = parsed;
            success = true;
            console.log(`  ✅ ${newProxies.length} proxies obtidas de ${source}`);
            break;
          }
        } catch (err) {
          console.log(`  ⚠️ Falha na fonte: ${err.message}`);
        }
      }

      // Se não conseguiu nenhuma, usa fallback
      if (!success || newProxies.length === 0) {
        console.log('⚠️ Nenhuma proxy obtida das fontes. Usando fallback.');
        newProxies = [...FALLBACK_PROXIES];
      }

      // Remover duplicatas
      newProxies = [...new Set(newProxies)];

      // Atualizar o pool
      if (newProxies.length > 0) {
        this.proxies = newProxies;
        this.lastUpdate = Date.now();
        this._lastError = null;
        console.log(`✅ Pool atualizado: ${this.proxies.length} proxies.`);
      } else {
        this._lastError = 'Nenhuma proxy válida obtida.';
        console.warn('⚠️ Nenhuma proxy válida. Mantendo lista anterior.');
      }

    } catch (err) {
      this._lastError = err.message;
      console.error('❌ Erro ao atualizar proxies:', err.message);
      
      // Se não tiver proxies, usa fallback
      if (this.proxies.length === 0) {
        this.proxies = [...FALLBACK_PROXIES];
        console.log(`🔄 Usando ${this.proxies.length} proxies de fallback.`);
      }
    }

    this.isUpdating = false;
    return this.proxies.length;
  }

  async getProxies() {
    const now = Date.now();
    // Se não tiver proxies ou tiver expirado, atualiza
    if (this.proxies.length === 0 || (now - this.lastUpdate) > this.ttl) {
      await this.refresh();
    }
    return this.proxies;
  }

  getProxyCount() {
    return this.proxies.length;
  }

  getLastError() {
    return this._lastError;
  }

  // Método para obter um subconjunto aleatório de proxies
  getRandomProxies(count = 10) {
    if (this.proxies.length === 0) return [];
    const shuffled = [...this.proxies];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}

module.exports = new ProxyManager();
