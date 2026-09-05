class StaticStockAnalyzer {
    constructor() {
        this.currentStock = null;
        this.watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
        this.availableStocks = [];
        this.masterData = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.renderWatchlist();
        await this.loadMasterData();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadStaticData();
            }
        });

        const searchBtn = document.querySelector('.search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.loadStaticData();
            });
        }
    }

    async loadMasterData() {
        try {
            const response = await fetch('data/master_data.csv');
            if (!response.ok) {
                console.log('No master data file found');
                return;
            }
            
            const csvText = await response.text();
            this.masterData = this.parseCSV(csvText);
            
            // Update available stocks
            this.availableStocks = this.masterData.map(row => row.symbol);
            this.renderAvailableStocks();
            
            // Update watchlist prices
            this.updateWatchlistPrices();
            
        } catch (error) {
            console.log('Error loading master data:', error);
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        const result = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            const obj = {};
            
            headers.forEach((header, index) => {
                obj[header.trim()] = values[index]?.trim() || '';
            });
            
            result.push(obj);
        }
        
        return result;
    }

    async loadStaticData() {
        const symbol = document.getElementById('searchInput').value.trim().toUpperCase();
        if (!symbol) {
            alert('Please enter a stock symbol');
            return;
        }

        try {
            // Load metrics data
            const metricsResponse = await fetch(`data/${symbol}_metrics.csv`);
            if (!metricsResponse.ok) {
                throw new Error(`No data found for ${symbol}`);
            }
            
            const metricsText = await metricsResponse.text();
            const metrics = this.parseCSV(metricsText)[0];
            
            // Load historical data
            const historyResponse = await fetch(`data/${symbol}_history.csv`);
            if (!historyResponse.ok) {
                throw new Error(`No historical data found for ${symbol}`);
            }
            
            const historyText = await historyResponse.text();
            const historicalData = this.parseCSV(historyText);
            
            this.currentStock = {
                symbol: symbol,
                metrics: metrics,
                historicalData: historicalData
            };
            
            this.displayStockData();
            
        } catch (error) {
            console.error('Error loading data:', error);
            alert(`Unable to load data for ${symbol}. Make sure the data files exist.`);
        }
    }

    displayStockData() {
        const overview = document.getElementById('stockOverview');
        overview.classList.remove('hidden');
        
        const stock = this.currentStock;
        const metrics = stock.metrics;
        
        // Display OHLC and price data
        document.getElementById('stockName').textContent = metrics.symbol;
        document.getElementById('stockSymbol').textContent = metrics.symbol;
        document.getElementById('currentPrice').textContent = `$${parseFloat(metrics.current_price).toFixed(2)}`;
        
        const change = metrics.current_price - metrics.previous_close;
        const changePercent = (change / metrics.previous_close) * 100;
        
        document.getElementById('priceChange').textContent = 
            `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        document.getElementById('priceChange').className = 
            `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        
        // Display OHLC
        document.getElementById('openPrice').textContent = `$${parseFloat(metrics.open).toFixed(2)}`;
        document.getElementById('highPrice').textContent = `$${parseFloat(metrics.day_high).toFixed(2)}`;
        document.getElementById('lowPrice').textContent = `$${parseFloat(metrics.day_low).toFixed(2)}`;
        document.getElementById('prevClosePrice').textContent = `$${parseFloat(metrics.previous_close).toFixed(2)}`;
        document.getElementById('volumeData').textContent = this.formatVolume(metrics.volume);
        
        // Display quick stats
        this.displayQuickStats(metrics);
        
        // Display charts
        this.displayCharts(stock.historicalData);
        
        // Display framework placeholder
        document.getElementById('frameworkContent').innerHTML = `
            <div class="verdict neutral">
                <strong>📊 Data loaded from static files</strong>
                <p>Last updated: ${metrics.last_updated || 'N/A'}</p>
                <p>This is static data. Run the Python script to update.</p>
            </div>
        `;
    }

    displayQuickStats(metrics) {
        const quickStats = document.getElementById('quickStats');
        quickStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Market Cap</div>
                <div class="stat-value">${this.formatMarketCap(metrics.market_cap)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">P/E Ratio</div>
                <div class="stat-value">${metrics.pe_ratio || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">EPS</div>
                <div class="stat-value">${metrics.eps || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W High</div>
                <div class="stat-value">${metrics['52_week_high'] || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W Low</div>
                <div class="stat-value">${metrics['52_week_low'] || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Beta</div>
                <div class="stat-value">${metrics.beta || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Dividend Yield</div>
                <div class="stat-value">${metrics.dividend_yield ? (metrics.dividend_yield * 100).toFixed(2) + '%' : 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Profit Margin</div>
                <div class="stat-value">${metrics.profit_margin || 'N/A'}</div>
            </div>
        `;
    }

    displayCharts(historicalData) {
        // Prepare data for charts
        const labels = historicalData.map(row => {
            const date = new Date(row.Date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const prices = historicalData.map(row => parseFloat(row.Close));
        const volumes = historicalData.map(row => parseFloat(row.Volume));
        
        // Create price chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        new Chart(priceCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close Price',
                    data: prices,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        
        // Create volume chart
        const volumeCtx = document.getElementById('volumeChart').getContext('2d');
        new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    renderAvailableStocks() {
        const container = document.getElementById('availableStocks');
        if (!container) return;
        
        container.innerHTML = this.availableStocks.map(symbol => `
            <div class="stock-chip" onclick="analyzer.quickLoad('${symbol}')">
                ${symbol}
            </div>
        `).join('');
    }

    quickLoad(symbol) {
        document.getElementById('searchInput').value = symbol;
        this.loadStaticData();
    }

    renderWatchlist() {
        const container = document.getElementById('watchlistItems');
        const count = document.getElementById('watchlistCount');
        
        count.textContent = this.watchlist.length;
        
        if (this.watchlist.length === 0) {
            container.innerHTML = '<p class="empty-watchlist">No stocks in watchlist</p>';
            return;
        }
        
        container.innerHTML = this.watchlist.map(symbol => `
            <div class="watchlist-item" onclick="analyzer.quickLoad('${symbol}')">
                <span class="symbol">${symbol}</span>
                <span class="price" id="watch-${symbol}">---</span>
            </div>
        `).join('');
        
        this.updateWatchlistPrices();
    }

    updateWatchlistPrices() {
        if (!this.masterData) return;
        
        this.watchlist.forEach(symbol => {
            const data = this.masterData.find(row => row.symbol === symbol);
            if (data) {
                const priceElement = document.getElementById(`watch-${symbol}`);
                if (priceElement) {
                    priceElement.textContent = `$${parseFloat(data.current_price).toFixed(2)}`;
                }
            }
        });
    }

    formatMarketCap(value) {
        if (!value || value === 'N/A') return 'N/A';
        const num = parseFloat(value);
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toFixed(2)}`;
    }

    formatVolume(value) {
        if (!value || value === 'N/A') return 'N/A';
        const num = parseFloat(value);
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        return num.toString();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.analyzer = new StaticStockAnalyzer();
});
