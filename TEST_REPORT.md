**Koorm project test and bug report**

The existing automated suites pass, but targeted checks reproduced **9 defects: 4 high priority and 5 medium priority**. Findings concern the current working tree, including changes already present when the audit began. Application source was not changed; the new files contain this report and isolated reproduction checks.

| Check | Result |
| --- | --- |
| Backend: `npm test -- --runInBand` in `server/server` | 28 suites, **339 tests passed** |
| Frontend: `npm test` in `client/client` | 33 files, **199 tests passed** |
| Frontend: `npm run build` | **Passed**; Vite built 156 modules |
| Isolated backend reproductions | **7 defects reproduced**, with DB/mail/payment dependencies replaced by test doubles |
| Real local MySQL restock reproduction | **1 defect reproduced**, using connection-scoped temporary tables |
| Mounted React checkout reproduction | **1 defect reproduced**, using jsdom and mocked API responses |
| Existing local API smoke checks | HTTP 200 for health, products, product filters, categories, and payment configuration |

The 9 reproduction checks assert the observed defective behavior. Their passing results mean the bugs were reproduced, not that the behavior is correct. They are kept outside the normal test suite.

| ID | Priority | Bug | Evidence |
| --- | --- | --- | --- |
| B01 | High | Restocking loses units when one order contains multiple sizes of the same product | Real MySQL execution |
| B02 | High | Concurrent COD checkout creates duplicate orders from one cart | Controller execution with simulated row locks |
| B03 | High | Concurrent checkout exceeds coupon redemption limits | Controller execution with simulated row locks |
| B04 | High | Customer OTP verification has no application-level failed-attempt limit | Controller execution and route inspection |
| B05 | Medium | Clearing a product's sale price does not remove the discount | Controller/model execution |
| B06 | Medium | Cart accepts combined quantities across sizes that exceed shared stock | Controller execution |
| B07 | Medium | Cart accepts sizes that the product does not offer | Controller execution |
| B08 | Medium | Coupon edits accept negative discounts, increasing the checkout total | Controller/model execution |
| B09 | Medium | Successful COD checkout gets stuck when the cart refresh fails | Mounted React component execution |

**B01 — Restocking loses units across sizes**

Location: [orderLifecycle.js](server/server/utils/orderLifecycle.js), lines 12–15. The same helper is used by cancellation, unpaid-order expiry, and return receiving ([returnController.js](server/server/controllers/returnController.js), line 165).

Reproduce: start with 10 units of one product; order one unit in size M and three in size L, leaving 6. Cancel/expire the order, or receive and restock its return. Expected stock is 10. Executing the actual helper against temporary MySQL tables restored stock to **7**. The joined UPDATE updates the product row once instead of adding every matching order-item quantity.

Impact: stock disappears after ordinary orders containing multiple sizes, causing incorrect inventory and avoidable out-of-stock listings.

Suggested fix: aggregate `SUM(quantity)` by product for the order before updating stock. Add a real SQL regression check covering multiple sizes of the same product.

**B02 — Concurrent COD requests create duplicate orders**

Location: [orderController.js](server/server/controllers/orderController.js), lines 62–69 and 111–115.

Reproduce: with one cart item and at least two units available, submit two COD order requests concurrently for the same customer, without FIRST30. Both requests can read the cart before either acquires the customer lock. The first creates an order and clears the cart; the second continues with its earlier cart snapshot. The reproduction returned **201 twice**, inserted **two orders**, and changed stock from **10 to 8**.

Impact: two browser tabs or overlapping requests can create duplicate shipments and consume stock twice. The frontend's local button guard does not protect concurrent requests.

Suggested fix: acquire the customer/cart lock before reading the cart, read it again within the transaction, and add an idempotency key for checkout submissions. The race was reproduced with an in-memory lock model, not simultaneous connections to the application database.

**B03 — Coupon redemption limits are exceeded**

Location: [orderController.js](server/server/controllers/orderController.js), lines 91–105 and 165; [orderLifecycle.js](server/server/utils/orderLifecycle.js), line 81.

Reproduce: create an active coupon with `usage_limit=1` and `used_count=0`. Submit concurrent COD checkouts using it. Both can validate the coupon before the transaction, then increment its count without rechecking its limit. The reproduction discounted both orders from **2500 to 2400**, and `used_count` became **2**.

Impact: promotions can exceed their intended redemption budget. Online orders also defer counting until payment and do not reserve a redemption during creation; that path was inspected but not independently reproduced here.

Suggested fix: atomically reserve coupon capacity under a coupon-row lock or conditional update, and define how unpaid orders reserve/release that capacity.

**B04 — Customer OTP attempts are not limited**

Location: [authController.js](server/server/controllers/authController.js), lines 145–157; [authRoutes.js](server/server/routes/authRoutes.js), lines 17–21.

Reproduce against the isolated controller: submit 20 incorrect codes for one account, then submit its valid code. All incorrect attempts returned 401; no attempt counter or invalidation ran, and the correct code still returned a session. Wrong guesses leave the six-digit code active until expiry. No rate-limiting middleware was found on these application routes.

Impact: the application does not constrain repeated guesses against customer login codes. This verifies the missing application control; it does not measure attack success or any limits imposed by an external proxy.

Suggested fix: persist failed-attempt counts, invalidate codes after a small number of failures, and throttle code issuance and verification per account and client.

**B05 — Sale prices cannot be cleared**

Location: [productController.js](server/server/controllers/productController.js), line 228; [AdminProductForm.jsx](client/client/src/pages/admin/AdminProductForm.jsx), line 65.

Reproduce: edit a product whose sale price is 1800, clear the sale-price input, and save. The form sends `discount_price: null`. The backend uses `discount_price ?? current.discount_price`, treating an explicit clear as an omitted update. The controller returned **200 with the old 1800 sale price**.

Impact: an administrator cannot end a sale using the provided form, and customers continue receiving the old price.

Suggested fix: distinguish an absent field (`undefined`) from an explicit `null`. The category update has the same clearing pattern.

**B06 — Shared stock is checked separately for each size**

Location: [cartController.js](server/server/controllers/cartController.js), lines 88 and 137.

Reproduce: set product stock to 1, put size M quantity 1 in the cart, then add size L quantity 1. The second add returned **201**, even though the total is now 2. The order controller's aggregate stock check subsequently rejects checkout with “Only 1 left”. The four-per-product cap uses the combined count, but the stock check uses only the current size's quantity.

Impact: the cart accepts an order it cannot fulfill and sends the customer into a failing checkout.

Suggested fix: compare shared stock against the aggregate product quantity on both add and update, consistent with checkout.

**B07 — Unsupported sizes enter the cart**

Location: [cartController.js](server/server/controllers/cartController.js), lines 59–67 and the cart insert; [orderController.js](server/server/controllers/orderController.js), cart read and order-item insert.

Reproduce: for a product offering M/L, send an authenticated cart request containing `size: "NOT-A-SIZE"`. The controller returned **201** and inserted that size. The product lookup reads name and stock but does not validate the size against `products.sizes`.

Impact: malformed API requests can create unfulfillable cart items. Existing cart items can also retain sizes removed by an administrator. Checkout copies the stored size without revalidation; placement of such an order was identified from the source rather than separately executed.

Suggested fix: validate sizes when adding to the cart and again during order creation.

**B08 — Coupon updates allow negative discount values**

Location: [couponController.js](server/server/controllers/couponController.js), lines 172–200 and 45–54.

Reproduce: update an existing flat coupon with `discount_value: -100`, then evaluate it against a 2500 subtotal. The edit returned **200**; evaluation returned **-100** as the discount, increasing the total to **2600**. Creation validates this input, but update does not reuse those checks.

Impact: invalid coupon data can overcharge customers. This requires an administrator/API edit; the ordinary browser form has a minimum-value restriction.

Suggested fix: share validation between create and update, validate the merged coupon, and reject invalid negative values before checkout calculation.

**B09 — Cart-refresh failure hides a successfully placed COD order**

Location: [Checkout.jsx](client/client/src/pages/Checkout.jsx), lines 87–90.

Reproduce: let `POST /orders` succeed with a COD order, then make the subsequent cart refresh reject with a network/server error. The mounted component's submit handler rejected; it did not navigate to confirmation, displayed no alert, and left the button disabled at **“Placing your order...”**.

Impact: the customer sees an apparently unfinished checkout although an order exists. Reloading or retrying elsewhere can increase confusion and duplicate-order risk.

Suggested fix: navigate to the created order regardless of a secondary cart-refresh failure, handle refresh errors separately, and restore busy state when remaining on checkout.

**Reproduction commands**

From the repository root:

```powershell
node scripts/qa/reproduce-bugs.cjs
node scripts/qa/reproduce-restock.cjs
```

The first command replaces DB/mail/payment dependencies in memory. The second reads the existing backend `.env`, refuses nonlocal database hosts, and runs the real restock helper on temporary tables that disappear when its connection closes. It does not modify persistent application tables.

From `client/client`:

```powershell
npm test -- --config qa/vitest.audit.config.js
```

**Coverage and limits**

Existing tests cover many controllers, models, components, and payment/return behaviors. This audit added targeted reproductions rather than a complete exhaustive test matrix. Live payment capture/refunds, email delivery, authenticated browser journeys, deployment, and visual/mobile behavior were not exercised.

The existing service on `127.0.0.1:5000` answered the five public smoke requests with HTTP 200. Its health payload was only `{"status":"ok"}`, whereas the current source returns a richer status object. It was not restarted, so those smoke results do not establish that the running service matches the current working tree.

Frontend test output included React Router future notices, `act(...)` warnings, and jsdom `scrollTo` notices. These were nonfatal test-environment warnings, not counted as product bugs. Initial frontend commands were blocked by sandbox subprocess permissions; rerunning with permission allowed the tests and build to pass.

Prioritize B01–B04, then the customer-facing B05/B09 behavior and the remaining validation issues.
