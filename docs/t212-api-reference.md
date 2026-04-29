# Trading 212 Public API - Complete Reference

> **This file is the single source of truth for API schemas and endpoints.**
> Do NOT use training data, wrapper libraries, or guessed field names.
> Every field name, nesting structure, and rate limit below comes directly
> from the official docs at https://docs.trading212.com and the downloadable
> OpenAPI description, verified on 2026-04-29.

---

## General Information

- **Status:** Beta, under active development
- **Account types:** Invest and Stocks ISA only (no CFD)
- **Order execution:** Primary account currency only
- **Multi-currency:** Not supported - all values returned in primary account currency
- **IP restrictions:** Optional allow-listing is supported in Trading 212 account settings

### API Roots

| Environment | Official API root | Host used in this project |
|---|---|---|
| Live (Real Money) | `https://live.trading212.com/api/v0` | `https://live.trading212.com` |
| Paper Trading (Demo) | `https://demo.trading212.com/api/v0` | `https://demo.trading212.com` |

The official docs present the full API root including `/api/v0`.
This project stores the host only and appends request paths that already start with `/api/v0/...`.

---

## Authentication

The API uses **HTTP Basic Authentication** with a key pair.

- **Username:** Your API Key
- **Password:** Your API Secret
- **Header:** `Authorization: Basic <base64(API_KEY:API_SECRET)>`

### How to build the header

```python
import base64

api_key = "<YOUR_API_KEY>"
api_secret = "<YOUR_API_SECRET>"

credentials_string = f"{api_key}:{api_secret}"
encoded = base64.b64encode(credentials_string.encode("utf-8")).decode("utf-8")
auth_header = f"Basic {encoded}"
```

```javascript
// Node.js
const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
```

### Generating API Keys

Users generate keys from: Settings -> API (Beta) in the Trading 212 app.
Two credentials are provided:
1. **API Key** - acts as the username
2. **API Secret** - acts as the password (shown only once after generation)

---

## Rate Limiting

All rate limits are **per-account** (not per-key or per-IP).

### Response Headers

Every response includes:
- `x-ratelimit-limit` - Total requests allowed in the period
- `x-ratelimit-period` - Period duration in seconds
- `x-ratelimit-remaining` - Requests left in current period
- `x-ratelimit-reset` - Unix timestamp when limit fully resets
- `x-ratelimit-used` - Requests already made in current period

### 429 Handling

On HTTP 429, read the `x-ratelimit-reset` header (Unix epoch seconds), calculate wait time, sleep, then retry.

### Rate Limit Summary Table

| Endpoint | Rate Limit |
|---|---|
| GET /api/v0/equity/account/summary | 1 req / 5s |
| GET /api/v0/equity/positions | 1 req / 1s |
| GET /api/v0/equity/orders | 1 req / 5s |
| GET /api/v0/equity/orders/{id} | 1 req / 1s |
| POST /api/v0/equity/orders/market | 50 req / 60s |
| POST /api/v0/equity/orders/limit | 1 req / 2s |
| POST /api/v0/equity/orders/stop | 1 req / 2s |
| POST /api/v0/equity/orders/stop_limit | 1 req / 2s |
| DELETE /api/v0/equity/orders/{id} | 50 req / 60s |
| GET /api/v0/equity/history/dividends | 6 req / 60s |
| GET /api/v0/equity/history/orders | 6 req / 60s |
| GET /api/v0/equity/history/transactions | 6 req / 60s |
| GET /api/v0/equity/history/exports | 1 req / 60s |
| POST /api/v0/equity/history/exports | 1 req / 30s |
| GET /api/v0/equity/metadata/instruments | 1 req / 50s |
| GET /api/v0/equity/metadata/exchanges | 1 req / 30s |

---

## Pagination

All list endpoints (dividends, orders, transactions) use **cursor-based pagination**.

### Parameters

- `limit` (integer) - Max items per page. Default: 20, Maximum: 50
- `cursor` (string|number) - Pointer to start of next page

### How to paginate

1. Make initial request with optional `limit`, no `cursor`
2. Response contains `items` array and `nextPagePath` string
3. If `nextPagePath` is `null` -> you've reached the end
4. If `nextPagePath` is not null -> use the **entire string** as the path for your next request
5. Repeat until `nextPagePath` is `null`

### Example response

```json
{
  "items": [ ... ],
  "nextPagePath": "/api/v0/equity/history/dividends?limit=50&cursor=1760346100000"
}
```

---

## Endpoints

The official OpenAPI currently also lists deprecated Pies endpoints under
`/api/v0/equity/pies`. This project does not use Pies. Do not add or call those
endpoints unless a future task explicitly asks for Pies support.

---

### GET /api/v0/equity/account/summary

Provides a breakdown of your account's cash and investment metrics.

**Current standard note:** The current Accounts section and downloadable OpenAPI spec use `GET /api/v0/equity/account/summary`.
Some Trading 212 quickstart/search snippets still show the older `GET /api/v0/equity/account/cash` example.
For this project, treat `/api/v0/equity/account/summary` as the current standard endpoint.

**Rate limit:** 1 req / 5s

**Response 200:**

```json
{
  "cash": {
    "availableToTrade": 1245.80,
    "inPies": 0.00,
    "reservedForOrders": 0.00
  },
  "currency": "GBP",
  "id": 12345678,
  "investments": {
    "currentValue": 24028.00,
    "realizedProfitLoss": 820.00,
    "totalCost": 17368.00,
    "unrealizedProfitLoss": 6660.00
  },
  "totalValue": 25273.80
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `cash.availableToTrade` | number | Funds available for investing |
| `cash.inPies` | number | Cash inside pies not yet invested |
| `cash.reservedForOrders` | number | Cash reserved for pending orders |
| `currency` | string | Primary account currency (ISO 4217) |
| `id` | integer | Primary trading account number |
| `investments.currentValue` | number | Current value of all investments |
| `investments.realizedProfitLoss` | number | All-time realised P/L from executed trades |
| `investments.totalCost` | number | Cost basis of current investments |
| `investments.unrealizedProfitLoss` | number | Potential P/L if you sold everything now |
| `totalValue` | number | Total account value in primary currency |

---

### GET /api/v0/equity/positions

Fetch all open positions for your account. Returns an **array** of position objects.

**Rate limit:** 1 req / 1s

**Query parameters:**
- `ticker` (string, optional) - Filter by ticker, e.g. "AAPL_US_EQ"

**Response 200 (array of):**

```json
{
  "averagePricePaid": 142.50,
  "createdAt": "2023-03-15T10:00:00Z",
  "currentPrice": 198.30,
  "instrument": {
    "currency": "USD",
    "isin": "US0378331005",
    "name": "Apple Inc",
    "ticker": "AAPL_US_EQ"
  },
  "quantity": 15.0,
  "quantityAvailableForTrading": 15.0,
  "quantityInPies": 0.0,
  "walletImpact": {
    "currency": "GBP",
    "currentValue": 2380.00,
    "fxImpact": -45.00,
    "totalCost": 1710.00,
    "unrealizedProfitLoss": 670.00
  }
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `averagePricePaid` | number | Average price paid per share (instrument currency) |
| `createdAt` | string | ISO 8601 date when position was opened |
| `currentPrice` | number | Current price per share (instrument currency) |
| `instrument` | object | Instrument metadata |
| `instrument.currency` | string | Instrument currency (ISO 4217) |
| `instrument.isin` | string | ISIN of the instrument |
| `instrument.name` | string | Full name of the instrument |
| `instrument.ticker` | string | Unique ticker identifier, e.g. "AAPL_US_EQ" |
| `quantity` | number | Total shares owned |
| `quantityAvailableForTrading` | number | Shares available to trade |
| `quantityInPies` | number | Shares used in pies |
| `walletImpact` | object | Values in account's primary currency |
| `walletImpact.currency` | string | Currency code for wallet impact values |
| `walletImpact.currentValue` | number | Current market value of position |
| `walletImpact.fxImpact` | number | FX impact on position value |
| `walletImpact.totalCost` | number | Total cost paid for position |
| `walletImpact.unrealizedProfitLoss` | number | Unrealised P/L (currentValue - totalCost) |

---

### GET /api/v0/equity/history/dividends

Fetch paid out dividends. Paginated.

**Rate limit:** 6 req / 60s

**Query parameters:**
- `cursor` (integer, optional) - Pagination cursor
- `ticker` (string, optional) - Filter by ticker
- `limit` (integer, optional) - Max 50

**Response 200:**

```json
{
  "items": [
    {
      "amount": 42.50,
      "amountInEuro": 48.20,
      "currency": "GBP",
      "grossAmountPerShare": 0.85,
      "instrument": {
        "currency": "GBP",
        "isin": "IE00B3XXRP09",
        "name": "Vanguard S&P 500 ETF",
        "ticker": "VUSA_LSE_EQ"
      },
      "paidOn": "2024-03-20T00:00:00Z",
      "quantity": 50.0,
      "reference": "div-ref-123456",
      "ticker": "VUSA_LSE_EQ",
      "tickerCurrency": "GBP",
      "type": "ORDINARY"
    }
  ],
  "nextPagePath": "/api/v0/equity/history/dividends?limit=50&cursor=1760346100000"
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `amount` | number | Dividend amount in account's primary currency |
| `amountInEuro` | number | Dividend amount in EUR |
| `currency` | string | Account's primary currency |
| `grossAmountPerShare` | number | Gross per-share amount (instrument currency) |
| `instrument` | object | Instrument metadata (same structure as positions) |
| `instrument.currency` | string | Instrument currency (ISO 4217) |
| `instrument.isin` | string | ISIN |
| `instrument.name` | string | Instrument name |
| `instrument.ticker` | string | Unique ticker |
| `paidOn` | string | ISO 8601 timestamp for when the dividend was paid |
| `quantity` | number | Number of shares held at payment |
| `reference` | string | Unique reference ID for this dividend payment |
| `ticker` | string | Ticker identifier |
| `tickerCurrency` | string | Currency of the ticker |
| `type` | string | Dividend type (see enum below) |
| `nextPagePath` | string\|null | Path for next page, or null if last page |

**Dividend type enum:** `"ORDINARY"`, `"BONUS"`, `"PROPERTY_INCOME"`, `"RETURN_OF_CAPITAL_NON_US"`, `"DEMERGER"`, `"INTEREST"`, `"CAPITAL_GAINS_DISTRIBUTION_NON_US"`, `"INTERIM_LIQUIDATION"`, `"DIVIDEND"`, `"SHORT_TERM_CAPITAL_GAINS"`, `"LONG_TERM_CAPITAL_GAINS"`, `"PROPERTY_INCOME_DISTRIBUTION"`, `"TAX_EXEMPTED"`, `"CAPITAL_GAINS"`, `"RETURN_OF_CAPITAL"`, `"TRUST_DISTRIBUTION"`, and many manufactured payment variants.

---

### GET /api/v0/equity/history/orders

Fetch historical order data. Paginated. **Response has a nested structure with `order` and `fill` sub-objects.**

**Rate limit:** 6 req / 60s

**Query parameters:**
- `cursor` (integer, optional) - Pagination cursor
- `ticker` (string, optional) - Filter by ticker
- `limit` (integer, optional) - Max 50

**Response 200:**

```json
{
  "items": [
    {
      "fill": {
        "filledAt": "2023-03-15T10:01:00Z",
        "id": 99999,
        "price": 142.50,
        "quantity": 15.0,
        "tradingMethod": "TOTV",
        "type": "TRADE",
        "walletImpact": {
          "currency": "GBP",
          "fxRate": 0.80,
          "netValue": -1710.00,
          "realisedProfitLoss": 0.00,
          "taxes": [
            {
              "chargedAt": "2023-03-15T10:01:00Z",
              "currency": "GBP",
              "name": "STAMP_DUTY",
              "quantity": 10.68
            }
          ]
        }
      },
      "order": {
        "createdAt": "2023-03-15T10:00:00Z",
        "currency": "USD",
        "extendedHours": false,
        "filledQuantity": 15.0,
        "filledValue": 2137.50,
        "id": 12345,
        "initiatedFrom": "API",
        "instrument": {
          "currency": "USD",
          "isin": "US0378331005",
          "name": "Apple Inc",
          "ticker": "AAPL_US_EQ"
        },
        "limitPrice": null,
        "quantity": 15.0,
        "side": "BUY",
        "status": "FILLED",
        "stopPrice": null,
        "strategy": "QUANTITY",
        "ticker": "AAPL_US_EQ",
        "timeInForce": "DAY",
        "type": "MARKET",
        "value": null
      }
    }
  ],
  "nextPagePath": "/api/v0/equity/history/orders?limit=50&cursor=1660015723000"
}
```

**Order sub-object fields:**

| Field | Type | Description |
|---|---|---|
| `order.createdAt` | string | ISO 8601 date when order was created |
| `order.currency` | string | Currency for the order (ISO 4217) |
| `order.extendedHours` | boolean | Whether order can fill outside regular hours |
| `order.filledQuantity` | number | Shares successfully executed |
| `order.filledValue` | number | Monetary value of executed portion |
| `order.id` | integer | Unique order identifier |
| `order.initiatedFrom` | string | Enum: "API", "IOS", "ANDROID", "WEB", "SYSTEM", "AUTOINVEST" |
| `order.instrument` | object | Instrument metadata |
| `order.instrument.currency` | string | Instrument currency |
| `order.instrument.isin` | string | ISIN |
| `order.instrument.name` | string | Instrument name |
| `order.instrument.ticker` | string | Unique ticker |
| `order.limitPrice` | number\|null | Limit price (LIMIT/STOP_LIMIT orders) |
| `order.quantity` | number | Total shares requested |
| `order.side` | string | Enum: "BUY", "SELL" |
| `order.status` | string | Enum: "LOCAL", "UNCONFIRMED", "CONFIRMED", "NEW", "CANCELLING", "CANCELLED", "PARTIALLY_FILLED", "FILLED", "REJECTED", "REPLACING", "REPLACED" |
| `order.stopPrice` | number\|null | Stop price (STOP/STOP_LIMIT orders) |
| `order.strategy` | string | Enum: "QUANTITY", "VALUE" |
| `order.ticker` | string | Ticker identifier |
| `order.timeInForce` | string | Enum: "DAY", "GOOD_TILL_CANCEL" |
| `order.type` | string | Enum: "LIMIT", "STOP", "MARKET", "STOP_LIMIT" |
| `order.value` | number\|null | Monetary value (for value orders) |

**Fill sub-object fields:**

| Field | Type | Description |
|---|---|---|
| `fill.filledAt` | string | ISO 8601 date when fill occurred |
| `fill.id` | integer | Unique fill identifier |
| `fill.price` | number | Fill price per share |
| `fill.quantity` | number | Number of shares filled |
| `fill.tradingMethod` | string | Enum: "TOTV", "OTC" |
| `fill.type` | string | Enum: "TRADE", "STOCK_SPLIT", "STOCK_DISTRIBUTION", "FOP", "FOP_CORRECTION", "CUSTOM_STOCK_DISTRIBUTION", "EQUITY_RIGHTS", "SCRIP_STOCK_DIVIDENDS", "STOCK_DIVIDENDS", "STOCK_ACQUISITION", "CASH_AND_STOCK_ACQUISITION", "SPIN_OFF" |
| `fill.walletImpact.currency` | string | Currency of wallet impact |
| `fill.walletImpact.fxRate` | number | FX rate used |
| `fill.walletImpact.netValue` | number | Net cash impact (negative = money out) |
| `fill.walletImpact.realisedProfitLoss` | number | Realised P/L from this fill |
| `fill.walletImpact.taxes` | array | Array of tax objects |
| `fill.walletImpact.taxes[].chargedAt` | string | When tax was charged |
| `fill.walletImpact.taxes[].currency` | string | Tax currency |
| `fill.walletImpact.taxes[].name` | string | Enum: "COMMISSION_TURNOVER", "CURRENCY_CONVERSION_FEE", "FINRA_FEE", "FRENCH_TRANSACTION_TAX", "PTM_LEVY", "STAMP_DUTY", "STAMP_DUTY_RESERVE_TAX", "TRANSACTION_FEE" |
| `fill.walletImpact.taxes[].quantity` | number | Tax amount |

---

### GET /api/v0/equity/history/transactions

Fetch deposit/withdrawal/fee movements.

**Rate limit:** 6 req / 60s

**Query parameters:**
- `cursor` (string, optional) - Pagination cursor
- `time` (string, optional) - Retrieve transactions from this time
- `limit` (integer, optional) - Max 50

**Response 200:**

```json
{
  "items": [
    {
      "amount": 500.00,
      "currency": "GBP",
      "dateTime": "2024-01-15T10:30:00Z",
      "reference": "txn-ref-789",
      "type": "DEPOSIT"
    }
  ],
  "nextPagePath": null
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `amount` | number | Transaction amount |
| `currency` | string | Transaction currency |
| `dateTime` | string | ISO 8601 timestamp |
| `reference` | string | Unique transaction ID |
| `type` | string | Enum: "WITHDRAW", "DEPOSIT", "FEE", "TRANSFER" |

---

### GET /api/v0/equity/metadata/instruments

Retrieves all accessible instruments. Data refreshed every 10 minutes.

**Rate limit:** 1 req / 50s

**Response 200 (array of):**

```json
{
  "addedOn": "2020-01-15T00:00:00Z",
  "currencyCode": "USD",
  "extendedHours": true,
  "isin": "US0378331005",
  "maxOpenQuantity": 10000.0,
  "name": "Apple Inc",
  "shortName": "AAPL",
  "ticker": "AAPL_US_EQ",
  "type": "STOCK",
  "workingScheduleId": 42
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `addedOn` | string | When instrument was added to platform |
| `currencyCode` | string | ISO 4217 currency code |
| `extendedHours` | boolean | Whether extended hours trading is available |
| `isin` | string | ISIN identifier |
| `maxOpenQuantity` | number | Maximum quantity you can hold |
| `name` | string | Full instrument name |
| `shortName` | string | Short/abbreviated name |
| `ticker` | string | Unique ticker identifier |
| `type` | string | Enum: "STOCK", "ETF", "CRYPTOCURRENCY", "FOREX", "FUTURES", "INDEX", "WARRANT", "CRYPTO", "CVR", "CORPACT" |
| `workingScheduleId` | integer | Reference to exchange schedule |

---

### GET /api/v0/equity/metadata/exchanges

Retrieves all exchanges and their working schedules. Data refreshed every 10 minutes.

**Rate limit:** 1 req / 30s

**Response 200 (array of):**

```json
{
  "id": 42,
  "name": "NASDAQ",
  "workingSchedules": [
    {
      "timeEvents": [
        {
          "date": "2024-03-20T14:30:00Z",
          "type": "OPEN"
        },
        {
          "date": "2024-03-20T21:00:00Z",
          "type": "CLOSE"
        }
      ]
    }
  ]
}
```

**Time event type enum:** `"OPEN"`, `"CLOSE"`, `"BREAK_START"`, `"BREAK_END"`, `"PRE_MARKET_OPEN"`, `"AFTER_HOURS_OPEN"`, `"AFTER_HOURS_CLOSE"`, `"OVERNIGHT_OPEN"`

---

### GET /api/v0/equity/orders

Fetch all **pending** (active) orders. NOT paginated - returns a flat array.

**Rate limit:** 1 req / 5s

**Response 200 (array of):**

```json
{
  "createdAt": "2024-03-20T10:00:00Z",
  "currency": "USD",
  "extendedHours": false,
  "filledQuantity": 0.0,
  "filledValue": 0.0,
  "id": 67890,
  "initiatedFrom": "API",
  "instrument": {
    "currency": "USD",
    "isin": "US0378331005",
    "name": "Apple Inc",
    "ticker": "AAPL_US_EQ"
  },
  "limitPrice": 150.00,
  "quantity": 10.0,
  "side": "BUY",
  "status": "NEW",
  "stopPrice": null,
  "strategy": "QUANTITY",
  "ticker": "AAPL_US_EQ",
  "timeInForce": "GOOD_TILL_CANCEL",
  "type": "LIMIT",
  "value": null
}
```

---

### POST /api/v0/equity/orders/market

Place a market order. **Not idempotent - duplicate requests create duplicate orders.**

**Rate limit:** 50 req / 60s

**Request body:**

```json
{
  "ticker": "AAPL_US_EQ",
  "quantity": 0.1,
  "extendedHours": true
}
```

- Positive quantity = BUY
- Negative quantity = SELL

**Response 200:** Same shape as pending order object (see GET /api/v0/equity/orders above).

---

### POST /api/v0/equity/orders/limit

Place a limit order.

**Rate limit:** 1 req / 2s

**Request body:**

```json
{
  "ticker": "AAPL_US_EQ",
  "quantity": 10.0,
  "limitPrice": 150.00,
  "timeValidity": "GOOD_TILL_CANCEL"
}
```

The request field is `timeValidity`. Returned order objects use
`timeInForce`.

---

### POST /api/v0/equity/orders/stop

Place a stop order (triggers market order at stop price).

**Rate limit:** 1 req / 2s

**Request body:**

```json
{
  "ticker": "AAPL_US_EQ",
  "quantity": -10.0,
  "stopPrice": 130.00,
  "timeValidity": "GOOD_TILL_CANCEL"
}
```

The request field is `timeValidity`. Returned order objects use
`timeInForce`.

---

### POST /api/v0/equity/orders/stop_limit

Place a stop-limit order.

**Rate limit:** 1 req / 2s

**Request body:**

```json
{
  "ticker": "AAPL_US_EQ",
  "quantity": 10.0,
  "stopPrice": 155.00,
  "limitPrice": 156.00,
  "timeValidity": "GOOD_TILL_CANCEL"
}
```

The request field is `timeValidity`. Returned order objects use
`timeInForce`.

---

### DELETE /api/v0/equity/orders/{id}

Cancel a pending order by ID.

**Rate limit:** 50 req / 60s

---

### GET /api/v0/equity/orders/{id}

Fetch a single pending order by ID.

**Rate limit:** 1 req / 1s

---

### GET /api/v0/equity/history/exports

List generated CSV reports and their status.

**Rate limit:** 1 req / 60s

**Response 200:** array of `ReportResponse` objects.

```json
{
  "dataIncluded": {
    "includeDividends": true,
    "includeInterest": true,
    "includeOrders": true,
    "includeTransactions": true
  },
  "downloadLink": "https://...",
  "reportId": 123456,
  "status": "Finished",
  "timeFrom": "2024-01-01T00:00:00Z",
  "timeTo": "2024-12-31T23:59:59Z"
}
```

**Field details:**

| Field | Type | Description |
|---|---|---|
| `dataIncluded.includeDividends` | boolean | Whether dividends are included |
| `dataIncluded.includeInterest` | boolean | Whether interest rows are included |
| `dataIncluded.includeOrders` | boolean | Whether order rows are included |
| `dataIncluded.includeTransactions` | boolean | Whether cash transaction rows are included |
| `downloadLink` | string\|null | Temporary download URL when the report is finished |
| `reportId` | integer | Generated report identifier |
| `status` | string | Report generation status, e.g. `"Finished"` |
| `timeFrom` | string | Report start timestamp |
| `timeTo` | string | Report end timestamp |

**Workflow:**
1. POST /api/v0/equity/history/exports to request a report -> get `reportId`
2. GET /api/v0/equity/history/exports periodically to check status
3. When status is `"Finished"`, `downloadLink` contains URL

---

### POST /api/v0/equity/history/exports

Request generation of a CSV report.

**Rate limit:** 1 req / 30s

**Request body:** `PublicReportRequest`.

```json
{
  "dataIncluded": {
    "includeDividends": true,
    "includeInterest": true,
    "includeOrders": true,
    "includeTransactions": true
  },
  "timeFrom": "2024-01-01T00:00:00Z",
  "timeTo": "2024-12-31T23:59:59Z"
}
```

`dataIncluded` is a `ReportDataIncluded` object.

**Response 200:** `EnqueuedReportResponse`.

```json
{
  "reportId": 123456
}
```

---

## Error Responses

All endpoints can return:

| Status | Meaning |
|---|---|
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid/missing credentials) |
| 403 | Forbidden (wrong account type or permissions) |
| 408 | Request timeout |
| 429 | Rate limited (check x-ratelimit-reset header) |

---

## Important Notes for Implementation

1. **Selling orders use negative quantity.** To sell 10 shares: `quantity: -10`
2. **Orders are NOT idempotent.** Sending the same request twice creates two orders.
3. **Pagination uses `nextPagePath`.** Use the entire string as your next request path - it includes the cursor and limit parameters.
4. **Positions endpoint returns an array**, not a paginated object. No nextPagePath.
5. **The `instrument` object** appears in positions, dividends, orders, and pending orders with the same structure: `{ currency, isin, name, ticker }`.
6. **Historical orders have TWO sub-objects:** `order` (the request) and `fill` (the execution). Always access fields via `item.order.side`, `item.fill.price`, etc.
7. **The `walletImpact` object** appears in both positions and order fills but with different fields. In positions: `{ currency, currentValue, fxImpact, totalCost, unrealizedProfitLoss }`. In fills: `{ currency, fxRate, netValue, realisedProfitLoss, taxes }`.
8. **Instruments endpoint** is rate-limited to 1 request per 50 seconds - cache aggressively.
9. **Dividend `paidOn` is documented as `date-time` in the current OpenAPI spec.** If the UI only wants `YYYY-MM-DD`, normalise it at the display layer instead of assuming the API will always send a date-only string.
10. **Order placement requests use `timeValidity`, but order responses use `timeInForce`.** Do not copy the response field name into request bodies.
11. **Pies endpoints are deprecated in the official docs and unused here.** Keep this reference focused on the endpoints the app actually calls.
