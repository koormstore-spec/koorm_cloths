// Admin-facing wording for how a customer paid, from the payment snapshot the
// server saves from Razorpay. Razorpay never shares full card or account
// numbers, so these are the identifiers available.

const BANKS = {
  HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank',
  PUNB_R: 'Punjab National Bank', BARB_R: 'Bank of Baroda', YESB: 'Yes Bank', IDFB: 'IDFC FIRST Bank', INDB: 'IndusInd Bank',
  CNRB: 'Canara Bank', UBIN: 'Union Bank of India', FDRL: 'Federal Bank', IBKL: 'IDBI Bank', BKID: 'Bank of India',
};

const METHODS = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later', cardless_emi: 'Cardless EMI', bank_transfer: 'Bank transfer' };

export const bankName = (code) => (code ? BANKS[code] || code : null);

export const methodName = (method) => (method ? METHODS[method] || method.replace(/_/g, ' ') : null);

export const capitalize = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

// One line such as "UPI · jane@okhdfcbank" or "Visa credit •••• 4242".
export function paymentMethodLabel(details) {
  if (!details?.method) return null;
  const { method, card, vpa, bank, wallet } = details;
  if (card && ['card', 'emi'].includes(method)) {
    const name = [card.network, card.type].filter(Boolean).join(' ') || methodName(method);
    return card.last4 ? `${name} •••• ${card.last4}` : name;
  }
  if (method === 'upi') return vpa ? `UPI · ${vpa}` : 'UPI';
  if (method === 'netbanking') return bank ? `Net banking · ${bankName(bank)}` : 'Net banking';
  if (method === 'wallet') return wallet ? `Wallet · ${capitalize(wallet)}` : 'Wallet';
  return methodName(method);
}

export const razorpayDashboardUrl = (paymentId) => `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(paymentId)}`;
