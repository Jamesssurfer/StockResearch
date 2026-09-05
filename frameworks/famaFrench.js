window.analyzeFamaFrench = function(stock) {
    const stats = stock.stats;
    
    // Fama-French Three Factor Model
    const marketRiskPremium = 0.06; // 6% expected market return above risk-free
    const sizePremium = calculateSizePremium(stats);
    const valuePremium = calculateValuePremium(stats);
    
    const beta = stats?.defaultKeyStatistics?.beta?.raw || 1;
    const riskFreeRate = 0.04;
    
    const expectedReturn = riskFreeRate + beta * marketRiskPremium + sizePremium + valuePremium;
    
    const metrics = {
        'Beta': beta.toFixed(2),
        'Size Factor (SMB)': sizePremium.toFixed(4),
        'Value Factor (HML)': valuePremium.toFixed(4),
        'Market Risk Premium': marketRiskPremium.toFixed(4),
        'Risk-Free Rate': riskFreeRate.toFixed(4),
        'Expected Return': `${(expectedReturn * 100).toFixed(2)}%`
    };
    
    const score = calculateFFScore(expectedReturn, beta);
    const recommendation = expectedReturn > 0.10 ? 'Bullish' : expectedReturn > 0.06 ? 'Neutral' : 'Bearish';
    
    return generateHTML('Fama-French Three Factor Model', metrics, score, recommendation);
};
