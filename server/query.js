const Database = require('better-sqlite3');
const db = new Database('../data/portfolio.db', { readonly: true });

console.log('=== CRITICAL: HON POSITION vs ORDERS MISMATCH ===\n');

// Check latest fills for HON from orders
const latestFills = db.prepare(`
  SELECT fill_filled_at, side, fill_type, fill_quantity, fill_price 
  FROM orders 
  WHERE ticker='HON_US_EQ' AND fill_filled_at IS NOT NULL AND fill_quantity IS NOT NULL
  ORDER BY fill_filled_at DESC 
  LIMIT 10
`).all();

console.log('Latest fills from ORDERS:');
let latestSum = 0;
latestFills.reverse().forEach(f => {
  latestSum += f.fill_quantity;
  console.log(`${f.fill_filled_at.substring(0,10)} | ${f.side} | qty=${f.fill_quantity} | cumsum=${latestSum.toFixed(6)}`);
});

// Sum all from orders
const allOrderSum = db.prepare(`
  SELECT SUM(fill_quantity) as total 
  FROM orders 
  WHERE ticker='HON_US_EQ' AND fill_type='TRADE' AND fill_quantity IS NOT NULL
`).get();

console.log(`\nTotal from orders: ${allOrderSum.total}`);

// Now from T212 export
const t212Sum = db.prepare(`
  SELECT SUM(shares) as total 
  FROM t212_export_rows 
  WHERE ticker='HON' AND (action LIKE 'Market%' OR action LIKE 'Limit%')
`).get();

console.log(`Total from T212 export (trades only): ${t212Sum.total}`);

// Check position
const pos = db.prepare(`SELECT quantity FROM positions WHERE ticker='HON_US_EQ'`).get();
console.log(`\nCurrent position quantity: ${pos.quantity}`);

// Could the position be calculated separately by the totalReturnService?
// Or is there a mismatch in the data import?

// Check if dividends from T212 export are real share distributions
console.log('\n=== Check dividend "shares" field ===');
const divDetails = db.prepare(`
  SELECT date_time, action, shares, price, total 
  FROM t212_export_rows 
  WHERE ticker='HON' AND action LIKE 'Dividend%'
  ORDER BY date_time DESC
  LIMIT 5
`).all();

divDetails.forEach(d => {
  console.log(`${d.date_time.substring(0,10)} | ${d.action} | shares=${d.shares} | price=${d.price} | total=${d.total}`);
});

console.log('\nNotice: dividend "shares" field appears to be the share-equivalent of the dividend');
console.log('(not actual shares received). price per share confirms this.');

db.close();