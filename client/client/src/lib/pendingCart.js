// Remembers an item a guest tried to add so it can be added once they log in.
const KEY = 'koorm_pending_cart_item';

export const savePendingCartItem = (productId, size, quantity = 1) => {
  try { sessionStorage.setItem(KEY, JSON.stringify({ productId, size, quantity })); } catch { /* storage unavailable */ }
};

export const takePendingCartItem = () => {
  try {
    const stored = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};
