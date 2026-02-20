import os
import sys
import json

sys.path.append(r'd:\AI')
import backtest

def generate_json():
    filepath = r'd:\AI\pump_data.csv'
    
    print("Loading data for export...")
    data = backtest.load_csv_data(filepath)

    # Best parameter based on recent optimization
    params = {'window': 3, 'sma_window': 10}
    signals = backtest.compute_signals(data, params)
    hist = backtest.run_backtest(data, signals)
    metrics = backtest.calculate_metrics(hist)

    chart_data = []
    daily_history = []
    
    bh_capital = 100000.0
    bh_position = bh_capital / data[0]['open']
    
    for i in range(len(hist)):
        h = hist[i]
        d = data[i]
        
        bh_equity = bh_position * d['close']
        date_str = h['date'].strftime('%Y-%m-%d')
        
        chart_data.append({
            'date': date_str,
            'price': h['price'],
            'strategy_equity': round(h['equity'], 2),
            'benchmark_equity': round(bh_equity, 2),
            'signal': h['signal']
        })
        
        daily_history.append({
            'date': date_str,
            'price': round(h['price'], 6),
            'revenue': d['income'],
            'signal': "看多 (Long)" if h['signal'] == 1 else "空仓 (Empty)",
            'equity': round(h['equity'], 2)
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
        'chart_data': chart_data,
        'daily_history': sorted(daily_history, key=lambda x: x['date'], reverse=True) # newest first
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
