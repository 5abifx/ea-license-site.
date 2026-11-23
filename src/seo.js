// Search engine basics for the public pages: the title + description Google shows, a canonical link to the
// real domain (so the onrender.com copy is not listed), structured data Google can read, and /sitemap.xml.
// Edit the wording in META. Keep titles under ~60 characters and descriptions under ~155.
// Never name the mentorship method or the Compass indicator here: this text is public.
const { esc, trialDays } = require('./views');
const { PLANS } = require('./plans');

const SITE_URL = (process.env.SITE_URL || 'https://5abifx.com').replace(/\/+$/, '');
const BRAND = '5ABI.FX';

const priceLine = () => PLANS.map((p) => `${p.name} $${p.monthly}`).join(', ');
const trialBit = (s) => (trialDays() ? s : '');

// path -> { title, desc } (functions so plan prices and the trial follow the live settings)
const META = {
  '/': () => ({
    title: `${BRAND} · MT5 Risk Manager, Trade Journal & Mentorship`,
    desc: `Your rules, enforced on every trade. KATANA guards your daily loss, drawdown and news. The journal logs every MT5 trade for you.${trialBit(' Free trial.')}`,
  }),
  '/katana': () => ({
    title: `KATANA · MT5 Risk Manager for Prop Firm Traders · ${BRAND}`,
    desc: `Auto lot size from your risk, a stop on every trade, and a hard lock at your daily loss and drawdown. Prop firm rules, news lock, phone alerts.${trialBit(' Free trial.')}`,
  }),
  '/trade-journal': () => ({
    title: `Automatic MT5 Trade Journal · ${BRAND}`,
    desc: `Every MT5 trade logged for you with the real chart. Calendar, insights that find your costly habits, prop firm guard and share cards.${trialBit(' Free trial.')}`,
  }),
  '/mentorship': () => ({
    title: `Live Day Trading Mentorship · ${BRAND}`,
    desc: '8 weeks of live day trading with Gursewak at the midnight New York open. Pro trading software and a heatmap included. Small batches, real markets.',
  }),
  '/pricing': () => ({
    title: `Pricing: Journal, KATANA & Pro Plans · ${BRAND}`,
    desc: `${priceLine().replace(/, ([^,]*)$/, ', $1')} a month, less on annual.${trialBit(' Every plan starts with a free trial.')} Cancel anytime.`,
  }),
  '/faq': () => ({
    title: `FAQ: KATANA, Trade Journal & Prop Firms · ${BRAND}`,
    desc: 'Install KATANA on MT5, prop firm rules, news lock, phone alerts, payments and accounts, answered in plain words.',
  }),
};
// pages listed in /sitemap.xml and opened to crawlers in robots.txt (/why ships with its own page)
const PUBLIC = ['/', '/katana', '/trade-journal', '/pricing', '/why', '/faq', '/help/ea-blocked', '/terms', '/privacy'];

const metaFor = (path) => (META[path] ? META[path]() : null);
const canonical = (path) => `${SITE_URL}${path === '/' ? '/' : path}`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const strip = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function socials() {
  return ['MENTOR_YOUTUBE', 'MENTOR_DISCORD', 'MENTOR_INSTAGRAM', 'MENTOR_X'].map((k) => process.env[k]).filter((u) => /^https:\/\//.test(u || ''));
}

// Brand, site name (Google shows "5ABI.FX" above the result) and the main pages it may list under it
function appData(path) {
  const app = (name, description, plans) => ({
    '@type': 'SoftwareApplication', name, description, applicationCategory: 'FinanceApplication', operatingSystem: 'MetaTrader 5',
    publisher: { '@type': 'Organization', name: BRAND, url: `${SITE_URL}/` }, url: `${SITE_URL}${path}`,
    offers: plans.map((p) => ({ '@type': 'Offer', name: `${p.name} plan`, price: String(p.monthly), priceCurrency: 'USD', url: `${SITE_URL}/pricing?plan=${p.id}` })),
  });
  return path === '/katana'
    ? app('KATANA', 'MT5 risk manager: daily loss and drawdown shield, prop firm rules, news lock and phone alerts.', PLANS.filter((p) => p.id !== 'journal'))
    : app('5ABI.FX Trade Journal', 'Automatic MT5 trade journal with calendar, insights, prop firm guard and shareable trade cards.', PLANS);
}
const productData = (path) => ld({ '@context': 'https://schema.org', ...appData(path) });

function homeData() {
  const org = { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: BRAND, url: `${SITE_URL}/`, logo: `${SITE_URL}/logo.png` };
  const sameAs = socials();
  if (sameAs.length) org.sameAs = sameAs;
  return ld({
    '@context': 'https://schema.org',
    '@graph': [
      org,
      { '@type': 'WebSite', '@id': `${SITE_URL}/#site`, name: BRAND, alternateName: ['5ABIFX', '5abifx.com'], url: `${SITE_URL}/`, publisher: { '@id': `${SITE_URL}/#org` } },
      appData('/katana'),
      appData('/trade-journal'),
      { '@type': 'ItemList', name: 'Main pages', itemListElement: [
        ['KATANA', '/katana'], ['Trade Journal', '/trade-journal'], ['Pricing', '/pricing'], ['Why KATANA', '/why'], ['FAQ', '/faq'],
      ].map(([name, p], i) => ({ '@type': 'SiteNavigationElement', position: i + 1, name, url: `${SITE_URL}${p}` })) },
    ],
  });
}

function mentorshipData() {
  return ld({
    '@context': 'https://schema.org', '@type': 'Course', name: 'Live Day Trading Mentorship',
    description: metaFor('/mentorship').desc,
    provider: { '@type': 'Organization', name: BRAND, sameAs: `${SITE_URL}/` }, url: `${SITE_URL}/mentorship`,
  });
}

// qa: [[question, answerHtml]]
function faqData(qa) {
  return ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
  });
}

// Extra <head> tags for a page: canonical on public pages, plus any structured data the page passes
function headTags(req, opts = {}) {
  const pub = !req.user && PUBLIC.includes(req.path);
  return `${pub ? `<link rel="canonical" href="${esc(canonical(req.path))}">` : ''}${opts.ld || ''}`;
}

function routes(app) {
  app.get('/sitemap.xml', (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    const urls = PUBLIC.map((p) => `<url><loc>${esc(canonical(p))}</loc><lastmod>${day}</lastmod><priority>${p === '/' ? '1.0' : ['/terms', '/privacy'].includes(p) ? '0.3' : '0.8'}</priority></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });
}

module.exports = { SITE_URL, PUBLIC, metaFor, headTags, homeData, productData, mentorshipData, faqData, routes };
