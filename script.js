// Main Application State
class StockAnalyzer {
    constructor() {
        this.currentStock = null;
        this.watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
        this.currentFramework = 'overview';
        this.priceChart = null;
        this.volumeChart = null;
        this.historicalData = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderWatchlist();
        this.setupSearchAutocomplete();
    }

    setupEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchStock();
        });

        // Framework tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchFramework(e.target.dataset.framework);
            });
        });
    }

    async searchStock() {
        const query = document.getElementById('searchInput').value.trim().toUpperCase();
        if (!query) return;

        try {
            const stockData = await this.fetchStockData(query);
            this.currentStock = stockData;
            await this.displayStockOverview(stockData);
            this.switchFramework('overview');
            this.updateWatchlistButton();
        } catch (error) {
            console.error('Error fetching stock data:', error);
            this.showError('Stock not found. Please check the ticker symbol.');
        }
    }

    async fetchStockData(symbol) {
        try {
            // Fetch comprehensive stock data
            const [chartData, quoteSummary, financialData] = await Promise.all([
                // 30-day historical data with OHLC
                this.fetchYahooData(`/v8/finance/chart/${symbol}?range=1mo&interval=1d`),
                // Quote summary for fundamentals
                this.fetchYahooData(`/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,price,recommendationTrend,earnings,earningsHistory,earningsTrend,industryTrend,sectorTrend,assetProfile`),
                // Additional financial data
                this.fetchYahooData(`/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=annualIncomeStatement`)
            ]);

            return {
                symbol,
                chart: chartData.chart?.result?.[0],
                quote: chartData.chart?.result?.[0],
                stats: quoteSummary.quoteSummary?.result?.[0],
                financials: financialData.timeseries?.result?.[0],
                historicalData: chartData.chart?.result?.[0]
            };
        } catch (error) {
            console.error('Error in fetchStockData:', error);
            throw error;
        }
    }

    async fetchYahooData(endpoint) {
        const baseUrl = 'https://query1.finance.yahoo.com';
        const response = await fetch(`${baseUrl}${endpoint}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }

    async displayStockOverview(stockData) {
        const overview = document.getElementById('stockOverview');
        const watchlistAction = document.getElementById('watchlistAction');
        
        overview.classList.remove('hidden');
        watchlistAction.classList.remove('hidden');
        
        // Update stock header
        document.getElementById('stockName').textContent = stockData.stats?.price?.longName || stockData.symbol;
        document.getElementById('stockSymbol').textContent = stockData.symbol;
        document.getElementById('stockExchange').textContent = stockData.stats?.price?.exchangeName || '';
        
        // Display OHLC data
        this.displayOHLCData(stockData);
        
        // Display quick stats
        this.displayQuickStats(stockData);
        
        // Display charts
        this.displayCharts(stockData);
    }

    displayOHLCData(stockData) {
        const chartData = stockData.chart;
        if (!chartData || !chartData.indicators || !chartData.indicators.quote) {
            console.error('No OHLC data available');
            return;
        }

        const quotes = chartData.indicators.quote[0];
        const timestamps = chartData.timestamp;
        
        // Get the latest completed session (last index)
        const lastIndex = quotes.close.length - 1;
        
        // Find the last valid (non-null) values
        let open = null, high = null, low = null, close = null, volume = null;
        
        for (let i = quotes.close.length - 1; i >= 0; i--) {
            if (quotes.close[i] !== null && open === null) {
                open = quotes.open[i];
                high = quotes.high[i];
                low = quotes.low[i];
                close = quotes.close[i];
                volume = quotes.volume[i];
                break;
            }
        }
        
        if (open !== null) {
            document.getElementById('openPrice').textContent = `$${open.toFixed(2)}`;
            document.getElementById('highPrice').textContent = `$${high.toFixed(2)}`;
            document.getElementById('lowPrice').textContent = `$${low.toFixed(2)}`;
            document.getElementById('prevClosePrice').textContent = `$${close.toFixed(2)}`;
            
            // Format volume
            document.getElementById('volumeData').textContent = this.formatVolume(volume);
            
            // Calculate average volume
            const validVolumes = quotes.volume.filter(v => v !== null);
            const avgVolume = validVolumes.length > 0 
                ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length 
                : 0;
            document.getElementById('avgVolume').textContent = this.formatVolume(avgVolume);
        }
        
        // Update current price and change
        const currentPrice = chartData.meta?.regularMarketPrice || close;
        const previousClose = chartData.meta?.chartPreviousClose || chartData.meta?.previousClose || close;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        document.getElementById('currentPrice').textContent = `$${currentPrice.toFixed(2)}`;
        const priceChange = document.getElementById('priceChange');
        priceChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        priceChange.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        
        // Update last updated time
        const lastUpdate = new Date();
        document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdate.toLocaleString()}`;
    }

    displayQuickStats(stockData) {
        const stats = stockData.stats;
        const quickStats = document.getElementById('quickStats');
        
        const marketCap = stats?.price?.marketCap?.raw || 0;
        const pe = stats?.summaryDetail?.trailingPE?.fmt || 'N/A';
        const eps = stats?.defaultKeyStatistics?.trailingEps?.fmt || 'N/A';
        const high52 = stats?.summaryDetail?.fiftyTwoWeekHigh?.fmt || 'N/A';
        const low52 = stats?.summaryDetail?.fiftyTwoWeekLow?.fmt || 'N/A';
        const beta = stats?.defaultKeyStatistics?.beta?.fmt || 'N/A';
        const dividendYield = stats?.summaryDetail?.dividendYield?.fmt || 'N/A';
        const profitMargin = stats?.financialData?.profitMargins?.fmt || 'N/A';
        
        quickStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Market Cap</div>
                <div class="stat-value">${this.formatMarketCap(marketCap)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">P/E Ratio</div>
                <div class="stat-value">${pe}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">EPS (TTM)</div>
                <div class="stat-value">${eps}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W High</div>
                <div class="stat-value">${high52}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W Low</div>
                <div class="stat-value">${low52}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Beta</div>
                <div class="stat-value">${beta}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Dividend Yield</div>
                <div class="stat-value">${dividendYield}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Profit Margin</div>
                <div class="stat-value">${profitMargin}</div>
            </div>
        `;
    }

    displayCharts(stockData) {
        const chartData = stockData.chart;
        if (!chartData || !chartData.timestamp || !chartData.indicators) {
            console.error('No chart data available');
            return;
        }

        const timestamps = chartData.timestamp;
        const quotes = chartData.indicators.quote[0];
        
        // Prepare data for charts
        const labels = timestamps.map(ts => {
            const date = new Date(ts * 1000);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const prices = quotes.close.filter(price => price !== null);
        const volumes = quotes.volume.filter(volume => volume !== null);
        
        // Destroy existing charts if they exist
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        if (this.volumeChart) {
            this.volumeChart.destroy();
        }
        
        // Create price chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        this.priceChart = new Chart(priceCtx, {
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
                    pointRadius: 0,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `$${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
        
        // Create volume chart
        const volumeCtx = document.getElementById('volumeChart').getContext('2d');
        this.volumeChart = new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: volumes.map((vol, i) => {
                        // Color bars based on price movement
                        if (i > 0) {
                            return prices[i] > prices[i - 1] ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                        }
                        return 'rgba(37, 99, 235, 0.7)';
                    }),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Volume: ${formatVolume(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return formatVolume(value);
                            }
                        }
                    }
                }
            }
        });
    }

    toggleWatchlist() {
        if (!this.currentStock) return;
        
        const symbol = this.currentStock.symbol;
        const index = this.watchlist.indexOf(symbol);
        
        if (index > -1) {
            this.watchlist.splice(index, 1);
            this.showToast(`${symbol} removed from watchlist`);
        } else {
            this.watchlist.push(symbol);
            this.showToast(`${symbol} added to watchlist`);
        }
        
        this.saveWatchlist();
        this.renderWatchlist();
        this.updateWatchlistButton();
    }

    updateWatchlistButton() {
        if (!this.currentStock) return;
        
        const button = document.getElementById('watchlistBtn');
        const isInWatchlist = this.watchlist.includes(this.currentStock.symbol);
        
        if (isInWatchlist) {
            button.textContent = '✓ In Watchlist';
            button.classList.add('active');
        } else {
            button.textContent = '⭐ Add to Watchlist';
            button.classList.remove('active');
        }
    }

    switchFramework(framework) {
        this.currentFramework = framework;
        
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.framework === framework);
        });
        
        if (!this.currentStock) return;
        
        const content = document.getElementById('frameworkContent');
        
        switch(framework) {
            case 'overview':
                content.innerHTML = this.getOverviewHTML();
                break;
            case 'oneil':
                content.innerHTML = window.analyzeOneil(this.currentStock);
                break;
            case 'blackscholes':
                content.innerHTML = window.analyzeBlackScholes(this.currentStock);
                break;
            case 'buffett':
                content.innerHTML = window.analyzeBuffett(this.currentStock);
                break;
            case 'famafrench':
                content.innerHTML = window.analyzeFamaFrench(this.currentStock);
                break;
            case 'magicformula':
                content.innerHTML = window.analyzeMagicFormula(this.currentStock);
                break;
            case 'piotroski':
                content.innerHTML = window.analyzePiotroski(this.currentStock);
                break;
            case 'graham':
                content.innerHTML = window.analyzeGraham(this.currentStock);
                break;
            case 'acquirer':
                content.innerHTML = window.analyzeAcquirerMultiple(this.currentStock);
                break;
            case 'minervini':
                content.innerHTML = window.analyzeMinervini(this.currentStock);
                break;
            case 'lynch':
                content.innerHTML = window.analyzeLynch(this.currentStock);
                break;
        }
    }

    getOverviewHTML() {
        if (!this.currentStock) return '';
        
        const stock = this.currentStock;
        const stats = stock.stats;
        
        return `
            <div class="overview-section">
                <h3>Company Overview</h3>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="stat-label">Sector</div>
                        <div class="metric-value">${stats?.assetProfile?.sector || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Industry</div>
                        <div class="metric-value">${stats?.assetProfile?.industry || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Employees</div>
                        <div class="metric-value">${stats?.assetProfile?.fullTimeEmployees || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Website</div>
                        <div class="metric-value">${stats?.assetProfile?.website || 'N/A'}</div>
                    </div>
                </div>
                
                <h3>Company Description</h3>
                <p class="company-description">${stats?.assetProfile?.longBusinessSummary || 'No description available.'}</p>
                
                <div class="verdict neutral">
                    <strong>📊 Overview:</strong> Select a framework tab above for detailed analysis
                </div>
            </div>
        `;
    }

    addToWatchlist(symbol) {
        if (!this.watchlist.includes(symbol)) {
            this.watchlist.push(symbol);
            this.saveWatchlist();
            this.renderWatchlist();
        }
    }

    removeFromWatchlist(symbol) {
        this.watchlist = this.watchlist.filter(s => s !== symbol);
        this.saveWatchlist();
        this.renderWatchlist();
    }

    saveWatchlist() {
        localStorage.setItem('watchlist', JSON.stringify(this.watchlist));
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
            <div class="watchlist-item" onclick="analyzer.loadStock('${symbol}')">
                <span class="symbol">${symbol}</span>
                <span class="price">Loading...</span>
                <button class="remove-btn" onclick="event.stopPropagation(); analyzer.removeFromWatchlist('${symbol}')">✕</button>
            </div>
        `).join('');
        
        // Fetch prices for watchlist items
        this.watchlist.forEach(symbol => {
            this.fetchWatchlistPrice(symbol);
        });
    }

    async fetchWatchlistPrice(symbol) {
        try {
            const data = await this.fetchYahooData(`/v8/finance/chart/${symbol}?range=1d&interval=1d`);
            const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) {
                const items = document.querySelectorAll('.watchlist-item');
                items.forEach(item => {
                    if (item.querySelector('.symbol').textContent === symbol) {
                        item.querySelector('.price').textContent = `$${price.toFixed(2)}`;
                    }
                });
            }
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
        }
    }

    async loadStock(symbol) {
        document.getElementById('searchInput').value = symbol;
        await this.searchStock();
    }

    formatNumber(num) {
        if (!num) return 'N/A';
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
        return `$${num.toFixed(2)}`;
    }

    formatMarketCap(value) {
        if (!value) return 'N/A';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toFixed(2)}`;
    }

    formatVolume(value) {
        if (!value) return 'N/A';
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
        return value.toString();
    }

    showError(message) {
        alert(message);
    }

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    setupSearchAutocomplete() {
        const input = document.getElementById('searchInput');
        input.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) return;
            
            try {
                const response = await this.fetchYahooData(`/v1/finance/search?q=${query}&quotesCount=5&newsCount=0`);
                const quotes = response.quotes || [];
                // Could implement dropdown here
                console.log('Search results:', quotes);
            } catch (error) {
                console.error('Search error:', error);
            }
        }, 300));
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global formatVolume function for chart tooltips
function formatVolume(value) {
    if (!value) return 'N/A';
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toString();
}

// Initialize the application
const analyzer = new StockAnalyzer();
