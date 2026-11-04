import api from '../api/axios';

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

// Loads Razorpay's checkout script once, the first time someone pays.
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('The payment window could not be opened.')));
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error('The payment window could not load. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

// Opens the Razorpay window for an order created by the server. Resolves with
// Razorpay's signed response when the customer pays; rejects with
// `dismissed: true` if they close the window without paying.
export async function openRazorpay(payment) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    let lastFailure = '';
    const checkout = new Razorpay({
      key: payment.key_id,
      order_id: payment.razorpay_order_id,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      prefill: payment.prefill,
      notes: { order_id: String(payment.razorpay_order_id) },
      retry: { enabled: true, max_count: 3 },
      theme: { color: '#20272b' },
      handler: resolve,
      modal: {
        ondismiss: () => reject(Object.assign(new Error(lastFailure || 'Payment was not completed.'), { dismissed: true })),
      },
    });
    // Razorpay keeps its window open after a failed attempt so the customer
    // can try another method; remember why in case they then close it.
    checkout.on('payment.failed', (response) => {
      lastFailure = response?.error?.description || 'The payment did not go through.';
    });
    checkout.open();
  });
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Sends Razorpay's signed response to the server. Money has already been taken
// at this point, so a dropped connection is retried rather than shown as a failure.
async function confirmWithServer(orderId, response, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { data } = await api.post('/payments/verify', { order_id: orderId, ...response });
      return data;
    } catch (err) {
      const offline = !err.response;
      if (offline && attempt < attempts) {
        await wait(1500 * attempt);
        continue;
      }
      if (offline || err.response?.data?.confirming) {
        // Razorpay's webhook confirms the order on the server even so.
        throw Object.assign(new Error('Your payment was received and is being confirmed. This page will update in a minute.'), { confirming: true });
      }
      throw err;
    }
  }
}

// Pays for an order and confirms it with the server, which checks Razorpay's
// signature and the captured amount before marking the order paid.
export async function payForOrder(orderId, payment) {
  const response = await openRazorpay(payment);
  return confirmWithServer(orderId, response);
}
