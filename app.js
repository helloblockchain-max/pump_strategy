// ============================================================
// Pump Strategy - Client-Side Backtesting Engine
// ============================================================

let RAW_DATA = [];
let myChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('./data.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error('Failed to fetch data');

        const payload = await response.json();
        document.getElementById('last-updated').textContent = payload.last_updated;
        RAW_DATA = payload.raw_data;

        // Init chart instance
        myChart = echarts.init(document.getElementById('main-chart'));
        window.addEventListener('resize', () => myChart && myChart.resize());

        // Wire slider events
        const sliderWindow = document.getElementById('p-window');
        const sliderSMA = document.getElementById('p-sma');

        const update = () => runBacktest(
            parseInt(sliderWindow.value),
            parseInt(sliderSMA.value)
        );

        sliderWindow.addEventListener('input', () => {
            document.getElementById('v-window').textContent = sliderWindow.value;
            update();
        });
        sliderSMA.addEventListener('input', () => {
            document.getElementById('v-sma').textContent = sliderSMA.value;
            update();
        });

        // Initial run with defaults
        update();

    } catch (err) {
        console.error("Error loading dashboard data:", err);
        document.getElementById('last-updated').textContent = "加载失败 (Load Failed)";
    }
});

// ============================================================
// Core Backtesting Engine (runs entirely in the browser)
// ============================================================

function runBacktest(window_days, sma_days) {
    if (!RAW_DATA || RAW_DATA.length < 2) return;

    const data = RAW_DATA;
    const n = data.length;

    // --- 1. Compute Signals ---
    const signals = new Array(n).fill(0);
    const minLookback = Math.max(2 * window_days, sma_days);

    for (let i = 0; i < n; i++) {
        if (i < minLookback) { signals[i] = 0; continue; }

        // Recent vs Previous average revenue
        let recentSum = 0, prevSum = 0;
        for (let j = i - window_days; j < i; j++) recentSum += data[j].revenue;
        for (let j = i - 2 * window_days; j < i - window_days; j++) prevSum += data[j].revenue;
        const recentAvg = recentSum / window_days;
        const prevAvg = prevSum / window_days;

        // Price SMA risk filter
        let smaSum = 0;
        for (let j = i - sma_days; j < i; j++) smaSum += data[j].price;
        const smaPrice = smaSum / sma_days;
        const currPrice = data[i - 1].price;
        const uptrend = currPrice >= smaPrice * 0.95;

        const prevSignal = i > 0 ? signals[i - 1] : 0;

        if (recentAvg > prevAvg && uptrend) {
            signals[i] = 1;
        } else if (recentAvg < prevAvg || !uptrend) {
            signals[i] = 0;
        } else {
            signals[i] = prevSignal;
        }
    }

    // --- 2. Simulate Trades ---
    const initialCapital = 100000;
    let capital = initialCapital;
    let position = 0;
    const history = [];

    // Buy & Hold benchmark
    const bhPosition = initialCapital / data[0].price;

    for (let i = 0; i < n; i++) {
        const price = data[i].price;

        if (i > 0) {
            const prevSig = signals[i - 1];
            if (prevSig === 1 && position === 0) {
                position = capital / price;
                capital = 0;
            } else if (prevSig === 0 && position > 0) {
                capital = position * price;
                position = 0;
            }
        }

        const equity = capital + position * price;
        const bhEquity = bhPosition * price;

        history.push({
            date: data[i].date,
            price: price,
            revenue: data[i].revenue,
            equity: Math.round(equity * 100) / 100,
            bhEquity: Math.round(bhEquity * 100) / 100,
            signal: signals[i]
        });
    }

    // --- 3. Compute Metrics ---
    const metrics = computeMetrics(history);

    // --- 4. Render Everything ---
    renderMetrics(metrics);
    renderChart(history);
    renderHistoryTable(history);
}

function computeMetrics(history) {
    if (history.length < 2) return {};

    const returns = [];
    for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].equity;
        const curr = history[i].equity;
        returns.push(prev > 0 ? (curr - prev) / prev : 0);
    }

    const totalReturn = history[history.length - 1].equity / history[0].equity - 1;
    const days = history.length;
    const annReturn = Math.pow(1 + totalReturn, 365 / days) - 1;

    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - meanRet, 2), 0) / returns.length;
    const vol = Math.sqrt(variance) * Math.sqrt(365);

    const sharpe = vol > 0 ? annReturn / vol : 0;

    // Max Drawdown
    let peak = 0, maxDD = 0;
    for (const h of history) {
        if (h.equity > peak) peak = h.equity;
        const dd = peak > 0 ? (peak - h.equity) / peak : 0;
        if (dd > maxDD) maxDD = dd;
    }

    // Win rate
    const trades = [];
    let inTrade = false, entryEq = 0;
    for (const h of history) {
        if (h.signal === 1 && !inTrade) { entryEq = h.equity; inTrade = true; }
        else if (h.signal === 0 && inTrade) { trades.push(h.equity / entryEq - 1); inTrade = false; }
    }
    const winRate = trades.length > 0 ? trades.filter(t => t > 0).length / trades.length : 0;

    return {
        total_return: (totalReturn * 100).toFixed(2) + '%',
        annual_return: (annReturn * 100).toFixed(2) + '%',
        volatility: (vol * 100).toFixed(2) + '%',
        sharpe: sharpe.toFixed(2),
        max_drawdown: (maxDD * 100).toFixed(2) + '%',
        win_rate: (winRate * 100).toFixed(2) + '%',
        trades: String(trades.length)
    };
}

// ============================================================
// Rendering Functions
// ============================================================

function renderMetrics(m) {
    const safeSet = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : '--';
    };
    safeSet('m-total-return', m.total_return);
    safeSet('m-annual-return', m.annual_return);
    safeSet('m-sharpe', m.sharpe);
    safeSet('m-max-drawdown', m.max_drawdown);
    safeSet('m-win-rate', m.win_rate);
    safeSet('m-trades', m.trades);
}

function renderChart(history) {
    if (!history || history.length === 0 || !myChart) return;

    const dates = history.map(h => h.date);
    const strategyEquity = history.map(h => h.equity);
    const bhEquity = history.map(h => h.bhEquity);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(10, 10, 15, 0.9)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            textStyle: { color: '#fff' }
        },
        legend: {
            data: ['策略净值 (Strategy)', '买入持有 (Benchmark)'],
            textStyle: { color: '#8a8a93' },
            top: 0
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: dates,
            axisLabel: { color: '#8a8a93' },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            min: 'dataMin',
            axisLabel: { color: '#8a8a93' },
            splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
        },
        series: [
            {
                name: '策略净值 (Strategy)',
                type: 'line',
                data: strategyEquity,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#00ffcc', width: 3, shadowColor: 'rgba(0, 255, 204, 0.5)', shadowBlur: 10 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(0, 255, 204, 0.3)' },
                        { offset: 1, color: 'rgba(0, 255, 204, 0)' }
                    ])
                }
            },
            {
                name: '买入持有 (Benchmark)',
                type: 'line',
                data: bhEquity,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#8a8a93', width: 2, type: 'dashed' }
            }
        ]
    };

    myChart.setOption(option);
}

function renderHistoryTable(history) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Show newest first
    const reversed = [...history].reverse();

    reversed.forEach(row => {
        const tr = document.createElement('tr');
        const signalText = row.signal === 1 ? '看多 (Long)' : '空仓 (Empty)';
        const signalColor = row.signal === 1 ? 'var(--accent)' : 'var(--text-muted)';

        tr.innerHTML = `
            <td>${row.date}</td>
            <td>${row.price.toFixed(6)}</td>
            <td>$${Number(row.revenue).toLocaleString()}</td>
            <td style="color: ${signalColor}; font-weight: 600;">${signalText}</td>
            <td>${row.equity.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}
