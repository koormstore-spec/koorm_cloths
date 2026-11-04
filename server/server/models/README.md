# Models

Models are the database access layer for the backend. Controllers should handle HTTP input and output, while models own SQL queries and table-specific persistence.

- `userModel.js` and `addressModel.js`: customer identity and addresses
- `productModel.js` and `categoryModel.js`: catalog data
- `cartModel.js` and `wishlistModel.js`: customer saved items
- `couponModel.js`: discount codes
- `orderModel.js`: orders and order items
- `reviewModel.js`: product reviews
- `adminModel.js`: administrator identity

Models use the shared MySQL pools from `config/db.js` and return plain database records. Business rules and response formatting remain in controllers.
