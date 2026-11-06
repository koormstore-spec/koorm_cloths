# Koorm — Clothing E-Commerce Web App

A full-stack e-commerce app for clothing, built with **React (Vite + Tailwind CSS)**, **Node.js/Express**, and **MySQL**. Customers pay **online through Razorpay** (UPI, cards, net banking, wallets) or choose **cash on delivery**, with refunds and return requests built in.

## Features

- Browse products by category (Men, Women, Kids, Footwear, Accessories) with search, sort, and price filters
- Product detail pages with image gallery, size/quantity selection, ratings & reviews
- Cart, wishlist, and Cash-on-Delivery checkout
- User accounts: register/login (JWT), order history, order cancellation
- Admin panel: dashboard stats, product CRUD, order status management — separate login with shared database storage (see below)
- Clean, responsive UI inspired by Andamen / Myntra / Neemans

## Tech Stack

- **Frontend:** React 18, Vite, React Router, Tailwind CSS, Axios
- **Backend:** Node.js, Express, JWT auth, bcrypt
- **Database:** MySQL (raw SQL via `mysql2`)

## Project Structure

```
koorm_cloths/
├── server/server/  # Express API + MySQL
└── client/client/  # React frontend
```

## Setup

### 1. Database

Koorm uses one MySQL database for customer, catalog, order, and admin data. Admin authentication still uses a separate JWT secret and login path:

```bash
mysql -u root -p < server/server/schema.sql        # koorm_db: users, products, orders, etc.
mysql -u root -p < server/server/admin_schema.sql  # koorm_db: admins table
```

### 2. Backend

```bash
cd server/server
npm install
cp .env.example .env    # edit DB_PASSWORD, JWT_SECRET, ADMIN_JWT_SECRET, etc.
npm run seed             # provisions admin@koorm.com; finish setup from /admin/login
npm run dev               # starts API on http://localhost:5000
```

The API upgrades existing database tables before accepting requests, including
the reply columns required by store and product reviews. After deploying backend
changes, restart the API so these upgrades run against the configured `DB_NAME`.
The database account must be allowed to alter tables; existing reviews are preserved.

New-order emails to Koorm and the customer include each ordered shirt's primary
photo. Catalogue photos are embedded in the email from `client/client/public/images`,
so local development photos do not depend on a public localhost URL. If the API
is deployed separately, set `EMAIL_IMAGE_ROOT` to the deployed catalogue image
directory. Missing local files fall back to `EMAIL_ASSET_BASE_URL` (default:
`https://koormcollection.com`); external product photo URLs remain linked images.

### 3. Frontend

```bash
cd client/client
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:5000/api
npm run dev               # starts app on http://localhost:5173
```

### 4. Online payments (Razorpay)

Online payment appears at checkout once Razorpay keys are set; without them the store offers cash on delivery only.

1. Create a Razorpay account and copy the **test** Key ID and Key Secret (Dashboard > Account & Settings > API Keys).
2. Add them to `server/server/.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, then restart the API.
3. Add a webhook (Dashboard > Webhooks) pointing to `https://<your-api-domain>/api/payments/webhook` with the events `payment.captured`, `order.paid`, `refund.processed` and `refund.failed`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`. The webhook confirms payments even if the customer closes the browser, and reports refund outcomes. Locally the browser's confirmation is enough; use a tunnel such as ngrok to test webhooks.
4. Test with Razorpay's test card or the UPI ID `success@razorpay` (`failure@razorpay` simulates a failed payment).
5. To go live, finish Razorpay's KYC and swap in the live keys. Razorpay checks that the site shows terms, privacy, refund/cancellation and contact pages before activating.

How orders and money move:

- **Online orders** hold their stock for 30 minutes while the customer pays. Unpaid orders are cancelled automatically and the stock goes back on sale; the customer can finish paying from the order page until then.
- **Cancellation requests**: before shipping, customers select **Request Cancellation**. The order stays on hold while the admin receives an email and a request in **Admin > Orders**. The admin selects **Approve cancellation**, then confirms. Only approval cancels the order, restocks items, returns coupon use, starts the online payment refund and emails the customer. Pending requests block shipping updates and payment retries; unpaid orders with a request also wait for approval instead of expiring automatically.
- Set `ADMIN_EMAIL` to the notification inbox and `CLIENT_URL` to the public storefront URL for email review links. Restart the API after deployment to add the cancellation request columns to existing databases.
- **Returns and exchanges**: within 30 days of the recorded delivery date, customers choose **Request a return** or **Request an exchange** from their order page. Exchanges include the desired replacement size or colour. Both await admin approval; the admin receives an email with a review link and a red count badge on **Returns & exchanges**. The count includes only requests awaiting approval and refreshes every 30 seconds or on window focus. Approve or decline the request, then mark returned items received (optionally restocking them). Returns can be refunded; for exchanges, arrange the replacement and adjust its stock before marking the exchange completed. Customers receive email updates at each stage. The delivery email also links to the request page.
- Restart the backend after deployment to add `request_type` and `exchange_details` and enable the `exchanged` status on existing return request tables. A delivered order without a recorded delivery date requires support to confirm that date; its purchase date is not used to shorten the return window.
- **Admin refunds**: any paid order can be refunded in full or in part from **Admin > Orders**. Cash-on-delivery orders are refunded by bank/UPI transfer, and the admin records the reference.

### 5. Login

- **Customer:** register a new account from the UI (`/register`, `/login`).
- **Admin:** separate login at `/admin/login` (also linked in the footer). `npm run seed` provisions the configured admin email; the first login emails an OTP and asks you to set the admin password. Admin sessions are stored independently in the browser (`koorm_admin` in localStorage) from customer sessions (`koorm_user`), so you can be logged in as both at once in the same browser.

## Notes

- Admin and customer identities remain logically separate in `koorm_db.users` and `koorm_db.admins`, with separate JWT secrets (`JWT_SECRET` / `ADMIN_JWT_SECRET`) and auth middleware (`protect` / `protectAdmin` in `server/server/middleware/auth.js`). A customer token is rejected by every `/api/admin/*` route and an admin token is rejected by every customer route.
- The replacement collection contains 25 shirts and 150 photographs from `Updated_26_charts`, served from `client/client/public/images/collection-26/`. Homepage photography, shop listings, and admin listings use this collection. The homepage loads products in batches of 12 and its detail gallery uses the loaded products.
- Replacement catalogue defaults: ₹2,499 base price, no discount, S–XXL sizes, and zero stock pending confirmation. Update prices, sizes, and stock in the admin editor before selling. New products have no fabricated reviews or ratings.
- `node utils/replaceCollection.cjs` (from `server/server/`) validates the replacement manifest and photographs. Add `--replace` to back up the existing catalogue under ignored `server/server/backups/` and replace products in a transaction. Re-running after replacement preserves admin edits. Historical orders retain their names/prices. Old product-specific cart, wishlist, and review entries follow the database foreign-key rules.
- Free shipping is applied automatically on orders ≥ ₹1999 (configurable in `server/server/controllers/orderController.js`).

## Deployment

See [DEPLOY.md](DEPLOY.md). Production builds read the API address from `client/client/.env.production`.
