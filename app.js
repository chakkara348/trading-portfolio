// Pinnacle Portfolio Manager - Core Logic & Engine
document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // 1. STATE & LOCALSTORAGE PROPERTIES
    // -------------------------------------------------------------
    let state = {
        holdings: {
            stocks: {},       // Key: Symbol -> { symbol, quantity, avgPrice, totalCost, basePrice, currentPrice }
            mutualFunds: {}   // Key: AMFI Code -> { code, name, category, units, avgPrice, totalCost, currentNav }
        },
        transactions: [],     // Array of recorded buys/sells
        sips: [],             // Systematic Investment Plans
        settings: {
            theme: "dark",
            riskProfile: "balanced",
            targetStockPercent: 50,
            taxSlab: 30,
            simulatorSpeed: 3000
        },
        realizedGains: []     // History of sold transactions for tax logs
    };

    // Chart.js references
    let allocationChart = null;
    let trendChart = null;

    // Simulation Interval reference
    let simulatorInterval = null;

    // Debounce timer for search
    let searchDebounceTimer = null;

    // -------------------------------------------------------------
    // 2. INITIALIZATION & DATA SEEDING
    // -------------------------------------------------------------
    function init() {
        // Load data from LocalStorage
        const savedState = localStorage.getItem("pinnacle_portfolio_state");
        if (savedState) {
            try {
                state = JSON.parse(savedState);
                // Apply loaded settings
                document.body.setAttribute("data-theme", state.settings.theme);
                updateThemeIcons();
                
                // Synchronize setting input values
                document.getElementById("settings-risk-profile").value = state.settings.riskProfile;
                document.getElementById("settings-stock-target").value = state.settings.targetStockPercent;
                document.getElementById("settings-stock-target-val").innerText = state.settings.targetStockPercent + "%";
                document.getElementById("settings-tax-slab").value = state.settings.taxSlab;
                document.getElementById("settings-simulator-speed").value = state.settings.simulatorSpeed;
                
                // Render everything
                initCharts();
                updateUI();
                
                // Fetch real live prices on load
                fetchLiveStockPrices();
                fetchLiveMFNavs();
                
                startSimulator();
            } catch (e) {
                console.error("Error loading local storage state, fallback to defaults.", e);
                loadDefaults();
            }
        } else {
            // Seed a default portfolio so the user isn't presented with an empty dashboard
            loadDefaults();
        }

        // Initialize UI event handlers
        setupEventListeners();
        lucide.createIcons();
    }

    function loadDefaults() {
        // Seeding initial holdings & transactions
        state.holdings = {
            stocks: {
                "RELIANCE": { symbol: "RELIANCE", name: "Reliance Industries Ltd.", quantity: 50, avgPrice: 2350.00, totalCost: 117500.00, basePrice: 2450.00, currentPrice: 2450.00, sector: "Energy & Petrochemicals" },
                "TCS": { symbol: "TCS", name: "Tata Consultancy Services Ltd.", quantity: 20, avgPrice: 3900.00, totalCost: 78000.00, basePrice: 3820.00, currentPrice: 3820.00, sector: "Information Technology" },
                "HDFCBANK": { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", quantity: 100, avgPrice: 1550.00, totalCost: 155000.00, basePrice: 1610.00, currentPrice: 1610.00, sector: "Financial Services" }
            },
            mutualFunds: {
                "120847": { code: "120847", name: "Parag Parikh Flexi Cap Fund - Direct Growth", category: "Equity - Flexi Cap", units: 800, avgPrice: 72.00, totalCost: 57600.00, currentNav: 78.45 },
                "119551": { code: "119551", name: "SBI Bluechip Fund - Direct Growth", category: "Equity - Large Cap", units: 500, avgPrice: 80.00, totalCost: 40000.00, currentNav: 85.12 }
            }
        };

        // Date constants for tax estimations (e.g. showing long-term and short-term holdings)
        const dateLTCG = "2025-02-10";
        const dateSTCG = "2026-03-01";

        state.transactions = [
            { id: "t1", assetClass: "stock", symbol: "RELIANCE", type: "BUY", qty: 50, price: 2350.00, brokerage: 50.00, date: dateLTCG },
            { id: "t2", assetClass: "stock", symbol: "TCS", type: "BUY", qty: 20, price: 3900.00, brokerage: 80.00, date: dateLTCG },
            { id: "t3", assetClass: "stock", symbol: "HDFCBANK", type: "BUY", qty: 100, price: 1550.00, brokerage: 40.00, date: dateSTCG },
            { id: "t4", assetClass: "mf", symbol: "120847", name: "Parag Parikh Flexi Cap Fund - Direct Growth", type: "BUY", qty: 800, price: 72.00, brokerage: 0, date: dateLTCG },
            { id: "t5", assetClass: "mf", symbol: "119551", name: "SBI Bluechip Fund - Direct Growth", type: "BUY", qty: 500, price: 80.00, brokerage: 0, date: dateSTCG }
        ];

        state.sips = [
            { id: "s1", amfiCode: "120847", name: "Parag Parikh Flexi Cap Fund - Direct Growth", amount: 5000, day: 5 },
            { id: "s2", amfiCode: "118989", name: "Nippon India Small Cap Fund - Direct Growth", amount: 3000, day: 10 }
        ];

        // Seed some realized gains to demonstrate the Tax tab right away
        state.realizedGains = [
            {
                id: "rg1",
                assetClass: "stock",
                symbol: "ITC",
                name: "ITC Ltd.",
                qty: 150,
                costPrice: 380.00,
                sellPrice: 435.00,
                costVal: 57000.00,
                sellVal: 65250.00,
                dateBought: "2025-08-15",
                dateSold: "2026-02-10",
                holdingPeriodDays: 179,
                taxCategory: "Equity STCG",
                realizedGain: 8250.00,
                taxOwed: 1650.00 // 20%
            },
            {
                id: "rg2",
                assetClass: "stock",
                symbol: "TATASTEEL",
                name: "Tata Steel Ltd.",
                qty: 1000,
                costPrice: 130.00,
                sellPrice: 175.00,
                costVal: 130000.00,
                sellVal: 175000.00,
                dateBought: "2024-04-10",
                dateSold: "2026-05-15",
                holdingPeriodDays: 765,
                taxCategory: "Equity LTCG",
                realizedGain: 45000.00,
                taxOwed: 5625.00 // 12.5% (simplified prior to cumulative exemption threshold check)
            },
            {
                id: "rg3",
                assetClass: "mf",
                symbol: "119808",
                name: "Aditya Birla Sun Life Liquid Fund - Direct Growth",
                qty: 50,
                costPrice: 370.00,
                sellPrice: 395.20,
                costVal: 18500.00,
                sellVal: 19760.00,
                dateBought: "2025-10-01",
                dateSold: "2026-03-25",
                holdingPeriodDays: 175,
                taxCategory: "Debt Slab Rate",
                realizedGain: 1260.00,
                taxOwed: 378.00 // 30% slab
            }
        ];

        state.settings = {
            theme: "dark",
            riskProfile: "balanced",
            targetStockPercent: 50,
            taxSlab: 30,
            simulatorSpeed: 3000
        };

        saveToLocalStorage();
        initCharts();
        updateUI();
        
        // Fetch real live prices on load
        fetchLiveStockPrices();
        fetchLiveMFNavs();
        
        startSimulator();
        showToast("Default sample portfolio loaded!", "gain");
    }

    function saveToLocalStorage() {
        localStorage.setItem("pinnacle_portfolio_state", JSON.stringify(state));
    }

    // -------------------------------------------------------------
    // 3. THE SIMULATOR (RANDOM WALK PRICE UPDATES)
    // -------------------------------------------------------------
    let apiPollCounter = 0;

    function getMarketStatus() {
        // Compute Indian Standard Time (IST is UTC+5.5)
        const date = new Date();
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const istTime = new Date(utc + (3600000 * 5.5));
        
        const day = istTime.getDay(); // 0 = Sun, 6 = Sat
        const hour = istTime.getHours();
        const minute = istTime.getMinutes();
        
        if (day === 0 || day === 6) {
            return { open: false, status: "Closed", detail: "Market Closed (Weekend)" };
        }
        
        const timeInMinutes = hour * 60 + minute;
        const startMinutes = 9 * 60 + 15; // 9:15 AM IST
        const endMinutes = 15 * 60 + 30; // 3:30 PM IST
        
        if (timeInMinutes >= startMinutes && timeInMinutes <= endMinutes) {
            return { open: true, status: "Live", detail: "Market Open (Live price feed)" };
        } else if (timeInMinutes < startMinutes) {
            return { open: false, status: "Closed", detail: "Market Closed (Opens at 9:15 AM IST)" };
        } else {
            return { open: false, status: "Closed", detail: "Market Closed (Market hours: 9:15 AM - 3:30 PM IST)" };
        }
    }

    function fetchStockPriceFromChart(symbol) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`;
        const primaryUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        
        return fetch(primaryUrl)
            .then(res => {
                if (!res.ok) throw new Error("Primary proxy failed");
                return res.json();
            })
            .then(data => {
                const meta = data?.chart?.result?.[0]?.meta;
                if (!meta) throw new Error("Invalid chart response format");
                return {
                    price: parseFloat(meta.regularMarketPrice),
                    prevClose: parseFloat(meta.chartPreviousClose || meta.previousClose)
                };
            })
            .catch(err => {
                console.warn(`Primary CORS proxy failed for ${symbol}, trying backup proxy...`, err);
                const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                return fetch(backupUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("Backup proxy failed");
                        return res.json();
                    })
                    .then(resData => {
                        const parsed = JSON.parse(resData.contents);
                        const meta = parsed?.chart?.result?.[0]?.meta;
                        if (!meta) throw new Error("Invalid chart response format in backup");
                        return {
                            price: parseFloat(meta.regularMarketPrice),
                            prevClose: parseFloat(meta.chartPreviousClose || meta.previousClose)
                        };
                    });
            });
    }

    function fetchLiveStockPrices() {
        if (!window.marketStocks || window.marketStocks.length === 0) return Promise.resolve();
        
        let promiseChain = Promise.resolve();
        
        window.marketStocks.forEach(stock => {
            promiseChain = promiseChain.then(() => {
                return fetchStockPriceFromChart(stock.symbol)
                    .then(data => {
                        const { price, prevClose } = data;
                        if (price && !isNaN(price)) {
                            stock.currentPrice = price;
                            if (prevClose && !isNaN(prevClose)) {
                                stock.basePrice = prevClose;
                            }
                            stock.change = stock.currentPrice - stock.basePrice;
                            stock.changePercent = (stock.change / stock.basePrice) * 100;
                            
                            // Update active holdings in state if present
                            if (state.holdings.stocks[stock.symbol]) {
                                state.holdings.stocks[stock.symbol].currentPrice = price;
                                state.holdings.stocks[stock.symbol].basePrice = stock.basePrice;
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`Error updating live price for stock ${stock.symbol}:`, err);
                    })
                    .then(() => {
                        // Stagger requests by 200ms to avoid rate-limiting on proxies
                        return new Promise(resolve => setTimeout(resolve, 200));
                    });
            });
        });
        
        return promiseChain
            .then(() => {
                recalculatePortfolioTotals();
                updateUI();
                console.log("Live stock prices updated successfully from Yahoo Finance Charts API");
            })
            .catch(err => {
                console.error("Error in sequential live stock price updates:", err);
            });
    }

    function fetchLiveMFNavs() {
        const codes = Object.keys(state.holdings.mutualFunds);
        if (codes.length === 0) return Promise.resolve();
        
        const fetchPromises = codes.map(code => {
            return fetch(`https://api.mfapi.in/mf/${code}`)
                .then(res => {
                    if (!res.ok) throw new Error(`NAV fetch failed for ${code}`);
                    return res.json();
                })
                .then(data => {
                    if (data && data.data && data.data[0]) {
                        const nav = parseFloat(data.data[0].nav);
                        if (!isNaN(nav)) {
                            state.holdings.mutualFunds[code].currentNav = nav;
                        }
                    }
                })
                .catch(err => console.error(`Error updating live NAV for MF ${code}:`, err));
        });
        
        return Promise.all(fetchPromises)
            .then(() => {
                recalculatePortfolioTotals();
                updateUI();
                console.log("Live Mutual Fund NAVs updated successfully from AMFI");
            });
    }

    function updateMarketStatusUI(market = null) {
        const badge = document.getElementById("market-status-badge");
        if (!badge) return;

        const status = market || getMarketStatus();
        badge.innerText = status.status;
        badge.title = status.detail;

        if (status.open) {
            badge.className = "badge badge-gain";
            badge.style.borderColor = "rgba(16, 185, 129, 0.3)";
        } else {
            badge.className = "badge badge-loss";
            badge.style.borderColor = "rgba(244, 63, 94, 0.3)";
        }
    }

    function startSimulator() {
        if (simulatorInterval) clearInterval(simulatorInterval);
        
        if (state.settings.simulatorSpeed === "paused") {
            updateMarketStatusUI();
            return;
        }

        // Initialize status UI on start
        updateMarketStatusUI();

        simulatorInterval = setInterval(() => {
            const market = getMarketStatus();
            updateMarketStatusUI(market);

            if (!market.open) {
                // If market is closed, do not fluctuate or poll API
                return;
            }

            // Market is open: handle API quote polling every 30 seconds
            apiPollCounter += parseInt(state.settings.simulatorSpeed);
            if (apiPollCounter >= 30000) {
                apiPollCounter = 0;
                fetchLiveStockPrices();
            }

            let changesOccured = false;
            
            // Fluctuate Stocks in window.marketStocks (simulate volatility)
            if (window.marketStocks) {
                window.marketStocks.forEach(stock => {
                    const volatility = 0.003 * stock.beta; // Reduced volatility slightly for realism
                    const rand = (Math.random() - 0.5) * 2; 
                    const changePercent = rand * volatility;
                    const priceDiff = stock.currentPrice * changePercent;
                    
                    stock.currentPrice = Math.max(1.0, stock.currentPrice + priceDiff);
                    stock.change = stock.currentPrice - stock.basePrice;
                    stock.changePercent = (stock.change / stock.basePrice) * 100;

                    if (state.holdings.stocks[stock.symbol]) {
                        state.holdings.stocks[stock.symbol].currentPrice = stock.currentPrice;
                        changesOccured = true;
                    }
                });
            }

            // Fluctuate Mutual Fund NAVs slowly
            Object.keys(state.holdings.mutualFunds).forEach(code => {
                const mf = state.holdings.mutualFunds[code];
                const rand = (Math.random() - 0.49) * 2; 
                const navDiff = mf.currentNav * (rand * 0.0005); 
                
                mf.currentNav = Math.max(1.0, mf.currentNav + navDiff);
                changesOccured = true;
            });

            if (changesOccured) {
                updateTickers();
                recalculatePortfolioTotals();
                updateDashboardTbody();
                updateStocksTbody();
                updateMfsTbody();
                updateAdvisoryTab();
                updateCharts();
            }
        }, parseInt(state.settings.simulatorSpeed));
    }

    // -------------------------------------------------------------
    // 4. PORTFOLIO CALCULATION ENGINE
    // -------------------------------------------------------------
    let totals = {
        invested: 0,
        current: 0,
        gain: 0,
        gainPercent: 0,
        dayGain: 0,
        dayGainPercent: 0,
        stocksCost: 0,
        stocksCurrent: 0,
        mfsCost: 0,
        mfsCurrent: 0
    };

    // Keep track of historical valuations for sparkline rendering
    let historicalValuations = [];

    function recalculatePortfolioTotals() {
        let stocksCost = 0;
        let stocksCurrent = 0;
        let mfsCost = 0;
        let mfsCurrent = 0;
        let totalDayGain = 0;

        // Calculate Stocks
        Object.keys(state.holdings.stocks).forEach(sym => {
            const h = state.holdings.stocks[sym];
            if (h.quantity > 0) {
                stocksCost += h.totalCost;
                stocksCurrent += h.quantity * h.currentPrice;
                
                // Track day's gain (mocked by using the current live change percent)
                const mockStock = window.marketStocks.find(s => s.symbol === sym);
                if (mockStock) {
                    const priceDiff = mockStock.currentPrice - (mockStock.currentPrice / (1 + mockStock.changePercent/100));
                    totalDayGain += priceDiff * h.quantity;
                }
            }
        });

        // Calculate Mutual Funds
        Object.keys(state.holdings.mutualFunds).forEach(code => {
            const h = state.holdings.mutualFunds[code];
            if (h.units > 0) {
                mfsCost += h.totalCost;
                mfsCurrent += h.units * h.currentNav;
                
                // MF Day changes are simulated smaller
                const navBefore = h.currentNav / 1.0005; 
                totalDayGain += (h.currentNav - navBefore) * h.units;
            }
        });

        totals.stocksCost = stocksCost;
        totals.stocksCurrent = stocksCurrent;
        totals.mfsCost = mfsCost;
        totals.mfsCurrent = mfsCurrent;

        totals.invested = stocksCost + mfsCost;
        totals.current = stocksCurrent + mfsCurrent;
        totals.gain = totals.current - totals.invested;
        totals.gainPercent = totals.invested > 0 ? (totals.gain / totals.invested) * 100 : 0;
        
        totals.dayGain = totalDayGain;
        totals.dayGainPercent = totals.current > 0 ? (totalDayGain / totals.current) * 100 : 0;

        // Maintain historical data for Chart.js trend line
        if (historicalValuations.length === 0) {
            // Seed a nice historical trend curve
            for (let i = 6; i >= 1; i--) {
                historicalValuations.push(totals.invested * (0.95 - (i * 0.015)) + (totals.gain * (0.8 - i * 0.1)));
            }
            historicalValuations.push(totals.current);
        } else {
            // Maintain a max list of 15 tick updates
            historicalValuations.push(totals.current);
            if (historicalValuations.length > 15) {
                historicalValuations.shift();
            }
        }

        updateDashboardMetrics();
    }

    // -------------------------------------------------------------
    // 5. DOM UPDATERS
    // -------------------------------------------------------------
    function updateUI() {
        updateTickers();
        recalculatePortfolioTotals();
        updateDashboardTbody();
        updateStocksTbody();
        updateMfsTbody();
        updateSipTbody();
        updateAdvisoryTab();
        updateTaxTab();
        updateSettingsUI();
        updateCharts();
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(val);
    }

    function updateTickers() {
        const track = document.getElementById("live-ticker-track");
        if (!track || !window.marketStocks) return;

        track.innerHTML = "";
        window.marketStocks.forEach(stock => {
            const isPos = stock.changePercent >= 0;
            const sign = isPos ? "+" : "";
            const colorClass = isPos ? "color: var(--color-gain)" : "color: var(--color-loss)";
            const icon = isPos ? "▲" : "▼";

            const item = document.createElement("div");
            item.className = "ticker-item";
            item.innerHTML = `
                <span class="symbol">${stock.symbol}</span>
                <span class="price">${stock.currentPrice.toFixed(2)}</span>
                <span class="change" style="${colorClass}">${icon} ${sign}${stock.changePercent.toFixed(2)}%</span>
            `;
            track.appendChild(item);
        });
    }

    function updateDashboardMetrics() {
        const netWorth = document.getElementById("net-worth-val");
        const netWorthChange = document.getElementById("net-worth-change");
        const dayGain = document.getElementById("day-gain-val");
        const dayGainPercent = document.getElementById("day-gain-percent");
        const totalInvested = document.getElementById("total-invested-val");
        const allocationLabel = document.getElementById("split-percentage-label");

        if (netWorth) netWorth.innerText = formatCurrency(totals.current);
        
        if (netWorthChange) {
            const sign = totals.gain >= 0 ? "+" : "";
            netWorthChange.innerHTML = `<i data-lucide="${totals.gain >= 0 ? 'arrow-up-right' : 'arrow-down-right'}" style="width: 14px; height: 14px;"></i> ${sign}${totals.gainPercent.toFixed(2)}%`;
            netWorthChange.className = `metric-change ${totals.gain >= 0 ? 'positive' : 'negative'}`;
        }

        if (dayGain) {
            dayGain.innerText = formatCurrency(totals.dayGain);
            dayGain.className = `metric-value ${totals.dayGain >= 0 ? 'color: var(--color-gain)' : 'color: var(--color-loss)'}`;
        }

        if (dayGainPercent) {
            const sign = totals.dayGain >= 0 ? "+" : "";
            dayGainPercent.innerHTML = `<i data-lucide="${totals.dayGain >= 0 ? 'arrow-up-right' : 'arrow-down-right'}" style="width: 14px; height: 14px;"></i> ${sign}${totals.dayGainPercent.toFixed(2)}%`;
            dayGainPercent.className = `metric-change ${totals.dayGain >= 0 ? 'positive' : 'negative'}`;
        }

        if (totalInvested) totalInvested.innerText = formatCurrency(totals.invested);

        if (allocationLabel) {
            const total = totals.stocksCurrent + totals.mfsCurrent;
            const stockPct = total > 0 ? (totals.stocksCurrent / total) * 100 : 0;
            const mfPct = total > 0 ? (totals.mfsCurrent / total) * 100 : 0;
            allocationLabel.innerText = `Stocks: ${stockPct.toFixed(0)}% | MFs: ${mfPct.toFixed(0)}%`;
        }

        // Render mini progress bars for sectors on Dashboard Left
        updateSectorProgress();
        lucide.createIcons();
    }

    function updateSectorProgress() {
        const container = document.getElementById("sector-bars-container");
        if (!container) return;

        // Calculate sector totals
        const sectors = {};
        let grandTotal = 0;

        Object.values(state.holdings.stocks).forEach(h => {
            const val = h.quantity * h.currentPrice;
            if (val > 0) {
                sectors[h.sector] = (sectors[h.sector] || 0) + val;
                grandTotal += val;
            }
        });

        Object.values(state.holdings.mutualFunds).forEach(h => {
            const val = h.units * h.currentNav;
            if (val > 0) {
                // Classified under mutual fund allocations
                const sect = h.category || "Mutual Fund";
                sectors[sect] = (sectors[sect] || 0) + val;
                grandTotal += val;
            }
        });

        if (grandTotal === 0) {
            container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem;">No holdings loaded.</p>`;
            return;
        }

        container.innerHTML = "";
        
        // Sort sectors descending
        const sortedSectors = Object.entries(sectors).sort((a,b) => b[1] - a[1]);
        
        // Take top 4 sectors
        sortedSectors.slice(0, 4).forEach(([sect, val]) => {
            const pct = (val / grandTotal) * 100;
            const bar = document.createElement("div");
            bar.style.marginBottom = "0.75rem";
            bar.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size: 0.8rem; margin-bottom: 0.2rem;">
                    <span style="color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 150px;">${sect}</span>
                    <span style="font-weight:600;">${pct.toFixed(1)}%</span>
                </div>
                <div class="alloc-bar-bg" style="margin:0; height:4px;">
                    <div class="alloc-bar-fill" style="width: ${pct}%; background: linear-gradient(to right, var(--color-primary), var(--color-secondary));"></div>
                </div>
            `;
            container.appendChild(bar);
        });
    }

    function updateDashboardTbody() {
        const tbody = document.getElementById("top-holdings-tbody");
        if (!tbody) return;

        // Compile list of active holdings
        const list = [];
        Object.values(state.holdings.stocks).forEach(h => {
            if (h.quantity > 0) {
                list.push({
                    type: "Stock",
                    symbol: h.symbol,
                    qty: h.quantity,
                    avg: h.avgPrice,
                    curr: h.currentPrice,
                    cost: h.totalCost,
                    val: h.quantity * h.currentPrice
                });
            }
        });

        Object.values(state.holdings.mutualFunds).forEach(h => {
            if (h.units > 0) {
                list.push({
                    type: "Mutual Fund",
                    symbol: h.name,
                    qty: h.units,
                    avg: h.avgPrice,
                    curr: h.currentNav,
                    cost: h.totalCost,
                    val: h.units * h.currentNav
                });
            }
        });

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                        Your portfolio is empty. Click <strong>Add Asset</strong> to populate holdings.
                    </td>
                </tr>`;
            return;
        }

        // Sort descending by current value
        list.sort((a,b) => b.val - a.val);

        tbody.innerHTML = "";
        list.forEach(item => {
            const ret = item.val - item.cost;
            const retPct = item.cost > 0 ? (ret / item.cost) * 100 : 0;
            const badgeClass = ret >= 0 ? "badge-gain" : "badge-loss";
            const icon = ret >= 0 ? "▲" : "▼";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span class="badge ${item.type === 'Stock' ? 'badge-info' : 'badge-warning'}">${item.type}</span></td>
                <td style="font-weight: 600; max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.symbol}</td>
                <td>${item.qty.toFixed(item.type === 'Stock' ? 0 : 3)}</td>
                <td>${formatCurrency(item.avg)}</td>
                <td>${formatCurrency(item.curr)}</td>
                <td>${formatCurrency(item.cost)}</td>
                <td>${formatCurrency(item.val)}</td>
                <td style="color: ${ret >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}; font-weight:600;">${formatCurrency(ret)}</td>
                <td>
                    <span class="badge ${badgeClass}">${icon} ${Math.abs(retPct).toFixed(2)}%</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateStocksTbody() {
        const tbody = document.getElementById("stock-holdings-tbody");
        if (!tbody) return;

        // Update top mini metrics
        document.getElementById("stock-cost-val").innerText = formatCurrency(totals.stocksCost);
        document.getElementById("stock-value-val").innerText = formatCurrency(totals.stocksCurrent);
        
        const stRet = totals.stocksCurrent - totals.stocksCost;
        const stRetPct = totals.stocksCost > 0 ? (stRet / totals.stocksCost) * 100 : 0;
        const retEl = document.getElementById("stock-returns-val");
        retEl.innerText = `${formatCurrency(stRet)} (${stRetPct.toFixed(2)}%)`;
        retEl.style.color = stRet >= 0 ? "var(--color-gain)" : "var(--color-loss)";

        tbody.innerHTML = "";

        const activeStocks = Object.values(state.holdings.stocks).filter(h => h.quantity > 0);
        
        if (activeStocks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">
                        No active stock positions. Click <strong>Transact Stock</strong> to record purchase.
                    </td>
                </tr>`;
            return;
        }

        activeStocks.forEach(h => {
            const cost = h.totalCost;
            const val = h.quantity * h.currentPrice;
            const ret = val - cost;
            const retPct = cost > 0 ? (ret / cost) * 100 : 0;
            
            // Calculate Day returns
            const mock = window.marketStocks.find(s => s.symbol === h.symbol);
            const dayRetPercent = mock ? mock.changePercent : 0;
            const dayRetAmount = mock ? (h.currentPrice - (h.currentPrice / (1 + dayRetPercent/100))) * h.quantity : 0;

            // Suggested advice tag
            const advice = getAdvisoryLabel("stock", h);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 700;">${h.symbol}</td>
                <td>${h.quantity}</td>
                <td>${formatCurrency(h.avgPrice)}</td>
                <td>${formatCurrency(h.currentPrice)}</td>
                <td>${formatCurrency(cost)}</td>
                <td>${formatCurrency(val)}</td>
                <td style="color: ${dayRetAmount >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}">
                    ${dayRetAmount >= 0 ? '+' : ''}${formatCurrency(dayRetAmount)} (${dayRetPercent.toFixed(2)}%)
                </td>
                <td style="color: ${ret >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}; font-weight:600;">
                    ${ret >= 0 ? '+' : ''}${formatCurrency(ret)} (${retPct.toFixed(2)}%)
                </td>
                <td>
                    <span class="badge ${getAdviceBadgeClass(advice)}">${advice}</span>
                </td>
                <td>
                    <div style="display:flex; gap: 0.25rem;">
                        <button class="action-btn quick-buy-stock" data-symbol="${h.symbol}" title="Add Buy Transaction"><i data-lucide="plus" style="width: 14px; height: 14px;"></i></button>
                        <button class="action-btn quick-sell-stock" data-symbol="${h.symbol}" title="Sell Position" style="color: var(--color-loss);"><i data-lucide="minus" style="width: 14px; height: 14px;"></i></button>
                        <button class="action-btn quick-remove-stock" data-symbol="${h.symbol}" title="Remove Holding" style="color: var(--color-loss);"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add action triggers dynamically
        document.querySelectorAll(".quick-buy-stock").forEach(btn => {
            btn.addEventListener("click", () => openTransactionModal("stock", btn.dataset.symbol, "BUY"));
        });
        document.querySelectorAll(".quick-sell-stock").forEach(btn => {
            btn.addEventListener("click", () => openTransactionModal("stock", btn.dataset.symbol, "SELL"));
        });
        document.querySelectorAll(".quick-remove-stock").forEach(btn => {
            btn.addEventListener("click", () => removeHolding("stock", btn.dataset.symbol));
        });

        // Build Transactions logs list
        const txTbody = document.getElementById("stock-transactions-tbody");
        if (txTbody) {
            const stockTxs = state.transactions.filter(t => t.assetClass === "stock");
            if (stockTxs.length === 0) {
                txTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No direct equity transactions.</td></tr>`;
            } else {
                txTbody.innerHTML = "";
                // Render reverse order (newest first)
                [...stockTxs].reverse().forEach(t => {
                    const row = document.createElement("tr");
                    const amount = t.qty * t.price;
                    const sign = t.type === "BUY" ? "-" : "+";
                    const amtColor = t.type === "BUY" ? "color: var(--color-loss)" : "color: var(--color-gain)";
                    
                    row.innerHTML = `
                        <td>${t.date}</td>
                        <td style="font-weight:600;">${t.symbol}</td>
                        <td><span class="badge ${t.type === 'BUY' ? 'badge-info' : 'badge-warning'}">${t.type}</span></td>
                        <td>${t.qty}</td>
                        <td>${formatCurrency(t.price)}</td>
                        <td>${formatCurrency(t.brokerage)}</td>
                        <td style="${amtColor}; font-weight:600;">${sign}${formatCurrency(amount + (t.type === "BUY" ? t.brokerage : -t.brokerage))}</td>
                    `;
                    txTbody.appendChild(row);
                });
            }
        }
        lucide.createIcons();
    }

    function updateMfsTbody() {
        const tbody = document.getElementById("mf-holdings-tbody");
        if (!tbody) return;

        // Update top mini metrics
        document.getElementById("mf-cost-val").innerText = formatCurrency(totals.mfsCost);
        document.getElementById("mf-value-val").innerText = formatCurrency(totals.mfsCurrent);
        
        const mfRet = totals.mfsCurrent - totals.mfsCost;
        const mfRetPct = totals.mfsCost > 0 ? (mfRet / totals.mfsCost) * 100 : 0;
        const retEl = document.getElementById("mf-returns-val");
        retEl.innerText = `${formatCurrency(mfRet)} (${mfRetPct.toFixed(2)}%)`;
        retEl.style.color = mfRet >= 0 ? "var(--color-gain)" : "var(--color-loss)";

        tbody.innerHTML = "";

        const activeMfs = Object.values(state.holdings.mutualFunds).filter(h => h.units > 0);
        
        if (activeMfs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">
                        No active mutual fund holdings. Click <strong>Buy Mutual Fund</strong> or search AMFI to start.
                    </td>
                </tr>`;
            return;
        }

        activeMfs.forEach(h => {
            const cost = h.totalCost;
            const val = h.units * h.currentNav;
            const ret = val - cost;
            const retPct = cost > 0 ? (ret / cost) * 100 : 0;
            const advice = getAdvisoryLabel("mf", h);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 600; max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${h.name}">
                    ${h.name}
                    <div style="font-size:0.75rem; color: var(--text-muted);">${h.category} • Code: ${h.code}</div>
                </td>
                <td>${h.units.toFixed(3)}</td>
                <td>${formatCurrency(h.avgPrice)}</td>
                <td>${formatCurrency(h.currentNav)}</td>
                <td>${formatCurrency(cost)}</td>
                <td>${formatCurrency(val)}</td>
                <td style="color: ${ret >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}; font-weight:600;">
                    ${ret >= 0 ? '+' : ''}${formatCurrency(ret)} (${retPct.toFixed(2)}%)
                </td>
                <td>
                    <span class="badge ${getAdviceBadgeClass(advice)}">${advice}</span>
                </td>
                <td>
                    <div style="display:flex; gap: 0.25rem;">
                        <button class="action-btn quick-topup-mf" data-code="${h.code}" data-name="${h.name}" title="Buy More / Top Up"><i data-lucide="plus" style="width: 14px; height: 14px;"></i></button>
                        <button class="action-btn quick-redeem-mf" data-code="${h.code}" data-name="${h.name}" title="Redeem Units" style="color: var(--color-loss);"><i data-lucide="minus" style="width: 14px; height: 14px;"></i></button>
                        <button class="action-btn quick-remove-mf" data-code="${h.code}" data-name="${h.name}" title="Remove Holding" style="color: var(--color-loss);"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add action triggers dynamically
        document.querySelectorAll(".quick-topup-mf").forEach(btn => {
            btn.addEventListener("click", () => openTransactionModal("mf", btn.dataset.code, "BUY", btn.dataset.name));
        });
        document.querySelectorAll(".quick-redeem-mf").forEach(btn => {
            btn.addEventListener("click", () => openTransactionModal("mf", btn.dataset.code, "SELL", btn.dataset.name));
        });
        document.querySelectorAll(".quick-remove-mf").forEach(btn => {
            btn.addEventListener("click", () => removeHolding("mf", btn.dataset.code, btn.dataset.name));
        });

        // Build MF Transactions ledger
        const txTbody = document.getElementById("mf-transactions-tbody");
        if (txTbody) {
            const mfTxs = state.transactions.filter(t => t.assetClass === "mf");
            if (mfTxs.length === 0) {
                txTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No mutual fund ledger entries.</td></tr>`;
            } else {
                txTbody.innerHTML = "";
                [...mfTxs].reverse().forEach(t => {
                    const row = document.createElement("tr");
                    const amount = t.qty * t.price;
                    row.innerHTML = `
                        <td>${t.date}</td>
                        <td style="max-width: 150px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${t.name || t.symbol}</td>
                        <td><span class="badge ${t.type === 'BUY' ? 'badge-info' : 'badge-warning'}">${t.type}</span></td>
                        <td>${t.qty.toFixed(3)}</td>
                        <td>${formatCurrency(t.price)}</td>
                        <td style="font-weight:600;">${formatCurrency(amount)}</td>
                    `;
                    txTbody.appendChild(row);
                });
            }
        }
        lucide.createIcons();
    }

    function updateSipTbody() {
        const tbody = document.getElementById("sips-tbody");
        if (!tbody) return;

        tbody.innerHTML = "";
        if (state.sips.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
                        No systematic investment plans currently active.
                    </td>
                </tr>`;
            return;
        }

        state.sips.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 500; font-size: 0.85rem; max-width: 180px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${s.name}</td>
                <td style="font-weight: 600;">${formatCurrency(s.amount)}</td>
                <td>Day ${s.day} of month</td>
                <td>
                    <button class="action-btn cancel-sip-btn" data-id="${s.id}" style="color: var(--color-loss);" title="Cancel SIP">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Cancel SIP logic
        document.querySelectorAll(".cancel-sip-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                state.sips = state.sips.filter(s => s.id !== id);
                saveToLocalStorage();
                updateSipTbody();
                showToast("SIP plan cancelled successfully.", "warning");
            });
        });
        lucide.createIcons();
    }

    // -------------------------------------------------------------
    // 6. ADVISORY ENGINE & REBALANCING LOGIC
    // -------------------------------------------------------------
    function getAdvisoryLabel(assetClass, h) {
        const cost = h.totalCost;
        const val = assetClass === "stock" ? h.quantity * h.currentPrice : h.units * h.currentNav;
        const ratio = cost > 0 ? val / cost : 1;

        if (assetClass === "stock") {
            // High conviction average down
            if (ratio <= 0.93) return "AVERAGE DOWN";
            // Concentrated risk
            const pct = totals.current > 0 ? (val / totals.current) * 100 : 0;
            if (pct > 15) return "TRIM POSITION";
            // Large gain rebalance
            if (ratio >= 1.30) return "PROFIT BOOKING";
            // Stop loss warning
            if (ratio <= 0.80) return "UNDER REVIEW / CAUTION";
            return "HOLD";
        } else {
            // Mutual Fund slow average cost opportunity
            if (ratio <= 0.95) return "ACCUMULATE / BUY";
            const pct = totals.current > 0 ? (val / totals.current) * 100 : 0;
            if (pct > 25) return "TRIM / DIVERSIFY";
            return "HOLD";
        }
    }

    function getAdviceBadgeClass(advice) {
        switch (advice) {
            case "AVERAGE DOWN":
            case "ACCUMULATE / BUY":
                return "badge-gain"; // Green
            case "TRIM POSITION":
            case "TRIM / DIVERSIFY":
            case "PROFIT BOOKING":
                return "badge-warning"; // Amber
            case "UNDER REVIEW / CAUTION":
                return "badge-loss"; // Red
            default:
                return "badge-info"; // Blue/Slate
        }
    }

    function updateAdvisoryTab() {
        const wrapper = document.getElementById("advice-cards-wrapper");
        const badge = document.getElementById("advisor-badge");
        const statusBanner = document.getElementById("rebalance-status-banner");
        
        const targetStock = state.settings.targetStockPercent;
        const targetMF = 100 - targetStock;

        // Current allocation percentage
        const total = totals.stocksCurrent + totals.mfsCurrent;
        const currentStock = total > 0 ? (totals.stocksCurrent / total) * 100 : 0;
        const currentMF = total > 0 ? (totals.mfsCurrent / total) * 100 : 0;

        // Render targets
        document.getElementById("target-stock-perc-disp").innerText = targetStock + "%";
        document.getElementById("current-stock-perc-disp").innerText = currentStock.toFixed(1) + "%";
        document.getElementById("target-mf-perc-disp").innerText = targetMF + "%";
        document.getElementById("current-mf-perc-disp").innerText = currentMF.toFixed(1) + "%";

        document.getElementById("stock-rebalance-progress").style.width = currentStock + "%";
        document.getElementById("mf-rebalance-progress").style.width = currentMF + "%";

        // Determine Rebalancing Banner warning
        let rebalanceAdvice = "";
        let isImbalanced = false;
        
        if (total > 0) {
            const devStock = currentStock - targetStock;
            if (Math.abs(devStock) > 7) {
                isImbalanced = true;
                if (devStock > 0) {
                    rebalanceAdvice = `Your Stocks Core Share exceeds target by <strong>${devStock.toFixed(1)}%</strong>. Consider booking profits in top equity positions and allocating towards Mutual Funds to mitigate volatility.`;
                } else {
                    rebalanceAdvice = `Your Stocks allocation is underweight by <strong>${Math.abs(devStock).toFixed(1)}%</strong>. Consider deploying capital into top value stocks or averaging down on active stock listings.`;
                }
            }
        }

        if (statusBanner) {
            if (isImbalanced) {
                statusBanner.className = "warning-banner";
                statusBanner.style.background = "var(--color-warning-bg)";
                statusBanner.style.borderColor = "rgba(245, 158, 11, 0.3)";
                statusBanner.innerHTML = `
                    <i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: var(--color-warning); flex-shrink: 0;"></i>
                    <div class="warning-banner-text">
                        <strong>Portfolio Imbalance Detected</strong>
                        ${rebalanceAdvice}
                    </div>
                `;
            } else if (total === 0) {
                statusBanner.className = "warning-banner";
                statusBanner.style.background = "rgba(255,255,255,0.03)";
                statusBanner.style.borderColor = "var(--border-color)";
                statusBanner.innerHTML = `
                    <i data-lucide="info" style="width: 20px; height: 20px; color: var(--text-muted); flex-shrink: 0;"></i>
                    <div class="warning-banner-text">
                        <strong>Empty Portfolio State</strong>
                        Allocate assets to begin tracking rebalancing targets and metrics.
                    </div>
                `;
            } else {
                statusBanner.className = "warning-banner";
                statusBanner.style.background = "var(--color-gain-bg)";
                statusBanner.style.borderColor = "rgba(16, 185, 129, 0.3)";
                statusBanner.innerHTML = `
                    <i data-lucide="check-circle" style="width: 20px; height: 20px; color: var(--color-gain); flex-shrink: 0;"></i>
                    <div class="warning-banner-text">
                        <strong>Balanced Portfolio Allocation</strong>
                        Asset splits are within target deviation standard limits (&lt; 7% drift). Excellent execution!
                    </div>
                `;
            }
        }

        // Build list of specific advices
        let adviceCount = 0;
        const advices = [];
        
        // Concentration checks & specific asset alerts
        const riskAlertsList = document.getElementById("risk-alerts-list");
        if (riskAlertsList) {
            riskAlertsList.innerHTML = "";
            let riskAlerts = [];

            // Stock exposure
            Object.values(state.holdings.stocks).forEach(h => {
                if (h.quantity > 0) {
                    const val = h.quantity * h.currentPrice;
                    const cost = h.totalCost;
                    const ratio = val / cost;
                    const pct = total > 0 ? (val / total) * 100 : 0;

                    // Concentration risk
                    if (pct > 15) {
                        riskAlerts.push(`<li><i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: var(--color-warning); display: inline; vertical-align: middle; margin-right: 0.25rem;"></i> High concentration: <strong>${h.symbol}</strong> represents <strong>${pct.toFixed(1)}%</strong> of portfolio value. Suggest trimming to under 15%.</li>`);
                        
                        advices.push({
                            badgeText: "SELL / TRIM",
                            badgeClass: "sell",
                            title: `Trim ${h.symbol} Exposure`,
                            desc: `Concentration reaches ${pct.toFixed(1)}%. Realize gains to diversify holdings.`,
                            amount: formatCurrency(val - cost),
                            reason: `Up ${(ratio - 1)*100 >= 0 ? '+' : ''}${((ratio-1)*100).toFixed(1)}% from cost.`
                        });
                        adviceCount++;
                    }

                    // Average down opportunity
                    if (ratio <= 0.93) {
                        advices.push({
                            badgeText: "AVERAGE",
                            badgeClass: "buy",
                            title: `Average cost on ${h.symbol}`,
                            desc: `Trading at a discount of ${Math.abs((ratio - 1)*100).toFixed(1)}% compared to your buy price of ${formatCurrency(h.avgPrice)}.`,
                            amount: formatCurrency(h.currentPrice),
                            reason: "Cost-basis optimization"
                        });
                        adviceCount++;
                    }

                    // Stop loss
                    if (ratio <= 0.80) {
                        riskAlerts.push(`<li><i data-lucide="x-circle" style="width: 14px; height: 14px; color: var(--color-loss); display: inline; vertical-align: middle; margin-right: 0.25rem;"></i> Heavy Drawdown: <strong>${h.symbol}</strong> is down <strong>${Math.abs((ratio-1)*100).toFixed(1)}%</strong> from average cost.</li>`);
                        advices.push({
                            badgeText: "STOP LOSS",
                            badgeClass: "sell",
                            title: `Evaluate Exit for ${h.symbol}`,
                            desc: `Position is down ${Math.abs((ratio - 1)*100).toFixed(1)}%. Limit further capital exposure.`,
                            amount: formatCurrency(val),
                            reason: "Capital Preservation"
                        });
                        adviceCount++;
                    }
                }
            });

            // MF exposure
            Object.values(state.holdings.mutualFunds).forEach(h => {
                if (h.units > 0) {
                    const val = h.units * h.currentNav;
                    const cost = h.totalCost;
                    const ratio = val / cost;
                    const pct = total > 0 ? (val / total) * 100 : 0;

                    if (pct > 25) {
                        riskAlerts.push(`<li><i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: var(--color-warning); display: inline; vertical-align: middle; margin-right: 0.25rem;"></i> Concentration caution: <strong>${h.name}</strong> represents <strong>${pct.toFixed(1)}%</strong> of portfolio value.</li>`);
                    }

                    if (ratio <= 0.95) {
                        advices.push({
                            badgeText: "TOP UP",
                            badgeClass: "buy",
                            title: `Top-up systematic investment: ${h.name}`,
                            desc: `NAV is down ${Math.abs((ratio - 1)*100).toFixed(1)}% relative to average buying costs. Excellent long term value.`,
                            amount: formatCurrency(h.currentNav),
                            reason: "SIP Top-up Opportunity"
                        });
                        adviceCount++;
                    }
                }
            });

            if (riskAlerts.length === 0) {
                riskAlertsList.innerHTML = `<li><i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--color-gain); display: inline; vertical-align: middle; margin-right: 0.25rem;"></i> No high concentration risks detected. Holdings are highly diversified.</li>`;
            } else {
                riskAlertsList.innerHTML = riskAlerts.join("");
            }
        }

        // Render Actionable Advice cards list
        if (wrapper) {
            if (advices.length === 0) {
                wrapper.innerHTML = `
                    <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
                        <i data-lucide="line-chart" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;"></i>
                        <p>No immediate asset specific suggestions. Your portfolio positions are stable.</p>
                    </div>`;
            } else {
                wrapper.innerHTML = "";
                advices.forEach(adv => {
                    const card = document.createElement("div");
                    card.className = "advice-card";
                    card.innerHTML = `
                        <div class="advice-badge-container">
                            <span class="advice-badge ${adv.badgeClass}">${adv.badgeText}</span>
                        </div>
                        <div class="advice-details">
                            <h4>${adv.title}</h4>
                            <p>${adv.desc}</p>
                        </div>
                        <div class="advice-action">
                            <span class="amt">${adv.amount}</span>
                            <span class="reason">${adv.reason}</span>
                        </div>
                    `;
                    wrapper.appendChild(card);
                });
            }
        }

        // Update advisor tab notification alert badge
        if (badge) {
            if (adviceCount > 0) {
                badge.innerText = adviceCount;
                badge.style.display = "inline-block";
            } else {
                badge.style.display = "none";
            }
        }
        lucide.createIcons();
    }

    // -------------------------------------------------------------
    // 7. TAX COMPILATION & LEDGER RULES
    // -------------------------------------------------------------
    function updateTaxTab() {
        const totalRealizedEl = document.getElementById("tax-realized-gains-val");
        const taxableGainsEl = document.getElementById("tax-taxable-gains-val");
        const liabilityEl = document.getElementById("tax-liability-val");
        const tbody = document.getElementById("tax-ledger-tbody");

        if (state.realizedGains.length === 0) {
            if (totalRealizedEl) totalRealizedEl.innerText = "₹0.00";
            if (taxableGainsEl) taxableGainsEl.innerText = "₹0.00";
            if (liabilityEl) liabilityEl.innerText = "₹0.00";
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                            No sell transactions recorded to generate tax estimations.
                        </td>
                    </tr>`;
            }
            return;
        }

        let totalGains = 0;
        let equityLTCGTotal = 0;
        let equitySTCGTotal = 0;
        let debtGainsTotal = 0;
        let totalTaxOwed = 0;

        tbody.innerHTML = "";
        state.realizedGains.forEach(rg => {
            totalGains += rg.realizedGain;
            
            // Categorize and compute taxes based on holding types
            if (rg.taxCategory === "Equity LTCG") {
                equityLTCGTotal += rg.realizedGain;
            } else if (rg.taxCategory === "Equity STCG") {
                equitySTCGTotal += rg.realizedGain;
            } else {
                // Debt mutual funds taxed at slab rate
                debtGainsTotal += rg.realizedGain;
            }

            const tr = document.createElement("tr");
            const isLoss = rg.realizedGain < 0;
            tr.innerHTML = `
                <td>${rg.dateSold}</td>
                <td><span class="badge ${rg.assetClass === 'stock' ? 'badge-info' : 'badge-warning'}">${rg.assetClass === 'stock' ? 'Stock' : 'MF'}</span></td>
                <td style="font-weight:600;">${rg.symbol}</td>
                <td>${rg.holdingPeriodDays} days</td>
                <td><span style="font-size:0.8rem; font-weight:600; color: var(--text-muted);">${rg.taxCategory}</span></td>
                <td>${formatCurrency(rg.costVal)}</td>
                <td>${formatCurrency(rg.sellVal)}</td>
                <td style="color: ${isLoss ? 'var(--color-loss)' : 'var(--color-gain)'}; font-weight:700;">
                    ${isLoss ? '' : '+'}${formatCurrency(rg.realizedGain)}
                </td>
                <td style="font-weight: 600;">${formatCurrency(rg.taxOwed)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Compute taxation accounting for ₹1.25L exemption on Equity LTCG
        // STCG is taxed at 20% flat
        // LTCG is taxed at 12.5% on amount exceeding ₹1,25,000
        const taxableLTCG = Math.max(0, equityLTCGTotal - 125000);
        const ltcgTax = taxableLTCG * 0.125;
        const stcgTax = equitySTCGTotal * 0.20;
        
        // Debt mutual fund gains taxed at configuration slab rate
        const slabPct = parseFloat(state.settings.taxSlab) / 100;
        const debtTax = debtGainsTotal * slabPct;

        totalTaxOwed = ltcgTax + stcgTax + debtTax;

        if (totalRealizedEl) totalRealizedEl.innerText = formatCurrency(totalGains);
        if (taxableGainsEl) taxableGainsEl.innerText = formatCurrency(equitySTCGTotal + taxableLTCG + debtGainsTotal);
        if (liabilityEl) liabilityEl.innerText = formatCurrency(totalTaxOwed);

        // Update explanatory notes
        const exemptNote = document.getElementById("tax-ltcg-exempt-note");
        if (exemptNote) {
            exemptNote.innerHTML = `LTCG Exemption: <strong>₹1.25L</strong> | Accumulated LTCG: <strong>${formatCurrency(equityLTCGTotal)}</strong>`;
        }
        
        const slabNote = document.getElementById("tax-slab-effective-note");
        if (slabNote) {
            slabNote.innerHTML = `Equity STCG: <strong>20%</strong> | Debt Slab Rate: <strong>${state.settings.taxSlab}%</strong>`;
        }
    }

    // -------------------------------------------------------------
    // 8. CHART RENDERING VIA CHART.JS
    // -------------------------------------------------------------
    function initCharts() {
        // Donut Allocation Chart
        const donutCtx = document.getElementById("allocation-donut-chart");
        if (donutCtx) {
            if (allocationChart) allocationChart.destroy();
            allocationChart = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Stocks', 'Mutual Funds'],
                    datasets: [{
                        data: [totals.stocksCurrent, totals.mfsCurrent],
                        backgroundColor: ['#00e5ff', '#8b5cf6'],
                        borderColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    cutout: '75%'
                }
            });
        }

        // Line trend Chart
        const trendCtx = document.getElementById("portfolio-trend-chart");
        if (trendCtx) {
            if (trendChart) trendChart.destroy();
            
            // X labels (ticks represent periods)
            const labels = historicalValuations.map((_, idx) => `Tick ${idx + 1}`);
            
            trendChart = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Portfolio Value',
                        data: historicalValuations,
                        borderColor: '#00e5ff',
                        borderWidth: 3,
                        pointBackgroundColor: '#00e5ff',
                        pointHoverRadius: 6,
                        tension: 0.35,
                        fill: true,
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                            gradient.addColorStop(0, 'rgba(0, 229, 255, 0.25)');
                            gradient.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
                            return gradient;
                        }
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            display: false
                        },
                        y: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.04)'
                            },
                            ticks: {
                                color: '#64748b',
                                font: {
                                    size: 10
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    function updateCharts() {
        if (allocationChart) {
            allocationChart.data.datasets[0].data = [totals.stocksCurrent, totals.mfsCurrent];
            allocationChart.update();
        }

        if (trendChart) {
            trendChart.data.labels = historicalValuations.map((_, idx) => `Tick ${idx + 1}`);
            trendChart.data.datasets[0].data = historicalValuations;
            trendChart.update();
        }
    }

    // -------------------------------------------------------------
    // 9. EVENT HANDLERS & MODAL CONTROL
    // -------------------------------------------------------------
    function setupEventListeners() {
        // Tab routing switcher
        document.querySelectorAll(".nav-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
                document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

                tab.classList.add("active");
                const targetTabId = tab.dataset.tab;
                document.getElementById(targetTabId).classList.add("active");
                
                // Recalculate size of charts on tab layout restore
                if (allocationChart) allocationChart.resize();
                if (trendChart) trendChart.resize();
            });
        });

        // Theme Toggle (Dark/Light mode switcher)
        const themeBtn = document.getElementById("theme-toggle-btn");
        if (themeBtn) {
            themeBtn.addEventListener("click", () => {
                const currentTheme = document.body.getAttribute("data-theme");
                const nextTheme = currentTheme === "light" ? "dark" : "light";
                document.body.setAttribute("data-theme", nextTheme);
                state.settings.theme = nextTheme;
                saveToLocalStorage();
                updateThemeIcons();
                initCharts(); // Re-render graphs to style appropriately
            });
        }

        // Global Add transaction buttons
        document.getElementById("global-add-transaction-btn").addEventListener("click", () => openTransactionModal());
        document.getElementById("add-stock-btn").addEventListener("click", () => openTransactionModal("stock"));
        document.getElementById("add-mf-btn").addEventListener("click", () => openTransactionModal("mf"));
        
        // Modal cancel & close triggers
        document.getElementById("modal-close-btn").addEventListener("click", closeTransactionModal);
        document.getElementById("modal-cancel-btn").addEventListener("click", closeTransactionModal);
        document.getElementById("sip-close-btn").addEventListener("click", closeSipModal);
        document.getElementById("sip-cancel-btn").addEventListener("click", closeSipModal);
        document.getElementById("setup-sip-btn").addEventListener("click", openSipModal);

        // Tab changes between stocks and mutual funds field layout in modal
        const classSelect = document.getElementById("modal-asset-class");
        if (classSelect) {
            classSelect.addEventListener("change", (e) => {
                toggleModalFields(e.target.value);
            });
        }

        // Real-time dynamic search typing logic for Stocks
        const stockSearchInput = document.getElementById("modal-stock-search");
        if (stockSearchInput) {
            stockSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.trim();
                clearTimeout(searchDebounceTimer);
                if (q.length < 3) {
                    document.getElementById("stock-search-dropdown").style.display = "none";
                    return;
                }
                searchDebounceTimer = setTimeout(() => searchStocks(q, "stock-search-dropdown", selectStockForTransaction), 350);
            });
        }

        // Real-time dynamic search typing logic for Mutual Funds using MFAPI
        const mfSearchInput = document.getElementById("modal-mf-search");
        if (mfSearchInput) {
            mfSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.trim();
                clearTimeout(searchDebounceTimer);
                if (q.length < 3) {
                    document.getElementById("mf-search-dropdown").style.display = "none";
                    return;
                }
                searchDebounceTimer = setTimeout(() => searchAMFI(q, "mf-search-dropdown", selectMFForTransaction), 350);
            });
        }

        const sipSearchInput = document.getElementById("modal-sip-search");
        if (sipSearchInput) {
            sipSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.trim();
                clearTimeout(searchDebounceTimer);
                if (q.length < 3) {
                    document.getElementById("sip-search-dropdown").style.display = "none";
                    return;
                }
                searchDebounceTimer = setTimeout(() => searchAMFI(q, "sip-search-dropdown", selectMFForSIP), 350);
            });
        }

        // Close search results dropdowns clicking outside
        document.addEventListener("click", (e) => {
            if (!e.target.closest("#stock-fields-container")) {
                document.getElementById("stock-search-dropdown").style.display = "none";
            }
            if (!e.target.closest("#mf-fields-container")) {
                document.getElementById("mf-search-dropdown").style.display = "none";
            }
            if (!e.target.closest("#sip-form")) {
                document.getElementById("sip-search-dropdown").style.display = "none";
            }
        });

        // Submit forms handler
        document.getElementById("transaction-form").addEventListener("submit", handleTransactionSubmit);
        document.getElementById("sip-form").addEventListener("submit", handleSipSubmit);

        // Settings config forms save
        document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
        
        // Auto allocation percentage change slider tracker
        const allocSlider = document.getElementById("settings-stock-target");
        if (allocSlider) {
            allocSlider.addEventListener("input", (e) => {
                document.getElementById("settings-stock-target-val").innerText = e.target.value + "%";
                const profile = document.getElementById("settings-risk-profile");
                if (profile.value !== "custom") {
                    profile.value = "custom";
                }
            });
        }

        // Adjust targets based on pre-set Risk Profile choices
        const riskProfileSelect = document.getElementById("settings-risk-profile");
        if (riskProfileSelect) {
            riskProfileSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                const slider = document.getElementById("settings-stock-target");
                
                if (val === "conservative") {
                    slider.value = 30;
                } else if (val === "balanced") {
                    slider.value = 50;
                } else if (val === "aggressive") {
                    slider.value = 70;
                }
                document.getElementById("settings-stock-target-val").innerText = slider.value + "%";
            });
        }

        // Control simulator speed selection
        const speedSelect = document.getElementById("settings-simulator-speed");
        if (speedSelect) {
            speedSelect.addEventListener("change", (e) => {
                state.settings.simulatorSpeed = e.target.value;
                saveToLocalStorage();
                startSimulator();
                showToast(`Simulator updated: ${e.target.value === 'paused' ? 'Paused' : 'Speed changed'}.`, "info");
            });
        }

        // Mock loading & Wiping actions
        document.getElementById("load-sample-btn").addEventListener("click", loadDefaults);
        document.getElementById("clear-data-btn").addEventListener("click", wipeDatabase);

        // Global Import portfolio buttons
        document.getElementById("import-stocks-btn").addEventListener("click", () => openImportModal("stock"));
        document.getElementById("import-mfs-btn").addEventListener("click", () => openImportModal("mf"));

        // Import Modal control triggers
        const importCloseBtn = document.getElementById("import-close-btn");
        if (importCloseBtn) importCloseBtn.addEventListener("click", closeImportModal);
        
        const importCancelBtn = document.getElementById("import-cancel-btn");
        if (importCancelBtn) importCancelBtn.addEventListener("click", closeImportModal);
        
        const importLoadBtn = document.getElementById("import-load-sample-btn");
        if (importLoadBtn) {
            importLoadBtn.addEventListener("click", () => {
                const assetClass = document.getElementById("import-asset-class").value;
                const broker = document.getElementById("import-broker").value;
                const sampleText = sampleData[assetClass]?.[broker] || "";
                document.getElementById("import-text-data").value = sampleText;
                showToast("Sample data loaded. Feel free to edit or click 'Import Assets'!", "info");
            });
        }
        
        const importBrokerSelect = document.getElementById("import-broker");
        if (importBrokerSelect) {
            importBrokerSelect.addEventListener("change", (e) => {
                updateImportHelpText(document.getElementById("import-asset-class").value, e.target.value);
            });
        }
        
        const importFileEl = document.getElementById("import-file");
        if (importFileEl) {
            importFileEl.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById("import-text-data").value = event.target.result;
                    showToast(`File "${file.name}" loaded successfully. Ready to import.`, "gain");
                };
                reader.readAsText(file);
            });
        }
        
        const importForm = document.getElementById("import-form");
        if (importForm) {
            importForm.addEventListener("submit", (e) => {
                e.preventDefault();
                handleImportSubmit();
            });
        }
    }

    function updateThemeIcons() {
        const sun = document.getElementById("theme-sun-icon");
        const moon = document.getElementById("theme-moon-icon");
        const isDark = document.body.getAttribute("data-theme") !== "light";
        
        if (isDark) {
            sun.style.display = "none";
            moon.style.display = "block";
        } else {
            sun.style.display = "block";
            moon.style.display = "none";
        }
    }

    // -------------------------------------------------------------
    // 10. MODALS & FORMS LOGIC IMPLEMENTATIONS
    // -------------------------------------------------------------
    function openTransactionModal(assetClass = "stock", symbol = "", type = "BUY", mfName = "") {
        const modal = document.getElementById("transaction-modal");
        const classSelect = document.getElementById("modal-asset-class");
        const typeSelect = document.getElementById("modal-tx-type");
        const dateInput = document.getElementById("modal-tx-date");

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;

        classSelect.value = assetClass;
        typeSelect.value = type;

        toggleModalFields(assetClass);

        if (assetClass === "stock") {
            document.getElementById("modal-stock-search").value = "";
            document.getElementById("stock-search-dropdown").style.display = "none";
            if (symbol) {
                const stockDetails = window.marketStocks.find(s => s.symbol === symbol) || {};
                document.getElementById("modal-stock-selected-name").value = mfName || stockDetails.name || symbol;
                document.getElementById("modal-stock-selected-symbol").value = symbol;
                updateStockModalPrice();
            } else {
                document.getElementById("modal-stock-selected-name").value = "";
                document.getElementById("modal-stock-selected-symbol").value = "";
                document.getElementById("modal-tx-price").value = "";
            }
        } else {
            document.getElementById("modal-mf-search").value = "";
            document.getElementById("mf-search-dropdown").style.display = "none";
            if (symbol) {
                document.getElementById("modal-mf-selected-name").value = mfName || symbol;
                document.getElementById("modal-mf-selected-code").value = symbol;
                updateMfModalPrice(symbol);
            } else {
                document.getElementById("modal-mf-selected-name").value = "";
                document.getElementById("modal-mf-selected-code").value = "";
                document.getElementById("modal-tx-price").value = "";
            }
        }

        modal.classList.add("active");
    }

    function closeTransactionModal() {
        document.getElementById("transaction-modal").classList.remove("active");
        document.getElementById("transaction-form").reset();
    }

    function toggleModalFields(assetClass) {
        const stockFields = document.getElementById("stock-fields-container");
        const mfFields = document.getElementById("mf-fields-container");
        const qtyLabel = document.getElementById("quantity-label");
        const priceLabel = document.getElementById("price-label");
        const brokerage = document.getElementById("brokerage-field-container");

        if (assetClass === "stock") {
            stockFields.style.display = "block";
            mfFields.style.display = "none";
            qtyLabel.innerText = "Quantity (Shares)";
            priceLabel.innerText = "Price Per Share (₹)";
            brokerage.style.display = "block";
        } else {
            stockFields.style.display = "none";
            mfFields.style.display = "block";
            qtyLabel.innerText = "Units";
            priceLabel.innerText = "NAV Cost per Unit (₹)";
            brokerage.style.display = "none";
        }
    }

    function updateStockModalPrice() {
        const symbol = document.getElementById("modal-stock-selected-symbol").value;
        if (!symbol) return;

        const stock = window.marketStocks.find(s => s.symbol === symbol);
        if (stock) {
            document.getElementById("modal-tx-price").value = stock.currentPrice.toFixed(2);
            return;
        }

        // Fetch live price for the newly searched stock
        fetchStockPriceFromChart(symbol)
            .then(data => {
                const { price, prevClose } = data;
                if (price && !isNaN(price)) {
                    document.getElementById("modal-tx-price").value = price.toFixed(2);
                    const name = document.getElementById("modal-stock-selected-name").value;
                    ensureStockInMarket(symbol, name, price, prevClose);
                }
            })
            .catch(err => {
                console.error("Error fetching live price for newly searched stock", err);
                document.getElementById("modal-tx-price").value = "";
            });
    }

    function updateMfModalPrice(code) {
        // Find in popular mutual funds or load from holdings
        const popular = window.popularMutualFunds.find(m => m.amfiCode === code);
        if (popular) {
            document.getElementById("modal-tx-price").value = popular.baseNav.toFixed(4);
            return;
        }

        const active = state.holdings.mutualFunds[code];
        if (active) {
            document.getElementById("modal-tx-price").value = active.currentNav.toFixed(4);
            return;
        }

        // Query MFAPI endpoint dynamically
        fetch(`https://api.mfapi.in/mf/${code}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.data && data.data[0]) {
                    document.getElementById("modal-tx-price").value = parseFloat(data.data[0].nav).toFixed(4);
                }
            })
            .catch(err => console.error("Error fetching NAV from AMFI lookup API", err));
    }

    function openSipModal() {
        const modal = document.getElementById("sip-modal");
        document.getElementById("modal-sip-selected-name").value = "";
        document.getElementById("modal-sip-selected-code").value = "";
        document.getElementById("modal-sip-search").value = "";
        modal.classList.add("active");
    }

    function closeSipModal() {
        document.getElementById("sip-modal").classList.remove("active");
        document.getElementById("sip-form").reset();
    }

    // -------------------------------------------------------------
    // 11. AMFI API INTERFACES
    // -------------------------------------------------------------
    function searchAMFI(query, dropdownId, onSelectCallback) {
        const dropdown = document.getElementById(dropdownId);
        dropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem;">Searching AMFI data...</div>`;
        dropdown.style.display = "block";

        fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                dropdown.innerHTML = "";
                
                if (!data || data.length === 0) {
                    dropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No funds found matching query.</div>`;
                    return;
                }

                // Show top 7 results
                data.slice(0, 7).forEach(item => {
                    const option = document.createElement("div");
                    option.className = "search-result-item";
                    option.innerText = item.schemeName;
                    option.addEventListener("click", () => {
                        onSelectCallback(item.schemeCode, item.schemeName);
                        dropdown.style.display = "none";
                    });
                    dropdown.appendChild(option);
                });
            })
            .catch(err => {
                console.error("Error querying mutual fund API database", err);
                dropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: var(--color-loss); font-size: 0.85rem;">AMFI search connection failed.</div>`;
            });
    }

    function selectMFForTransaction(code, name) {
        document.getElementById("modal-mf-selected-name").value = name;
        document.getElementById("modal-mf-selected-code").value = code;
        updateMfModalPrice(code);
    }

    function selectMFForSIP(code, name) {
        document.getElementById("modal-sip-selected-name").value = name;
        document.getElementById("modal-sip-selected-code").value = code;
    }

    function searchStocks(query, dropdownId, onSelectCallback) {
        const dropdown = document.getElementById(dropdownId);
        dropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem;">Searching stocks...</div>`;
        dropdown.style.display = "block";

        const localMatches = window.marketStocks.filter(s => 
            s.symbol.toLowerCase().includes(query.toLowerCase()) || 
            s.name.toLowerCase().includes(query.toLowerCase())
        );

        // Fetch from Yahoo Finance Search API via CORS proxy
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;

        fetch(proxyUrl)
            .then(res => {
                if (!res.ok) throw new Error("Primary search proxy failed");
                return res.json();
            })
            .then(data => {
                renderStockSearchResults(data?.quotes || [], localMatches, dropdown, onSelectCallback);
            })
            .catch(err => {
                console.warn("Primary stock search failed, trying backup proxy...", err);
                const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                fetch(backupUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("Backup search proxy failed");
                        return res.json();
                    })
                    .then(resData => {
                        const parsed = JSON.parse(resData.contents);
                        renderStockSearchResults(parsed?.quotes || [], localMatches, dropdown, onSelectCallback);
                    })
                    .catch(backupErr => {
                        console.error("Backup stock search failed too, using local matches", backupErr);
                        renderStockSearchResults([], localMatches, dropdown, onSelectCallback);
                    });
            });
    }

    function renderStockSearchResults(quotes, localMatches, dropdown, onSelectCallback) {
        dropdown.innerHTML = "";
        const merged = [...localMatches.map(m => ({ symbol: m.symbol, name: m.name }))];

        quotes.forEach(q => {
            if (q.quoteType === "EQUITY" && (q.symbol.endsWith(".NS") || q.symbol.endsWith(".BO") || q.exchange === "NSI" || q.exchange === "BSE")) {
                const cleanSymbol = q.symbol.replace(".NS", "").replace(".BO", "");
                if (!merged.some(m => m.symbol === cleanSymbol)) {
                    merged.push({
                        symbol: cleanSymbol,
                        name: q.longname || q.shortname || cleanSymbol
                    });
                }
            }
        });

        if (merged.length === 0) {
            dropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No stocks found matching query.</div>`;
            return;
        }

        merged.slice(0, 7).forEach(item => {
            const option = document.createElement("div");
            option.className = "search-result-item";
            option.innerHTML = `<strong>${item.symbol}</strong> - <span style="font-size: 0.8rem; color: var(--text-secondary);">${item.name}</span>`;
            option.addEventListener("click", () => {
                onSelectCallback(item.symbol, item.name);
                dropdown.style.display = "none";
            });
            dropdown.appendChild(option);
        });
    }

    function selectStockForTransaction(symbol, name) {
        document.getElementById("modal-stock-selected-name").value = name;
        document.getElementById("modal-stock-selected-symbol").value = symbol;
        document.getElementById("modal-stock-search").value = "";
        updateStockModalPrice();
    }

    function ensureStockInMarket(symbol, name, price, basePrice = null, sector = "General Equity") {
        let stock = window.marketStocks.find(s => s.symbol === symbol);
        if (!stock) {
            stock = {
                symbol: symbol,
                name: name,
                sector: sector,
                basePrice: basePrice || price,
                currentPrice: price,
                beta: 1.0,
                change: 0,
                changePercent: 0
            };
            window.marketStocks.push(stock);
        }
        return stock;
    }

    // -------------------------------------------------------------
    // 12. TRANSACTION SUBMISSIONS (FIFO TAX CALCULATIONS)
    // -------------------------------------------------------------
    function handleTransactionSubmit(e) {
        e.preventDefault();

        const assetClass = document.getElementById("modal-asset-class").value;
        const txType = document.getElementById("modal-tx-type").value;
        const date = document.getElementById("modal-tx-date").value;
        const qty = parseFloat(document.getElementById("modal-tx-qty").value);
        const price = parseFloat(document.getElementById("modal-tx-price").value);
        const brokerage = parseFloat(document.getElementById("modal-tx-brokerage").value || 0);

        let symbol = "";
        let name = "";
        let category = "Equity"; // Default category assumption

        if (assetClass === "stock") {
            symbol = document.getElementById("modal-stock-selected-symbol").value;
            name = document.getElementById("modal-stock-selected-name").value;
            if (!symbol || !name) {
                showToast("Please search and select a valid Stock.", "warning");
                return;
            }
        } else {
            symbol = document.getElementById("modal-mf-selected-code").value;
            name = document.getElementById("modal-mf-selected-name").value;
            
            if (!symbol || !name) {
                showToast("Please search and select a valid AMFI Mutual Fund.", "warning");
                return;
            }
            
            // Try to infer category
            if (name.toLowerCase().includes("liquid") || name.toLowerCase().includes("debt") || name.toLowerCase().includes("gilt") || name.toLowerCase().includes("bond")) {
                category = "Debt - Liquid";
            } else if (name.toLowerCase().includes("hybrid") || name.toLowerCase().includes("arbitrage") || name.toLowerCase().includes("asset allocator")) {
                category = "Hybrid";
            } else {
                category = "Equity - Active Growth";
            }
        }

        // Execute transactions logic
        if (txType === "BUY") {
            recordBuyTransaction(assetClass, symbol, name, category, qty, price, brokerage, date);
        } else {
            const hasPosition = recordSellTransaction(assetClass, symbol, name, category, qty, price, brokerage, date);
            if (!hasPosition) return; // Terminate if sell size invalid
        }

        // Save states and redraw UI
        saveToLocalStorage();
        closeTransactionModal();
        updateUI();
    }

    function recordBuyTransaction(assetClass, symbol, name, category, qty, price, brokerage, date) {
        // Record log
        const txId = "tx_" + Date.now();
        state.transactions.push({
            id: txId,
            assetClass,
            symbol,
            name,
            type: "BUY",
            qty,
            price,
            brokerage,
            date
        });

        // Add to holdings holdings
        if (assetClass === "stock") {
            if (!state.holdings.stocks[symbol]) {
                const baseInfo = window.marketStocks.find(s => s.symbol === symbol) || {};
                state.holdings.stocks[symbol] = {
                    symbol,
                    name,
                    quantity: 0,
                    avgPrice: 0,
                    totalCost: 0,
                    basePrice: baseInfo.basePrice || price,
                    currentPrice: baseInfo.currentPrice || price,
                    sector: baseInfo.sector || "General Equity"
                };
            }
            const h = state.holdings.stocks[symbol];
            h.quantity += qty;
            h.totalCost += (qty * price) + brokerage;
            h.avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
        } else {
            if (!state.holdings.mutualFunds[symbol]) {
                state.holdings.mutualFunds[symbol] = {
                    code: symbol,
                    name,
                    category,
                    units: 0,
                    avgPrice: 0,
                    totalCost: 0,
                    currentNav: price
                };
            }
            const h = state.holdings.mutualFunds[symbol];
            h.units += qty;
            h.totalCost += qty * price;
            h.avgPrice = h.units > 0 ? h.totalCost / h.units : 0;
        }

        showToast(`Purchased ${qty.toFixed(assetClass === 'stock'?0:3)} shares of ${symbol} successfully!`, "gain");
    }

    function recordSellTransaction(assetClass, symbol, name, category, qty, price, brokerage, date) {
        if (assetClass === "stock") {
            const h = state.holdings.stocks[symbol];
            if (!h || h.quantity < qty) {
                showToast(`Insufficient Stock positions to sell! Active shares: ${h ? h.quantity : 0}`, "warning");
                return false;
            }

            // Realized gains FIFO logic calculations
            const costOfShares = h.avgPrice * qty;
            const sellVal = price * qty;
            const netSellVal = sellVal - brokerage;
            const realizedG = netSellVal - costOfShares;

            // Compute holding period (Find earliest buy dates of matching quantity for taxes)
            const buyTxs = state.transactions.filter(t => t.assetClass === "stock" && t.symbol === symbol && t.type === "BUY");
            let purchaseDate = date; // Fallback
            if (buyTxs.length > 0) {
                // Approximate bought date from first buy log
                purchaseDate = buyTxs[0].date;
            }

            const pDateObj = new Date(purchaseDate);
            const sDateObj = new Date(date);
            const diffTime = Math.max(0, sDateObj - pDateObj);
            const holdingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Tax class configuration
            const isLTCG = holdingDays >= 365;
            const taxCat = isLTCG ? "Equity LTCG" : "Equity STCG";
            const taxPct = isLTCG ? 12.5 : 20.0;
            // First step raw calculation
            const taxOwed = realizedG > 0 ? realizedG * (taxPct / 100) : 0;

            // Reduce holdings sizes
            h.quantity -= qty;
            h.totalCost = Math.max(0, h.totalCost - costOfShares); // Reduce cost-basis
            h.avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;

            state.realizedGains.push({
                id: "rg_" + Date.now(),
                assetClass,
                symbol,
                name,
                qty,
                costPrice: h.avgPrice,
                sellPrice: price,
                costVal: costOfShares,
                sellVal: sellVal,
                dateBought: purchaseDate,
                dateSold: date,
                holdingPeriodDays: holdingDays,
                taxCategory: taxCat,
                realizedGain: realizedG,
                taxOwed: taxOwed
            });

            // Log ledger order
            state.transactions.push({
                id: "tx_" + Date.now(),
                assetClass,
                symbol,
                name,
                type: "SELL",
                qty,
                price,
                brokerage,
                date
            });
            
            showToast(`Sold ${qty} shares of ${symbol}. Realized returns: ${formatCurrency(realizedG)}`, realizedG >= 0 ? "gain" : "loss");
            return true;

        } else {
            // Mutual Fund Scheme Sell redemption
            const h = state.holdings.mutualFunds[symbol];
            if (!h || h.units < qty) {
                showToast(`Insufficient Units of mutual fund scheme to redeem! Active units: ${h ? h.units.toFixed(3) : 0}`, "warning");
                return false;
            }

            const costOfUnits = h.avgPrice * qty;
            const sellVal = price * qty;
            const realizedG = sellVal - costOfUnits;

            const buyTxs = state.transactions.filter(t => t.assetClass === "mf" && t.symbol === symbol && t.type === "BUY");
            let purchaseDate = date;
            if (buyTxs.length > 0) {
                purchaseDate = buyTxs[0].date;
            }

            const pDateObj = new Date(purchaseDate);
            const sDateObj = new Date(date);
            const diffTime = Math.max(0, sDateObj - pDateObj);
            const holdingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let taxCat = "Equity STCG";
            let taxPct = 20.0;
            
            const isDebt = category.toLowerCase().includes("debt") || category.toLowerCase().includes("liquid");
            
            if (isDebt) {
                taxCat = "Debt Slab Rate";
                taxPct = parseFloat(state.settings.taxSlab);
            } else {
                const isLTCG = holdingDays >= 365;
                taxCat = isLTCG ? "Equity LTCG" : "Equity STCG";
                taxPct = isLTCG ? 12.5 : 20.0;
            }

            const taxOwed = realizedG > 0 ? realizedG * (taxPct / 100) : 0;

            h.units -= qty;
            h.totalCost = Math.max(0, h.totalCost - costOfUnits);
            h.avgPrice = h.units > 0 ? h.totalCost / h.units : 0;

            state.realizedGains.push({
                id: "rg_" + Date.now(),
                assetClass,
                symbol,
                name,
                qty,
                costPrice: h.avgPrice,
                sellPrice: price,
                costVal: costOfUnits,
                sellVal: sellVal,
                dateBought: purchaseDate,
                dateSold: date,
                holdingPeriodDays: holdingDays,
                taxCategory: taxCat,
                realizedGain: realizedG,
                taxOwed: taxOwed
            });

            state.transactions.push({
                id: "tx_" + Date.now(),
                assetClass,
                symbol,
                name,
                type: "SELL",
                qty,
                price,
                brokerage,
                date
            });

            showToast(`Redeemed ${qty.toFixed(3)} units of ${h.name}.`, realizedG >= 0 ? "gain" : "loss");
            return true;
        }
    }

    function removeHolding(assetClass, key, optionalName = "") {
        const displayName = assetClass === "stock" ? key : (optionalName || key);
        if (confirm(`Are you sure you want to remove ${displayName} from your portfolio? This will delete all its transaction history.`)) {
            if (assetClass === "stock") {
                delete state.holdings.stocks[key];
                state.transactions = state.transactions.filter(t => !(t.assetClass === "stock" && t.symbol === key));
                state.realizedGains = state.realizedGains.filter(rg => !(rg.assetClass === "stock" && rg.symbol === key));
            } else {
                delete state.holdings.mutualFunds[key];
                state.transactions = state.transactions.filter(t => !(t.assetClass === "mf" && t.symbol === key));
                state.realizedGains = state.realizedGains.filter(rg => !(rg.assetClass === "mf" && rg.symbol === key));
            }
            saveToLocalStorage();
            updateUI();
            showToast(`${displayName} removed completely.`, "loss");
        }
    }

    function handleSipSubmit(e) {
        e.preventDefault();

        const code = document.getElementById("modal-sip-selected-code").value;
        const name = document.getElementById("modal-sip-selected-name").value;
        const amount = parseFloat(document.getElementById("modal-sip-amount").value);
        const day = parseInt(document.getElementById("modal-sip-day").value);

        if (!code || !name) {
            showToast("Please search and select a Mutual Fund for the SIP plan.", "warning");
            return;
        }

        const id = "sip_" + Date.now();
        state.sips.push({
            id,
            amfiCode: code,
            name,
            amount,
            day
        });

        // Trigger an immediate default SIP purchase to populate units
        // NAV retrieved from MFAPI or set base default index price (approx ₹100.00)
        fetch(`https://api.mfapi.in/mf/${code}`)
            .then(res => res.json())
            .then(data => {
                let nav = 100.00;
                let category = "Equity - Active Growth";
                
                if (data && data.data && data.data[0]) {
                    nav = parseFloat(data.data[0].nav);
                }
                
                if (name.toLowerCase().includes("liquid") || name.toLowerCase().includes("debt")) {
                    category = "Debt - Liquid";
                }

                const unitsBought = amount / nav;
                const today = new Date().toISOString().split('T')[0];
                
                // Record the purchase immediately as first systematic buy installment
                recordBuyTransaction("mf", code, name, category, unitsBought, nav, 0, today);
                
                saveToLocalStorage();
                closeSipModal();
                updateUI();
                showToast(`SIP for ${name} established. First installment units credited.`, "gain");
            })
            .catch(err => {
                console.error("Error executing initial SIP NAV check", err);
                // Fallback buy
                const unitsBought = amount / 100.00;
                const today = new Date().toISOString().split('T')[0];
                recordBuyTransaction("mf", code, name, "Equity", unitsBought, 100.00, 0, today);
                
                saveToLocalStorage();
                closeSipModal();
                updateUI();
                showToast(`SIP established with estimated default NAV base (₹100).`, "info");
            });
    }

    // -------------------------------------------------------------
    // 13. SETTINGS & WIPE TRIGGERS
    // -------------------------------------------------------------
    function saveSettings() {
        const profile = document.getElementById("settings-risk-profile").value;
        const stockPct = parseInt(document.getElementById("settings-stock-target").value);
        const taxSlabVal = parseInt(document.getElementById("settings-tax-slab").value);
        const simSpeed = document.getElementById("settings-simulator-speed").value;

        state.settings.riskProfile = profile;
        state.settings.targetStockPercent = stockPct;
        state.settings.taxSlab = taxSlabVal;
        state.settings.simulatorSpeed = simSpeed;

        saveToLocalStorage();
        updateUI();
        startSimulator();
        showToast("Configurations saved successfully!", "gain");
    }

    function updateSettingsUI() {
        document.getElementById("settings-risk-profile").value = state.settings.riskProfile;
        document.getElementById("settings-stock-target").value = state.settings.targetStockPercent;
        document.getElementById("settings-stock-target-val").innerText = state.settings.targetStockPercent + "%";
        document.getElementById("settings-tax-slab").value = state.settings.taxSlab;
        document.getElementById("settings-simulator-speed").value = state.settings.simulatorSpeed;
    }

    function wipeDatabase() {
        if (confirm("Are you sure you want to purge all transactions, active SIP allocations, and wipe this portfolio database?")) {
            localStorage.removeItem("pinnacle_portfolio_state");
            state = {
                holdings: { stocks: {}, mutualFunds: {} },
                transactions: [],
                sips: [],
                settings: {
                    theme: "dark",
                    riskProfile: "balanced",
                    targetStockPercent: 50,
                    taxSlab: 30,
                    simulatorSpeed: 3000
                },
                realizedGains: []
            };
            historicalValuations = [0];
            document.body.setAttribute("data-theme", "dark");
            updateThemeIcons();
            initCharts();
            updateUI();
            startSimulator();
            showToast("Local database wiped successfully.", "loss");
        }
    }

    // -------------------------------------------------------------
    // 13B. BROKER-WISE IMPORT LOGIC & PARSERS
    // -------------------------------------------------------------
    const sampleData = {
        stock: {
            zerodha: "Instrument,Qty.,Avg. cost\nINFY,25,1420.00\nSBIN,50,830.00\nICICIBANK,30,1120.00",
            groww: "Stock Name,Symbol,Quantity,Average Price\nInfosys Ltd.,INFY,25,1420.00\nState Bank of India,SBIN,50,830.00\nICICI Bank Ltd.,ICICIBANK,30,1120.00",
            angel: "Stock Symbol,Quantity,Average Buy Price\nINFY,25,1420.00\nSBIN,50,830.00\nICICIBANK,30,1120.00",
            upstox: "Symbol,Quantity,Buy Price\nINFY,25,1420.00\nSBIN,50,830.00\nICICIBANK,30,1120.00"
        },
        mf: {
            zerodha: "Mutual Fund Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30\nNippon India Small Cap Fund - Direct Growth,118989,200,154.67",
            groww: "Scheme Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30\nNippon India Small Cap Fund - Direct Growth,118989,200,154.67",
            angel: "Scheme Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30\nNippon India Small Cap Fund - Direct Growth,118989,200,154.67",
            upstox: "Scheme Name,AMFI Code,Units,Average Price\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30\nNippon India Small Cap Fund - Direct Growth,118989,200,154.67"
        }
    };

    function openImportModal(assetClass = "stock") {
        const modal = document.getElementById("import-modal");
        if (!modal) return;
        
        document.getElementById("import-asset-class").value = assetClass;
        document.getElementById("import-modal-title").innerText = `Import ${assetClass === 'stock' ? 'Stocks' : 'Mutual Funds'} Portfolio`;
        
        // Reset form
        document.getElementById("import-form").reset();
        document.getElementById("import-asset-class").value = assetClass; // Reset changes it
        
        const broker = document.getElementById("import-broker").value;
        updateImportHelpText(assetClass, broker);
        
        modal.classList.add("active");
    }

    function closeImportModal() {
        const modal = document.getElementById("import-modal");
        if (modal) modal.classList.remove("active");
        document.getElementById("import-form").reset();
    }

    function updateImportHelpText(assetClass, broker) {
        const helpEl = document.getElementById("import-format-help");
        if (!helpEl) return;
        
        let formatText = "";
        let placeholderText = "";
        
        if (assetClass === "stock") {
            if (broker === "zerodha") {
                formatText = "Expected Zerodha Kite Stock CSV Headers: <code>Instrument,Qty.,Avg. cost</code>";
                placeholderText = "Instrument,Qty.,Avg. cost\nINFY,25,1420.00\nSBIN,50,830.00";
            } else if (broker === "groww") {
                formatText = "Expected Groww Stock CSV Headers: <code>Stock Name,Symbol,Quantity,Average Price</code>";
                placeholderText = "Stock Name,Symbol,Quantity,Average Price\nInfosys Ltd.,INFY,25,1420.00\nState Bank of India,SBIN,50,830.00";
            } else if (broker === "angel") {
                formatText = "Expected Angel One Stock CSV Headers: <code>Stock Symbol,Quantity,Average Buy Price</code>";
                placeholderText = "Stock Symbol,Quantity,Average Buy Price\nINFY,25,1420.00\nSBIN,50,830.00";
            } else if (broker === "upstox") {
                formatText = "Expected Upstox Stock CSV Headers: <code>Symbol,Quantity,Buy Price</code>";
                placeholderText = "Symbol,Quantity,Buy Price\nINFY,25,1420.00\nSBIN,50,830.00";
            }
        } else {
            if (broker === "zerodha") {
                formatText = "Expected Zerodha Coin Mutual Fund CSV Headers: <code>Mutual Fund Name,AMFI Code,Units,Average NAV</code>";
                placeholderText = "Mutual Fund Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30";
            } else if (broker === "groww") {
                formatText = "Expected Groww Mutual Fund CSV Headers: <code>Scheme Name,AMFI Code,Units,Average NAV</code>";
                placeholderText = "Scheme Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30";
            } else if (broker === "angel") {
                formatText = "Expected Angel One Mutual Fund CSV Headers: <code>Scheme Name,AMFI Code,Units,Average NAV</code>";
                placeholderText = "Scheme Name,AMFI Code,Units,Average NAV\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30";
            } else if (broker === "upstox") {
                formatText = "Expected Upstox Mutual Fund CSV Headers: <code>Scheme Name,AMFI Code,Units,Average Price</code>";
                placeholderText = "Scheme Name,AMFI Code,Units,Average Price\nHDFC Top 100 Fund - Direct Growth,119063,150,112.30";
            }
        }
        
        helpEl.innerHTML = formatText + "<br><span style='color: var(--text-muted); font-size: 0.7rem;'>Tip: You can also paste a raw JSON array of objects with keys: symbol/code, quantity/units, and avgPrice/avgNav.</span>";
        document.getElementById("import-text-data").placeholder = placeholderText;
    }

    function parseBrokerData(assetClass, broker, text) {
        text = text.trim();
        if (!text) return [];

        // Check if it is JSON
        if (text.startsWith("[") || text.startsWith("{")) {
            try {
                const parsed = JSON.parse(text);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                return list.map(item => {
                    const qty = parseFloat(item.quantity || item.qty || item.units || 0);
                    const price = parseFloat(item.avgPrice || item.price || item.averagePrice || item.avgNav || item.nav || item.avgPrice || 0);
                    let sym = (item.symbol || item.code || item.instrument || item.amfiCode || "").trim().toUpperCase();
                    if (assetClass === "stock") {
                        sym = sym.replace(".NS", "").replace(".BO", "").replace("-EQ", "").replace("-BE", "");
                    }
                    const name = (item.name || item.schemeName || item.stockName || sym).trim();
                    return { symbol: sym, name, quantity: qty, avgPrice: price };
                }).filter(item => item.symbol && item.quantity > 0 && item.avgPrice > 0);
            } catch (e) {
                console.error("JSON parsing error:", e);
                throw new Error("Invalid JSON format. Check syntax.");
            }
        }

        // Otherwise parse CSV
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            throw new Error("No data found or headers missing.");
        }

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        
        // Helper to find column index by potential names
        function findColumnIndex(possibleNames) {
            for (let name of possibleNames) {
                const idx = headers.indexOf(name.toLowerCase());
                if (idx !== -1) return idx;
            }
            return -1;
        }

        // Map columns depending on broker and assetClass
        let symbolIdx = -1;
        let qtyIdx = -1;
        let priceIdx = -1;
        let nameIdx = -1;

        if (assetClass === "stock") {
            if (broker === "zerodha") {
                symbolIdx = findColumnIndex(["instrument", "symbol", "stock symbol"]);
                qtyIdx = findColumnIndex(["qty.", "quantity", "qty", "shares"]);
                priceIdx = findColumnIndex(["avg. cost", "average price", "avg price", "avg buy price", "buy price"]);
            } else if (broker === "groww") {
                symbolIdx = findColumnIndex(["symbol", "instrument"]);
                qtyIdx = findColumnIndex(["quantity", "qty", "qty."]);
                priceIdx = findColumnIndex(["average price", "avg. cost", "avg price", "buy price"]);
                nameIdx = findColumnIndex(["stock name"]);
            } else if (broker === "angel") {
                symbolIdx = findColumnIndex(["stock symbol", "symbol", "instrument"]);
                qtyIdx = findColumnIndex(["quantity", "qty", "qty."]);
                priceIdx = findColumnIndex(["average buy price", "avg price", "average price", "avg. cost", "buy price"]);
            } else if (broker === "upstox") {
                symbolIdx = findColumnIndex(["symbol", "instrument"]);
                qtyIdx = findColumnIndex(["quantity", "qty", "qty."]);
                priceIdx = findColumnIndex(["buy price", "average price", "avg price", "avg. cost"]);
            } else {
                symbolIdx = findColumnIndex(["symbol", "instrument", "stock symbol"]);
                qtyIdx = findColumnIndex(["qty.", "quantity", "qty", "shares"]);
                priceIdx = findColumnIndex(["avg. cost", "average price", "avg price", "avg buy price", "buy price"]);
            }
        } else { // Mutual Funds
            symbolIdx = findColumnIndex(["amfi code", "code", "scheme code", "symbol"]);
            qtyIdx = findColumnIndex(["units", "quantity", "qty", "qty."]);
            priceIdx = findColumnIndex(["average nav", "avg nav", "average price", "avg price", "price"]);
            nameIdx = findColumnIndex(["mutual fund name", "scheme name", "name", "fund name"]);
        }

        // Generic defaults if specific headers aren't found
        if (symbolIdx === -1) symbolIdx = 0; 
        if (qtyIdx === -1) qtyIdx = 1;      
        if (priceIdx === -1) priceIdx = 2;  

        const results = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map(c => c.trim());
            if (cols.length <= Math.max(symbolIdx, qtyIdx, priceIdx)) continue;

            let sym = cols[symbolIdx].toUpperCase();
            if (assetClass === "stock") {
                sym = sym.replace(".NS", "").replace(".BO", "").replace("-EQ", "").replace("-BE", "");
            }
            const qty = parseFloat(cols[qtyIdx]);
            const price = parseFloat(cols[priceIdx]);
            const name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : sym;

            if (sym && !isNaN(qty) && !isNaN(price) && qty > 0 && price > 0) {
                results.push({ symbol: sym, name, quantity: qty, avgPrice: price });
            }
        }

        return results;
    }

    function handleImportSubmit() {
        const assetClass = document.getElementById("import-asset-class").value;
        const broker = document.getElementById("import-broker").value;
        const textData = document.getElementById("import-text-data").value;
        
        try {
            const parsedList = parseBrokerData(assetClass, broker, textData);
            if (parsedList.length === 0) {
                showToast("No valid holdings were found to import. Check format.", "warning");
                return;
            }
            
            // Check if current state contains only the initial demo data
            const isDemoData = state.transactions.length === 5 && 
                               state.transactions.some(t => t.id === "t1") &&
                               state.transactions.some(t => t.id === "t5");
                               
            if (isDemoData) {
                // Clear the demo data to prevent merging real data with simulated mock data
                state.holdings = { stocks: {}, mutualFunds: {} };
                state.transactions = [];
                state.realizedGains = [];
                state.sips = [];
                historicalValuations = [];
            }
            
            let importCount = 0;
            const today = new Date().toISOString().split('T')[0];
            
            parsedList.forEach(item => {
                const { symbol, name, quantity, avgPrice } = item;
                
                if (assetClass === "stock") {
                    if (!state.holdings.stocks[symbol]) {
                        const baseInfo = window.marketStocks.find(s => s.symbol === symbol) || {};
                        state.holdings.stocks[symbol] = {
                            symbol,
                            name: baseInfo.name || name || symbol,
                            quantity: 0,
                            avgPrice: 0,
                            totalCost: 0,
                            basePrice: baseInfo.basePrice || avgPrice,
                            currentPrice: baseInfo.currentPrice || avgPrice,
                            sector: baseInfo.sector || "General Equity"
                        };
                    }
                    const h = state.holdings.stocks[symbol];
                    h.quantity += quantity;
                    h.totalCost += (quantity * avgPrice);
                    h.avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
                    
                    state.transactions.push({
                        id: "tx_import_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
                        assetClass: "stock",
                        symbol,
                        name: h.name,
                        type: "BUY",
                        qty: quantity,
                        price: avgPrice,
                        brokerage: 0,
                        date: today
                    });
                    
                    importCount++;
                } else {
                    let category = "Equity - Active Growth";
                    const lowerName = name.toLowerCase();
                    if (lowerName.includes("liquid") || lowerName.includes("debt") || lowerName.includes("gilt") || lowerName.includes("bond")) {
                        category = "Debt - Liquid";
                    } else if (lowerName.includes("hybrid") || lowerName.includes("arbitrage") || lowerName.includes("asset allocator")) {
                        category = "Hybrid";
                    }
                    
                    if (!state.holdings.mutualFunds[symbol]) {
                        const baseInfo = window.popularMutualFunds.find(m => m.amfiCode === symbol) || {};
                        state.holdings.mutualFunds[symbol] = {
                            code: symbol,
                            name: baseInfo.name || name || symbol,
                            category: baseInfo.category || category,
                            units: 0,
                            avgPrice: 0,
                            totalCost: 0,
                            currentNav: baseInfo.currentNav || avgPrice
                        };
                    }
                    const h = state.holdings.mutualFunds[symbol];
                    h.units += quantity;
                    h.totalCost += (quantity * avgPrice);
                    h.avgPrice = h.units > 0 ? h.totalCost / h.units : 0;
                    
                    state.transactions.push({
                        id: "tx_import_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
                        assetClass: "mf",
                        symbol,
                        name: h.name,
                        type: "BUY",
                        qty: quantity,
                        price: avgPrice,
                        brokerage: 0,
                        date: today
                    });
                    
                    // Fetch real NAV from API in the background
                    fetch(`https://api.mfapi.in/mf/${symbol}`)
                        .then(res => res.json())
                        .then(data => {
                            if (data && data.data && data.data[0]) {
                                state.holdings.mutualFunds[symbol].currentNav = parseFloat(data.data[0].nav);
                                saveToLocalStorage();
                                recalculatePortfolioTotals();
                                updateMfsTbody();
                                updateCharts();
                            }
                        })
                        .catch(err => console.error("Error fetching NAV during import background update", err));
                        
                    importCount++;
                }
            });
            
            saveToLocalStorage();
            closeImportModal();
            updateUI();
            showToast(`Successfully imported ${importCount} ${assetClass === 'stock' ? 'positions' : 'mutual funds scheme'}!`, "gain");
            
        } catch (e) {
            showToast(e.message || "Failed to parse import data. Please check headers/fields.", "loss");
        }
    }

    // -------------------------------------------------------------
    // 14. FLOATING SYSTEM TOAST UTILITIES
    // -------------------------------------------------------------
    function showToast(message, type = "info") {
        const container = document.getElementById("toast-wrapper");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let iconName = "info";
        if (type === "gain") iconName = "check-circle";
        if (type === "loss") iconName = "x-circle";
        if (type === "warning") iconName = "alert-triangle";

        toast.innerHTML = `
            <i data-lucide="${iconName}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        lucide.createIcons();

        // Expire notification card
        setTimeout(() => {
            toast.style.animation = "fadeIn 0.2s reverse forwards";
            setTimeout(() => toast.remove(), 200);
        }, 3500);
    }

    // Launch Application
    init();
});
