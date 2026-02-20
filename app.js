document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('./data.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error('Failed to fetch data');

        const data = await response.json();

        renderMetrics(data);
        renderChart(data);
        renderHistoryTable(data);

    } catch (err) {
        console.error("Error loading dashboard data:", err);
        document.getElementById('last-updated').textContent = "加载失败 (Load Failed)";
    }
});

function renderMetrics(data) {
    document.getElementById('last-updated').textContent = data.last_updated;

    // safe DOM updates
    const safeSet = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : '--';
    };

    const m = data.metrics || {};
    safeSet('m-total-return', m.total_return);
    safeSet('m-annual-return', m.annual_return);
    safeSet('m-sharpe', m.sharpe);
    safeSet('m-max-drawdown', m.max_drawdown);
    safeSet('m-win-rate', m.win_rate);
    safeSet('m-trades', m.trades);
}

function renderChart(data) {
    if (!data.chart_data || data.chart_data.length === 0) return;

    const dom = document.getElementById('main-chart');
    const myChart = echarts.init(dom);

    const dates = data.chart_data.map(item => item.date);
    const strategyEquity = data.chart_data.map(item => item.strategy_equity);
    const bhEquity = data.chart_data.map(item => item.benchmark_equity);

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
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
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
            splitLine: {
                lineStyle: { color: 'rgba(255, 255, 255, 0.05)' }
            }
        },
        series: [
            {
                name: '策略净值 (Strategy)',
                type: 'line',
                data: strategyEquity,
                smooth: true,
                symbol: 'none',
                lineStyle: {
                    color: '#00ffcc',
                    width: 3,
                    shadowColor: 'rgba(0, 255, 204, 0.5)',
                    shadowBlur: 10
                },
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
                lineStyle: {
                    color: '#8a8a93',
                    width: 2,
                    type: 'dashed'
                }
            }
        ]
    };

    myChart.setOption(option);

    window.addEventListener('resize', () => {
        myChart.resize();
    });
}

function renderHistoryTable(data) {
    if (!data.daily_history || data.daily_history.length === 0) return;

    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '';

    data.daily_history.forEach(row => {
        const tr = document.createElement('tr');

        // Signal color based on value
        const signalColor = row.signal.includes('看多') ? 'var(--accent)' : 'var(--text-muted)';

        tr.innerHTML = `
            <td>${row.date}</td>
            <td>${row.price}</td>
            <td>$${Number(row.revenue).toLocaleString()}</td>
            <td style="color: ${signalColor}; font-weight: 600;">${row.signal}</td>
            <td>${row.equity.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}
