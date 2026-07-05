const fetch = require('node-fetch');

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.lastUpdate = 0;
    this.ttl = parseInt(process.env.PROXY_REFRESH_INTERVAL) || 300000; // 5 min
    this.isUpdating = false;
  }

  async refresh() {
    if (this.isUpdating) return this.proxies;
    this.isUpdating = true;

    try {
      console.log('🔄 Atualizando pool de proxies...');
      const url = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text';
      const resp = await fetch(url, { timeout: 10000 });
      const text = await resp.text();
      
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const newProxies = lines.map(line => {
        let p = line.trim();
        if (!p.startsWith('http://') && !p.startsWith('https://')) {
          p = 'http://' + p;
        }
        return p;
      });

      // Filtrar proxies inválidas (formato básico)
      const validProxies = newProxies.filter(p => {
        const parts = p.replace('http://', '').replace('https://', '').split(':');
        return parts.length === 2 && !isNaN(parts[1]);
      });

      if (validProxies.length > 0) {
        this.proxies = validProxies;
        this.lastUpdate = Date.now();
        console.log(`✅ ${this.proxies.length} proxies carregadas.`);
      } else {
        console.warn('⚠️ Nenhuma proxy válida obtida. Mantendo a lista anterior.');
      }
    } catch (err) {
      console.error('❌ Erro ao buscar proxies:', err.message);
    }

    this.isUpdating = false;
    return this.proxies;
  }

  async getProxies() {
    const now = Date.now();
    if (this.proxies.length === 0 || (now - this.lastUpdate) > this.ttl) {
      await this.refresh();
    }
    return this.proxies;
  }

  getProxyCount() {
    return this.proxies.length;
  }

  // Método para obter um subconjunto aleatório de proxies
  getRandomProxies(count = 10) {
    const shuffled = [...this.proxies];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }
}

module.exports = new ProxyManager();
