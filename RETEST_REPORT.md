**Koorm retest results — 7 November 2026**

The current working tree passes **578 automated tests** and the frontend production build. Of the nine earlier findings, **eight are verified fixed in the tested scenarios; B07 is partially fixed**. Its remaining checkout case was reproduced against real local MySQL using temporary tables.

| Check | Result |
| --- | --- |
| Backend `npm test -- --runInBand` | **373 passed**, 28 suites |
| Frontend `npm test` | **205 passed**, 33 files |
| Frontend `npm run build` | **Passed**, 156 modules |
| Additional retest: `node scripts/qa/verify-current.cjs` | **8 checks passed, 1 failed** |
| Existing local API public smoke checks | **5/5 returned HTTP 200** |
| `git diff --check` | Passed; only line-ending notices |

The additional checks are separate from the 578 regular tests. They include two cases for B07. B09 is covered by the frontend suite's new cart-refresh failure tests.

| ID | Earlier issue | Retest status | Evidence |
| --- | --- | --- | --- |
| B01 | Multi-size orders restore insufficient stock | **Verified fixed** | Real MySQL: M x1 + L x3 restored stock from 6 to 10. |
| B02 | Concurrent COD checkout creates duplicates | **Verified fixed** | Overlapping controller requests with simulated per-row locks produced one order; the second returned 400 for an empty cart. Stock decreased once. |
| B03 | Concurrent checkout exceeds coupon limits | **Verified fixed** | Two customers buying different products competed for a one-use coupon; one succeeded, the other received 400, and `used_count` stayed 1. Row locks were simulated. |
| B04 | Customer OTP guesses are unlimited | **Verified fixed** | Real MySQL: four wrong guesses returned 401; the fifth returned 429 and cleared the code. The original correct code was then rejected. |
| B05 | Clearing a sale price retains the discount | **Verified fixed** | Real MySQL: `discount_price: null` persisted as NULL while existing product sizes were preserved. |
| B06 | Combined sizes exceed shared cart stock | **Verified fixed** | Real MySQL: with stock 1 and size M already in the cart, adding size L was rejected with 400. |
| B07 | Unsupported product sizes can be ordered | **Partially fixed** | Invalid new cart additions are rejected, but checkout accepts an already-added size after an admin removes it. |
| B08 | Negative coupon edits increase totals | **Verified fixed** | Real MySQL: negative edit returned 400 and left the stored discount unchanged. Evaluation also rejected a legacy negative value. |
| B09 | Cart-refresh failure strands successful checkout | **Verified fixed** | Frontend regression tests confirm COD navigation still reaches confirmation after refresh failure, and paid checkout does not report a payment failure for a refresh error. |

**Remaining bug: B07 — checkout does not revalidate saved sizes**

Priority: **Medium**.

Reproduction:

1. Offer a product in sizes M and L with available stock.
2. Add size M to the customer's cart while it is available.
3. Change the product's available sizes to L only.
4. Place the order from the existing cart.

Expected: reject checkout with a clear message that size M is no longer available; create no order or stock deduction.

Actual: the order controller returned **HTTP 201** and persisted an order item with **size M** despite the product offering only L. This was executed on real MySQL with temporary users/products/cart/order tables; no persistent customer order was created.

Source: [orderController.js](server/server/controllers/orderController.js), lines 91–103 and 152. The product query locks and reads price/stock but does not fetch `sizes`; stock is validated and the saved cart size is copied into the order. The add-to-cart validation in [cartController.js](server/server/controllers/cartController.js), lines 77–84, only protects new additions.

Suggested fix: fetch product sizes under the existing product lock and validate each saved cart size before inserting the order. Add a regression for a size removed after the item was added to the cart.

**Reproduce this retest**

From the repository root:

```powershell
node scripts/qa/verify-current.cjs
```

This exits with code 1 while the remaining B07 checkout check fails. It connects only to a local database, uses temporary tables derived from the current schema with foreign keys omitted, and closes the connection afterward. Persistent application tables are not changed. Mail, token creation and payment integrations are stubbed; concurrency checks use separate simulated transactions and per-row locks rather than simultaneous MySQL sessions.

The earlier `reproduce-bugs.cjs` and `reproduce-restock.cjs` were also rerun. They are historical bug demonstrations, not current correctness tests: they expect defective behavior, and some SQL fixtures no longer match the refactored controllers. Their failures were not counted as proof of fixes. Use `verify-current.cjs` and the normal suites for the current results.

**Runtime smoke checks and limits**

The existing local service returned 200 for `/api/health`, `/api/products?limit=1`, `/api/products/filters`, `/api/categories`, and `/api/payments/config`. Health reported a connected database, cash-on-delivery-only payment configuration, and unconfigured payment webhooks. The current service now exposes the richer health response described by the source, though these requests do not prove every loaded module matches the working tree.

Live online payments/refunds, email delivery, and full authenticated browser/mobile journeys were not exercised. React Router future notices, `act(...)` warnings and jsdom `scrollTo` notices remain nonfatal test-environment output.

This retest added only the current verification script and reporting changes. Application fixes already present in the working tree were preserved; no additional application fixes were made.
