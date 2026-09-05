window.analyzeMagicFormula = function(stock) {
    const stats = stock.stats;
    
    // Magic Formula Components
    const earningsYield = calculateEarningsYield(stock);
    const returnOnCapital = calculateROC(stock);
    
    // Rank stocks based on both metrics
    const metrics = {
        'Earnings Yield': `${(earningsYield * 100).toFixed(2)}%`,
        'Return on Capital': `${(returnOnCapital * 100).toFixed(2)}%`,
        'EBIT': stats?.financialData?.ebitda?.fmt || 'N/A',
        'Enterprise Value': stats?.defaultKeyStatistics?.enterpriseValue?.fmt || 'N/A',
        'P/E Ratio': stats?.summaryDetail?.trailingPE?.fmt || 'N/A'
    };
    
    const score = calculateMagicFormulaScore(earningsYield, returnOnCapital);
    const recommendation = score > 70 ? 'High Quality' : score > 40 ? 'Average' : 'Low Quality';
    
    return generateHTML('Joel Greenblatt Magic Formula', metrics, score, recommendation);
};
