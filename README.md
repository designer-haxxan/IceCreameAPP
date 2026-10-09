# Ice Cream Parlor POS

Offline-first point of sale for an ice cream parlor, built as a static PWA (no build step).
HTML5 · ES modules · jQuery · Bootstrap 5 · Bootstrap Icons · IndexedDB · Service Worker · eposwala login API.

It was converted from a general-purpose shop POS. The accounting engine, backup, printing and reports are unchanged. The screens, menu, payments and look were rebuilt for an ice cream counter in Pakistan.

## Features

**Sell (the main screen)**
- Big emoji tiles for cups, cones, sundaes, shakes, kulfi and falooda, toppings and family tubs. Tapping a tile adds it with a bounce and a floating "+1".
- On a phone, an empty bill opens on the menu. A sticky bar at the bottom shows the running total and returns to the bill.
- Payment tiles: **Cash**, **JazzCash**, **EasyPaisa** and **Bank**. The amount received has quick buttons, and the change due is shown.
- Confetti after each sale. The sale saves straight away and the cart clears for the next customer. The toast shows the change to hand back.
- Hold a bill, edit a bill, void a bill, and print a receipt (Bluetooth, RawBT or browser). Receipts can include Urdu text.

**Home**
- Today's sales, bills, expenses and "left over" (sales minus expenses).
- How customers paid today, by cash, JazzCash, EasyPaisa and bank.
- Last 7 days chart and best sellers today.
- A one-tap **Load starter menu** card when the menu is empty.

**Expenses** (new)
- Tap a category: Milk & Cream, Sugar & Flavours, Ice & Packing, Gas / LPG, Electricity & Water, Rent, Staff Salary, Transport, Repairs & Cleaning, or General. You can add your own types.
- Choose how it was paid (cash, JazzCash, EasyPaisa, bank), then type the amount.
- Today or this month, with a bar breakdown of where the money went. A mistake can be removed, which cancels it in the Cash Book and Reports.
- Every expense is a payment voucher in the double-entry ledger, so the Cash Book and reports include it.

**Menu & Prices, Stock, Returns, Customers, Reports, Backup**
- Inherited from the shop POS. Stock is off for menu items by default, so ice cream does not need stock counts.
- Stock Purchases and Suppliers are for buying ingredients and packaging on credit.

**Sample menu.** On Home, tap **Load starter menu** to add sample prices in Rs for ice cream items, plus expense types and JazzCash, EasyPaisa and Bank accounts. It only adds what is missing and never changes existing items or prices. Change any name or price under **Menu & Prices**.

## Architecture

```
index.html              App shell (splash, login, layout, bottom bar: Home · Bills · Sell · Expenses · More)
manifest.json           PWA manifest
service-worker.js       Precache of shell + CDN libs; cache-first; /api/ requests never cached
css/app.css             Base styles (the old shop layout)
css/icecream.css        Ice cream theme, animations, Sell/Home/Expenses styles (loaded after app.css)
js/app.js               Boot, auth gate + session expiry, router (lazy-loaded modules), connection badge, SW updates
js/config.js            Login API base URL, support phone, app/schema/backup versions
js/core/                utils, settings (LocalStorage), UI helpers, fx (confetti / "+1"), shared views
js/db/                  IndexedDB wrapper (atomic multi-store transactions) + schema
js/services/            auth, catalog (in-memory search index), posting engine, starter menu, backup
js/modules/             dashboard (Home), pos (Sell + purchases), expenses, documents (bills/returns),
                        products (Menu & Prices), stock, parties, vouchers (Cash Book), accounts, settings, backup
js/reports/             reports
js/printer/             ESC/POS encoder, receipt builder, Bluetooth/RawBT/browser printing
js/scanner/             camera scanning + keyboard-wedge scanner detection
icons/                  App icons (pink ice cream cone)
```

### Storage

| Where | What |
|---|---|
| IndexedDB `icecreampos_pos` | All business data: menu items, categories, customers, suppliers, accounts, bills + items, purchases, returns, vouchers and expenses, **ledger entries**, stock moves, held bills, audit log, counters |
| LocalStorage | Settings (shop profile, tax, number prefixes, printer, theme), device preferences, `icecreampos.session` (`{ token, expiresAt, username }`), `icecreampos.draft.*` (the unsaved cart) and the shared phone id `minipos.deviceId` |

**Shared origin and a new database.** The app namespaces everything with `CONFIG.APP_ID` (`icecreampos`). That makes the database `icecreampos_pos` and the keys `icecreampos.*`. This keeps it apart from the other apps that share the GitHub Pages origin, including the earlier shop app whose data is in `disterp_pos`. A new install starts empty. *Backup & Restore* can still import the older shared database `saleapp_pos` after showing its record counts.

**Data integrity.** Each operation (sale, purchase, return, voucher or expense, adjustment, edit, void) runs in **one IndexedDB transaction**. That transaction writes the document and its lines, stock moves, balanced double-entry ledger entries (refused if they don't balance), the bill counter and an audit record. Any failure aborts everything. Bill numbers (`BILL-000001`…) come from a counter inside the same transaction, so a failed save never uses a number. Document IDs are created when the cart is opened, so a double tap or a retry after a refresh is detected as a duplicate.

**Balances and reports are always derived from records.** Account balances come from ledger entries; stock as of a date comes from stock moves.

### Authentication

Login uses the eposwala API (`CONFIG.AUTH_API_BASE`, default `https://eposwala.com/api`):

```
POST /api/login   Content-Type: application/json
{ "username": "...", "password": "...", "deviceId": "..." }
2xx  → { "token": "...", "expiresAt": <unix ms>, "username": "..." }
!2xx → { "error": "missing_fields" | "invalid_credentials" | "device_mismatch" | "account_disabled" }
```

- **Login requires internet.** The POS works offline after the first sign-in, until `expiresAt`.
- **One device per account.** `deviceId` is stored in `localStorage["minipos.deviceId"]`. Moving to another phone goes through support (`CONFIG.SUPPORT_PHONE`).
- Passwords are never stored. Logging out does not remove the device binding.

## Setup

### 1. Login API

Set `AUTH_API_BASE` and `SUPPORT_PHONE` in `js/config.js` if they differ from the defaults. The login server must allow the app's origin (CORS). See the note below.

**CORS:** `https://eposwala.com/api/login` only accepts browser calls from pages served by **https://eposwala.com**. To run the app from another origin (including `localhost`), the API must return `Access-Control-Allow-Origin` for that origin and answer the `OPTIONS` preflight with `Access-Control-Allow-Headers: content-type`.

### 2. Run locally

ES modules and the service worker need HTTP. The `.claude/launch.json` entry does this:

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

### 3. Deploy

GitHub Pages serves the repository root. All paths are relative. HTTPS is required for the service worker, camera and Web Bluetooth.

**When you change any cached file, bump `VERSION` in `service-worker.js`.** Installed apps then update the next time they open online. Browsers can also keep old copies, so a hard reload or clearing the site's cache may be needed while testing.

## Backup & restore

- **Export** downloads one JSON file with a header (`format`, `backupVersion`, `appVersion`, `schemaVersion`, `createdAt`, `createdBy`, `counts`, `checksum`, `settings`) and `data` holding every collection. `checksum` is a SHA-256 of the data. No credentials are included.
- **Import** validates before anything changes: JSON structure, versions, IDs and required fields, duplicates, record counts against the header, checksum, and ledger balance. You can download a safety backup first. Then choose:
  - **Replace**: erases local data and loads the backup. Type `REPLACE` to confirm. Runs in one transaction.
  - **Merge**: adds missing records and updates newer ones. Documents merge with their lines, ledger entries and stock moves. Document-number conflicts are skipped and listed.

## Printing & scanning

| Capability | Where it works | Notes |
|---|---|---|
| Web Bluetooth ESC/POS (58/80 mm) | Chrome/Edge on Android, Windows, macOS, Linux, ChromeOS (HTTPS) | Only **BLE** printers. Most cheap "classic Bluetooth" printers are not reachable from browsers. Not on iOS. |
| RawBT | Android | The free RawBT app bridges ESC/POS to classic Bluetooth, USB and network printers. |
| Browser print | Everywhere | 58/80 mm receipt CSS. Works with AirPrint, system print and PDF. Also the automatic fallback. |
| Urdu receipts | All print methods | Urdu text is drawn with **Jameel Noori Nastaleeq** (`fonts/`, loaded only for Urdu characters). Settings → Printer → Urdu printing mode. |
| Camera scanning | HTTPS on Android/iOS/desktop | Uses `BarcodeDetector` when available, otherwise `html5-qrcode`. |
| Hardware scanners | Everywhere | USB/Bluetooth keyboard-wedge scanners work in the search field. |

Tick **Print receipt** at checkout to print that bill. Automatic printing can be turned on in Settings.

## Known limitations

- **Data lives on the device.** No multi-device sync. Back up regularly (the Home screen reminds you after 7 days). For several tills, give each a different number prefix in Settings and use **Merge**.
- **The screens are English.** Urdu is used for receipts and a few hints, not for the whole app. A full Urdu interface is not built yet.
- **Tax is off by default.** Turn it on under Settings only if your accountant confirms the rate for your business (16% is set as the starting rate). Check FBR rules before you rely on it.
- **Sample prices are not real prices.** They are placeholders in Rs. Set your own under Menu & Prices.
- **Anyone with physical access can read local data** (IndexedDB is not encrypted). Use device lock screens.
- **Cost of goods uses the last purchase price** recorded on each sale line. Menu items do not track stock by default.
- **iOS has no Web Bluetooth.** Print with AirPrint or the browser print dialog.
