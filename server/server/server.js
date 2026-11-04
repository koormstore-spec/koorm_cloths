require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const { initializeDatabase } = require('./config/databaseInit');
const { testConnection } = require('./config/db');
const { notFound, errorHandler, logErrorResponses } = require('./middleware/errorHandler');
const { logError } = require('./utils/logger');
const { publicCache } = require('./middleware/publicCache');
const { corsOptions } = require('./config/cors');
const { getStatus } = require('./controllers/statusController');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const couponRoutes = require('./routes/couponRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const returnRoutes = require('./routes/returnRoutes');
const { handleWebhook } = require('./controllers/paymentController');
const { startPendingOrderSweeper } = require('./utils/orderLifecycle');
const { logPaymentConfig } = require('./utils/razorpay');

const app = express();

app.use(cors(corsOptions));
app.use(compression());
// Razorpay signs the exact raw body, so this route must be read before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleWebhook);
app.use(morgan('dev'));
app.use(logErrorResponses);
app.use('/api/returns', returnRoutes);
app.use(express.json());


// Open the API's address in a browser to see that it and its database are working.
app.get(['/', '/api/health'], getStatus);
app.use('/api/auth', authRoutes);
app.use('/api/products', publicCache(), productRoutes);
app.use('/api/categories', publicCache(), categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payments', paymentRoutes);
// Only the public review listings are cached; other review routes are writes.
const cacheReviewListings = publicCache();
app.use('/api/reviews', (req, res, next) => (['/', '/store'].includes(req.path) ? cacheReviewListings(req, res, next) : next()));
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

process.on('uncaughtException', (err) => {
  logError(err, null, { source: 'uncaughtException' });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(reason, null, { source: 'unhandledRejection' });
});

const PORT = process.env.PORT || 5000;

initializeDatabase()
  .then(() => testConnection())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Koorm API server running on port ${PORT}`);
      logPaymentConfig();
      // Releases stock held by online orders that were never paid.
      startPendingOrderSweeper();
    });
  })
  .catch((err) => {
    logError(err, null, { source: 'databaseInitialization' });
    process.exit(1);
  });
