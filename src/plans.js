// Plans shown on /pricing and applied by the admin "Mark as paid" button.
// Edit prices and features here. `eas`: 'all' = every active EA, or a list of EA codes.
// `annual` is the per-month price when billed yearly (charged as annual × 12).
const PLANS = [
  { id: 'journal', name: 'Journal', tagline: 'for traders who want to review',
    monthly: 12, annual: 9, accounts: 1, eas: ['JOURNAL'],
    features: ['Trade Journal EA', 'Calendar by day and account', 'Journal Insights', 'Share cards from real trades', '1 MT5 account'] },
  { id: 'katana', name: 'KATANA', tagline: 'for active traders', popular: true,
    monthly: 20, annual: 15, accounts: 3, eas: 'all',
    extrasTitle: 'Everything in Journal, plus',
    features: ['KATANA risk manager', 'Shield: closes all + locks at your daily or max loss', 'Prop firm presets, trailing drawdown', 'Payout consistency rule guard', 'R:R lock and floating loss limit', 'Prop or live account, set automatically', 'News lock and tilt guard', 'Phone alerts', 'Auto lot size and stop loss', 'Up to 3 MT5 accounts', 'Prop-firm support email'] },
  { id: 'pro', name: 'Pro', tagline: 'for funded and multi-account traders',
    monthly: 39, annual: 29, accounts: 10, eas: 'all',
    extrasTitle: 'Everything in KATANA, plus',
    features: ['Up to 10 MT5 accounts', 'Every new EA as it is released', 'Priority support'] },
];
const BILLING = { monthly: { label: 'Monthly', days: 30 }, annual: { label: 'Annual', days: 365 } };

const getPlan = (id) => PLANS.find((p) => p.id === id) || null;
const cleanBilling = (b) => (b === 'annual' ? 'annual' : 'monthly');
const perMonth = (p, billing) => (billing === 'annual' ? p.annual : p.monthly);
const dueNow = (p, billing) => (billing === 'annual' ? p.annual * 12 : p.monthly);
const maxSave = () => Math.max(...PLANS.map((p) => Math.floor((1 - p.annual / p.monthly) * 100)));

module.exports = { PLANS, BILLING, getPlan, cleanBilling, perMonth, dueNow, maxSave };
