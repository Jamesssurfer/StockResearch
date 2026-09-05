window.analyzeLynch = function(stock) {
    const stats = stock.stats;
    
    // GARP Criteria
    const pegRatio = calculatePEGRatio(stock);
    const earningsYield = calculateEarningsYield(stock);
    const dividendYield = stats?.summaryDetail?.dividendYield?.raw || 0;
    
    const metrics = {
        'PEG Ratio': pegRatio.toFixed(2),
        'Earnings Yield': `${(earningsYield * 100).toFixed(2)}%`,
        'Dividend Yield': `${(dividendYield * 100).toFixed(2)}%`,
        'P/E Ratio': stats?.summaryDetail?.trailingPE?.fmt || 'N/A',
        'EPS Growth': stats?.defaultKeyStatistics?.earningsGrowth?.fmt || 'N/A',
        'Revenue Growth': stats?.financialData?.revenueGrowth?.fmt || 'N/A'
    };
    
    const score = calculateLynchScore(pegRatio, earningsYield, dividendYield);
    const recommendation = score > 70 ? 'GARP - Buy' : score > 40 ? 'Fair Value' : 'Avoid';
    
    return generateHTML('Peter Lynch GARP Analysis', metrics, score, recommendation);
};
