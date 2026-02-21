// ============================================================
// Pump Strategy V2 - Anti-Overfitting Client-Side Engine
// Multi-Window Voting (3/7/14 days) + Trailing Stop
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

        myChart = echarts.init(document.getElementById('main-chart'));
        window.addEventListener('resize', () => myChart && myChart.resize());

        // Wire trailing stop slider
        const sliderTS = document.getElementById('p-ts');

        const update = () => runBacktest(parseInt(sliderTS.value) / 100);

        sliderTS.addEventListener('input', () => {
            document.getElementById('v-ts').textContent = sliderTS.value;
            update();
        });

        // Initial run with default (10%)
        update();

    } catch (err) {
        console.error("Error loading dashboard data:", err);
        document.getElementById('last-updated').textContent = "加载失败 (Load Failed)";
    }
});

// ============================================================
// Core V2 Backtesting Engine
// Fixed windows [3, 7, 14] - NOT adjustable (prevents overfitting)
// Only parameter: trailing_stop_pct
// ============================================================

function runBacktest(trailingStopPct) {
    if (!RAW_DATA || RAW_DATA.length < 2) return;

    const data = RAW_DATA;
    const n = data.length;
    const windows = [3, 7, 14]; // Fixed ensemble windows
    const minLookback = Math.max(...windows) * 2;

    // --- 1. Compute Signals with Multi-Window Voting + Trailing Stop ---
    const signals = new Array(n).fill(0);
    let peakPrice = 0;
    let inPosition = false;

    for (let i = 0; i < n; i++) {
        if (i < minLookback) { signals[i] = 0; continue; }

        // Multi-window voting
        let votes = 0;
        for (const w of windows) {
            let recentSum = 0, prevSum = 0;
            for (let j = i - w; j < i; j++) recentSum += data[j].revenue;
            for (let j = i - 2 * w; j < i - w; j++) prevSum += data[j].revenue;
            if (recentSum / w > prevSum / w) votes++;
        }

        const momentumSignal = votes >= 2 ? 1 : 0; // Majority vote
        const currPrice = data[i - 1].price;

        // Trailing stop logic
        if (inPosition) {
            if (currPrice > peakPrice) peakPrice = currPrice;
            const dd = peakPrice > 0 ? (peakPrice - currPrice) / peakPrice : 0;
            if (dd > trailingStopPct) {
                signals[i] = 0;
                inPosition = false;
                continue;
            }
        }

        if (momentumSignal === 1 && !inPosition) {
            signals[i] = 1;
            inPosition = true;
            peakPrice = currPrice;
        } else if (momentumSignal === 0 && inPosition) {
            signals[i] = 0;
            inPosition = false;
        } else if (inPosition) {
            signals[i] = 1;
        } else {
            signals[i] = 0;
        }
    }

    // --- 2. Simulate Trades ---
    const initialCapital = 100000;
    let capital = initialCapital;
    let position = 0;
    const history = [];
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

    // --- 4. Render ---
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

    let peak = 0, maxDD = 0;
    for (const h of history) {
        if (h.equity > peak) peak = h.equity;
        const dd = peak > 0 ? (peak - h.equity) / peak : 0;
        if (dd > maxDD) maxDD = dd;
    }

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
// Rendering
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
