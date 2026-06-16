# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Node.js CommonJS script that synchronizes articles from SAP HANA (BD_CARBALLO) to a PrestaShop store. SAP is the source of truth. By default it runs in **dry-run mode** — it reads, compares, and reports without writing anything to PrestaShop unless `SYNC_WRITE=true`.

## Commands

```bash
npm run start        # Run the full sync flow
npm run dev          # git pull then start (used on the Windows server)
npm run test:hana    # Test SAP HANA connection only (no PrestaShop)
npm run lint         # Check formatting (prettier)
npm run format       # Fix formatting (prettier)
```

There are no automated tests beyond `test:hana`. No test framework is installed.

## Environment setup

Create `.env.local` in the project root (values there override any env vars already in the shell session):

```text
HANA_SERVER_NODE=hanab1:30015
HANA_USER=USUARIO
HANA_PASSWORD=PASSWORD
HANA_SCHEMA=BD_CARBALLO
SAP_PRICE_LIST=14
SAP_WAREHOUSE=AC01
SAP_ITEM_CODE=61072505   # leave empty to process a batch
SAP_LIMIT=5
PRESTASHOP_ENDPOINT=https://carballo.com.do
PRESTASHOP_API_KEY=API_KEY
PRESTASHOP_DEFAULT_CATEGORY_ID=   # required to create new products
PRESTASHOP_LANGUAGE_ID=1
SYNC_WRITE=false          # set true to execute writes
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
LOG_LEVEL=info            # set debug for verbose output
```

To test only SAP reads (no PrestaShop vars needed): omit the `PRESTASHOP_*` vars or leave them empty.

## Architecture

```
main.js
  └── src/app.js          orchestrates the full flow
        ├── src/sap.js          reads articles from SAP HANA (sync, @sap/hana-client)
        ├── src/prestashop.js   PrestaShop REST/XML client + product inspection
        ├── src/sync-plan.js    builds action payloads (create/update payloads)
        ├── src/sync-executor.js executes actions or skips in dry-run
        ├── src/xml.js          XML builder/parser utilities for PrestaShop API
        ├── src/env.js          loads .env.local, env accessor helpers
        ├── src/logger.js       structured JSON log to stdout
        └── src/report.js       writes .summary.json, .rows.json, .rows.csv to REPORT_DIR
```

### Data flow

1. `sap.js` queries `OITM`, `ITM1`, `OITW` in HANA and returns a list of articles (itemCode, itemName, price, stock, status).
2. `app.js` loops each article and calls `prestashop.js:inspectProductByReference` — looks up by `reference` field matching `ItemCode`.
3. Matching logic (`findBestPrestaMatch`): exact combination reference → unique price match → fallback to product-level.
4. `app.js:buildResultRow` classifies the outcome and calls `sync-plan.js:buildActionPayload` to produce the payload.
5. `sync-executor.js:executeSyncAction` either executes writes or returns a `dry_run` result.
6. `report.js:writeRunReports` writes three files per run.

### Action types

| action | when |
|---|---|
| `create_product` | article not found in PrestaShop |
| `update_product_price` | price differs, simple product |
| `update_product_stock` | stock differs, simple product |
| `update_product_price_and_stock` | both differ, simple product |
| `skip_no_change` | already in sync |
| `review_combination_mapping` | product has combinations (never auto-written) |
| `review_error` | exception during inspection |

### PrestaShop API pattern

The client in `prestashop.js` wraps the PrestaShop Webservice (XML). All reads are GET, creates are POST using `schema=blank` XML as a base, updates use GET-then-PUT of the existing XML with modified fields. Patch-style updates (partial XML) are used for price. Stock is updated via `stock_availables` resource, never via the product directly.

Products with combinations are detected and flagged `review_combination_mapping` — the executor never writes to combinations automatically.

### Key constraints

- `PRESTASHOP_DEFAULT_CATEGORY_ID` must be set or `create_product` rows are blocked (`blockedReason: missing_default_category`).
- Product names are sanitized to ASCII before POST to avoid PrestaShop name validation errors; if that still fails, `itemCode` is used as the name.
- `HANA_SCHEMA` is validated against `[A-Za-z0-9_]+` before being interpolated into SQL to prevent injection.
- The PrestaShop API key is masked in all log output (`[OCULTO]`).
