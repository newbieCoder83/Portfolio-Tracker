# Notes to Human

## Key points learned from the last two questions

### 1. What "login" means in this app

In this app, "login" means the user explicitly enters:

- API key
- API secret
- environment (`live` or `demo`)

and then submits the login form.

It does **not** mean:

- reopening the app
- refreshing the page
- restoring a saved session from encrypted credentials

### 2. Why a full sync happens on login

Right now, the app is built so that a manual login triggers a full sync in the background.

That means after the user submits credentials, the app fetches:

- account summary
- positions
- all dividends
- all orders
- instruments

This was probably done to keep the first-time setup simple and make sure the local SQLite cache gets fully populated.

### 3. Why this can feel excessive

For normal day-to-day use, this is heavier than it needs to be.

After the app already has local data, a full sync on every manual login means:

- extra Trading 212 API calls
- more chance of hitting rate limits
- slower login-related background work

### 4. Important current behavior

One important detail: right now the code does this even if the user re-enters the same credentials as before. It does not currently check "are these new credentials or the same account?" before starting the full sync.

### 5. What already works better

The app already has an incremental sync path for normal refreshes.

- `Sync Now` uses incremental sync
- session restore does not do a full sync

So the app already has the pieces needed for a lighter approach.

### 6. Better long-term behavior

A better rule would be:

1. Do a full sync on first login, account change, or environment change.
2. Do not automatically full sync just because the user typed the same credentials again.
3. Keep `Sync Now` as the normal incremental refresh path.
4. Keep session restore lightweight.
