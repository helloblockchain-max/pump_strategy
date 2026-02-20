import os
import sys
import json

sys.path.append(r'd:\AI')
import backtest

def generate_json():
    filepath = r'd:\AI\PUMP-1.xlsx'
    
    print("Loading data for export...")
    rev_data = backtest.load_revenue_data(filepath)
    mkt_data = backtest.load_market_data(filepath)
    data = backtest.merge_data(rev_data, mkt_data)

    # Best parameter window is 3 based on our optimization
    params = {'window': 3}
    signals = backtest.compute_signals(data, params)
    hist = backtest.run_backtest(data, signals)
    metrics = backtest.calculate_metrics(hist)

    # Format chart data for Recharts
    # We want Date, Price, Equity, and the specific event
    chart_data = []
    
    # We may want to track the buy and hold equity too
    bh_capital = 100000.0
    bh_position = bh_capital / data[0]['open']
    
    for i in range(len(hist)):
        h = hist[i]
        d = data[i]
        
        # calculate B&H baseline
        bh_equity = bh_position * d['close']
        
        chart_data.append({
            'date': h['date'].strftime('%Y-%m-%d'),
            'price': h['price'],
            'strategy_equity': round(h['equity'], 2),
            'benchmark_equity': round(bh_equity, 2),
            'signal': h['signal']  # 1 is hold/buy, 0 is empty/sell
        })

    # Prepare standard JSON payload
    payload = {
        'last_updated': data[-1]['date'].strftime('%Y-%m-%d %H:%M:%S'),
        'metrics': {
            'total_return': metrics.get('总收益率 (Total Return)'),
            'annual_return': metrics.get('年化收益率 (Annualized Return)'),
            'volatility': metrics.get('年化波动率 (Annualized Volatility)'),
            'sharpe': metrics.get('夏普比率 (Sharpe Ratio)'),
            'max_drawdown': metrics.get('最大回撤 (Max Drawdown)'),
            'win_rate': metrics.get('胜率 (Win Rate)'),
            'trades': metrics.get('交易次数 (Trade Count)'),
        },
        'chart_data': chart_data
    }

    # Write to the root folder directly for static HTML mapping
    output_dir = r'd:\AI\pump_strategy'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    out_path = os.path.join(output_dir, 'data.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    print(f"Exported data payload to {out_path}")

if __name__ == "__main__":
    generate_json()
