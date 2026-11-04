const swatches = {
  black: '#252525', white: '#f4f3ee', grey: '#929598', gray: '#929598',
  blue: '#345da1', red: '#bd4242', green: '#527653', yellow: '#e4ca55',
  pink: '#e8bfc5', purple: '#845a9c', orange: '#d88542', brown: '#795548',
  beige: '#c8b99e', cream: '#eee9db', silver: '#b9bdc1', gold: '#b49a3c',
  'light pink': '#e8bfc5', 'blush pink': '#dca7a5', 'aqua blue': '#83bcc8',
  burgundy: '#632f40', charcoal: '#44464a', 'charcoal grey': '#55575b',
  'light blue': '#a8c8dd', 'royal blue': '#345da1', 'chocolate brown': '#54382b',
  'dark navy': '#202c43', navy: '#202c43', rust: '#a55538', mustard: '#b49a3c',
  'off white': '#eee9db', 'olive green': '#73794d', 'petrol blue': '#366570',
  'sand beige': '#c8b99e', cherry: '#903c47', 'rust orange': '#b6643d',
  'black & white': 'linear-gradient(135deg, #252525 50%, #f4f3ee 50%)',
  'white & grey': 'linear-gradient(135deg, #f4f3ee 50%, #929598 50%)',
};

// Use the same values on the server and in the browser to avoid hydration changes.
export const swatchBackground = color => {
  const name = String(color || '').trim().toLowerCase().replace(/-/g, ' ');
  return swatches[name] || (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(name) ? name : '#d2cec7');
};
