// Mock data for popular Indian Stocks
const POPULAR_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd.", sector: "Energy & Petrochemicals", basePrice: 2450.00, currentPrice: 2450.00, beta: 1.1, change: 0, changePercent: 0 },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd.", sector: "Information Technology", basePrice: 3820.00, currentPrice: 3820.00, beta: 0.8, change: 0, changePercent: 0 },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", sector: "Financial Services", basePrice: 1610.00, currentPrice: 1610.00, beta: 1.05, change: 0, changePercent: 0 },
    { symbol: "INFY", name: "Infosys Ltd.", sector: "Information Technology", basePrice: 1420.00, currentPrice: 1420.00, beta: 1.2, change: 0, changePercent: 0 },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", sector: "Financial Services", basePrice: 1120.00, currentPrice: 1120.00, beta: 1.15, change: 0, changePercent: 0 },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", sector: "Telecommunications", basePrice: 1350.00, currentPrice: 1350.00, beta: 0.9, change: 0, changePercent: 0 },
    { symbol: "SBIN", name: "State Bank of India", sector: "Financial Services", basePrice: 830.00, currentPrice: 830.00, beta: 1.3, change: 0, changePercent: 0 },
    { symbol: "ITC", name: "ITC Ltd.", sector: "Consumer Goods", basePrice: 435.00, currentPrice: 435.00, beta: 0.6, change: 0, changePercent: 0 },
    { symbol: "LT", name: "Larsen & Toubro Ltd.", sector: "Construction & Engineering", basePrice: 3550.00, currentPrice: 3550.00, beta: 1.0, change: 0, changePercent: 0 },
    { symbol: "TATASTEEL", name: "Tata Steel Ltd.", sector: "Metals & Mining", basePrice: 175.00, currentPrice: 175.00, beta: 1.4, change: 0, changePercent: 0 }
];

// Pre-seeded popular Mutual Funds as fallback/starter entries
const POPULAR_MUTUAL_FUNDS = [
    { amfiCode: "120847", name: "Parag Parikh Flexi Cap Fund - Direct Growth", category: "Equity - Flexi Cap", baseNav: 78.45, currentNav: 78.45 },
    { amfiCode: "119063", name: "HDFC Top 100 Fund - Direct Growth", category: "Equity - Large Cap", baseNav: 112.30, currentNav: 112.30 },
    { amfiCode: "119551", name: "SBI Bluechip Fund - Direct Growth", category: "Equity - Large Cap", baseNav: 85.12, currentNav: 85.12 },
    { amfiCode: "118989", name: "Nippon India Small Cap Fund - Direct Growth", category: "Equity - Small Cap", baseNav: 154.67, currentNav: 154.67 },
    { amfiCode: "148498", name: "Quant Active Fund - Direct Growth", category: "Equity - Multi Cap", baseNav: 645.18, currentNav: 645.18 },
    { amfiCode: "120286", name: "ICICI Prudential Asset Allocator Fund (FOF) - Direct Growth", category: "Hybrid - Asset Allocation", baseNav: 125.40, currentNav: 125.40 },
    { amfiCode: "119808", name: "Aditya Birla Sun Life Liquid Fund - Direct Growth", category: "Debt - Liquid", baseNav: 395.20, currentNav: 395.20 }
];

// Export to window object for browser compatibility
window.marketStocks = POPULAR_STOCKS;
window.popularMutualFunds = POPULAR_MUTUAL_FUNDS;
