window.analyzeMinervini = function(stock) {
    const stats = stock.stats;
    const quote = stock.quote;
    
    // SEPA Criteria
    const metrics = {
        'RS Rating': stats?.defaultKeyStatistics?.relativeStrength?.fmt || 'N/A',
        '52-Week Change': calculate52WeekChange(stock),
        'Earnings Growth': stats?.earningsTrend?.trend?.[0]?.growth?.fmt || 'N/A',
        'Sales Growth': stats?.financialData?.revenueGrowth?.fmt || 'N/A',
        'Profit Margin': stats?.financialData?.profitMargins?.fmt || 'N/A',
        'Market Cap': formatMarketCap(stats?.price?.marketCap?.raw || 0)
    };
    
    // Check Trend Template
    const trendTemplate = checkTrendTemplate(stock);
    
    const score = calculateMinerviniScore(metrics, trendTemplate);
    const recommendation = score > 80 ? 'Strong Trend' : score > 50 ? 'Developing' : 'Avoid';
    
    return generateHTML('Mark Minervini SEPA Analysis', metrics, score, recommendation);
};
