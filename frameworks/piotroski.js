window.analyzePiotroski = function(stock) {
    const financials = stock.financials;
    const balanceSheet = stock.balanceSheet;
    const cashFlow = stock.cashFlow;
    
    // Piotroski F-Score (0-9)
    const criteria = {
        'Profitability': {
            'Positive Net Income': checkPositiveNetIncome(financials),
            'Positive Operating Cash Flow': checkPositiveOCF(cashFlow),
            'Increasing ROA': checkROAImprovement(financials),
            'Operating Cash Flow > Net Income': checkOCFvsNI(financials, cashFlow)
        },
        'Leverage': {
            'Decreasing Debt': checkDebtReduction(balanceSheet),
            'Increasing Current Ratio': checkCurrentRatioImprovement(balanceSheet),
            'No New Shares': checkShareDilution(financials)
        },
        'Efficiency': {
            'Increasing Gross Margin': checkGrossMarginImprovement(financials),
            'Increasing Asset Turnover': checkAssetTurnoverImprovement(financials)
        }
    };
    
    const fScore = calculateFScore(criteria);
    const recommendation = fScore >= 7 ? 'Strong' : fScore >= 4 ? 'Moderate' : 'Weak';
    
    return generateScoreHTML('Piotroski F-Score', criteria, fScore, recommendation);
};
