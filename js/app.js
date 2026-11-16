/* Kornomart storefront
 *
 * How the pieces connect, for whoever builds the price app and the order sheet later:
 *
 *   PRICES  The page holds no prices. It reads them from SETTINGS.catalogueUrl (today a small
 *           file, data/catalogue.json). When the owner's app exists, point that setting at the
 *           app's price API and keep the same record shape; nothing else in the site changes.
 *           Open pages re-check prices every few minutes and whenever the tab is reopened.
 *
 *   ORDERS  submitOrder() sends one JSON order to SETTINGS.orderEndpoint. That endpoint is not
 *           built yet, so for now an order stays in the browser and the page says so.
 *           The server that receives orders must price every line from its own price table:
 *           the order carries product ids and quantities, and the total inside it is only what
 *           the customer was shown. The same server writes the Google Sheet row and, later,
 *           starts the payment.
 *
 *   SAFETY  Everything from outside (the price file, what people type, the saved order) is
 *           checked before use and written to the page as plain text, never as HTML.
 */
(() => {
  'use strict';

  /* ───────── 1. Settings: the one block that changes when the backend arrives ───────── */

  const SETTINGS = Object.freeze({
    catalogueUrl: 'data/catalogue.json',   // later: the price API of the owner's app
    orderEndpoint: null,                   // later: the order API (writes to Google Sheets)
    refreshEveryMs: 5 * 60 * 1000,
    timeZone: 'Asia/Dhaka',
    maxSacksPerLine: 999,
    minSecondsOnForm: 3,                   // faster than this is a script, not a person
    secondsBetweenOrders: 20,
    shop: Object.freeze({ phone: '', address: '' }),
  });

  const CART_KEY = 'kornomart.order.v1';
  const LANG_KEY = 'kornomart.lang';
  const LAST_ORDER_KEY = 'kornomart.lastOrderAt';

  /* ───────── 2. Words ───────── */

  const WORDS = {
    bn: {
      'skip': 'মূল অংশে যান',
      'nav.label': 'প্রধান মেনু',
      'nav.rice': 'চালের তালিকা',
      'nav.how': 'অর্ডার যেভাবে হয়',
      'nav.order': 'অর্ডার',
      'hero.h': 'বস্তা ধরে চাল কিনুন।',
      'hero.sub': 'কর্ণমার্টে ২৫ ও ৫০ কেজির বস্তায় নানা জাতের চাল পাওয়া যায়। দর নিয়মিত হালনাগাদ হয়, তাই এখানে যে দাম দেখছেন সেটাই চলতি দাম।',
      'hero.cta1': 'চাল বাছুন',
      'hero.cta2': 'অর্ডার যেভাবে হয়',
      'slip.h': 'চালের দর',
      'slip.col': 'চাল',
      'slip.foot': 'দাম টাকায়, প্রতি বস্তা।',
      'slip.updated': 'হালনাগাদ {date}',
      'kg': '{n} কেজি',
      'shelf.h': 'চালের তালিকা',
      'shelf.sub': 'ওজন বাছুন, কয় বস্তা লাগবে লিখুন, তারপর অর্ডারে যোগ করুন।',
      'item.weight': 'বস্তার ওজন',
      'item.perkg': 'প্রতি কেজি {price}',
      'item.save': 'দুটি {kg} কেজির বস্তার চেয়ে {amount} কম',
      'item.qty': 'বস্তার সংখ্যা',
      'item.less': 'এক বস্তা কমান',
      'item.more': 'এক বস্তা বাড়ান',
      'item.add': 'অর্ডারে যোগ করুন',
      'item.out': 'এখন মজুত নেই',
      'load.loading': 'দর আনা হচ্ছে…',
      'load.error.h': 'দর এখন দেখানো যাচ্ছে না',
      'load.error.p': 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
      'load.retry': 'আবার চেষ্টা করুন',
      'how.h': 'অর্ডার যেভাবে হয়',
      'how.1.h': 'বস্তা বাছুন',
      'how.1.p': 'চালের জাত, বস্তার ওজন আর কয় বস্তা লাগবে ঠিক করুন।',
      'how.2.h': 'নাম, মোবাইল নম্বর ও ঠিকানা দিন',
      'how.2.p': 'অনলাইনে কোনো টাকা দিতে হয় না।',
      'how.3.h': 'ফোনে নিশ্চিত হলে চাল পৌঁছাবে',
      'how.3.p': 'দোকান থেকে ফোন করে অর্ডার নিশ্চিত করা হবে। টাকা দেবেন চাল হাতে পাওয়ার সময়।',
      'order.h': 'আপনার অর্ডার',
      'order.empty': 'এখনো কোনো বস্তা যোগ করেননি।',
      'order.browse': 'চালের তালিকা দেখুন',
      'order.total': 'মোট',
      'order.each': 'প্রতি বস্তা {price}',
      'order.remove': '{name}, {kg} বাদ দিন',
      'order.qtyfor': '{name}, {kg}: বস্তার সংখ্যা',
      'order.pricenote': 'মোট দাম চলতি দর থেকে হিসাব করা। দর বদলালে এখানেও বদলে যাবে।',
      'form.h': 'কোথায় পৌঁছাবে',
      'form.name': 'আপনার নাম',
      'form.name.ph': 'যেমন: আবদুল করিম…',
      'form.phone': 'মোবাইল নম্বর',
      'form.phone.hint': '১১ সংখ্যার নম্বর, ০১ দিয়ে শুরু।',
      'form.address': 'ঠিকানা',
      'form.address.ph': 'বাড়ি বা দোকান, রাস্তা, এলাকা, থানা, জেলা…',
      'form.note': 'বাড়তি কথা (ঐচ্ছিক)',
      'form.note.ph': 'যেমন: বিকেলের পরে ফোন করবেন…',
      'form.submit': 'অর্ডার পাঠান',
      'form.sending': 'পাঠানো হচ্ছে…',
      'err.empty': 'আগে অন্তত একটি বস্তা অর্ডারে যোগ করুন।',
      'err.name': 'নাম লিখুন, কমপক্ষে ২ অক্ষর। নামে শুধু অক্ষর, ফাঁকা জায়গা, ডট ও হাইফেন চলবে।',
      'err.phone': '১১ সংখ্যার মোবাইল নম্বর লিখুন, যেমন 017XXXXXXXX।',
      'err.address': 'পুরো ঠিকানা লিখুন, কমপক্ষে ১০ অক্ষর।',
      'err.fast': 'ফর্মটি খুব দ্রুত জমা পড়েছে। কয়েক সেকেন্ড পরে আবার অর্ডার পাঠান।',
      'err.limit': 'একটু আগেই একটি অর্ডার জমা পড়েছে। {s} সেকেন্ড পরে আবার অর্ডার পাঠান।',
      'err.send': 'অর্ডার পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন। আপনার লেখা মুছে যায়নি।',
      'memo.h': 'অর্ডারের মেমো',
      'memo.preview': 'প্রিভিউ সংস্করণ: এই অর্ডার এখনো দোকানে পাঠানো হয়নি। সাইট চালু হলে একই বোতাম অর্ডার সরাসরি দোকানে পৌঁছে দেবে।',
      'memo.sent': 'অর্ডার দোকানে পৌঁছেছে। নিশ্চিত করতে আপনাকে ফোন করা হবে।',
      'memo.ref': 'মেমো নম্বর',
      'memo.date': 'তারিখ',
      'memo.name': 'নাম',
      'memo.phone': 'মোবাইল',
      'memo.address': 'ঠিকানা',
      'memo.note': 'বাড়তি কথা',
      'memo.copy': 'মেমো কপি করুন',
      'memo.new': 'নতুন অর্ডার শুরু করুন',
      'toast.added': '{sacks} {name} ({kg}) অর্ডারে যোগ হয়েছে',
      'toast.removed': '{name} ({kg}) বাদ দেওয়া হয়েছে',
      'toast.undo': 'ফিরিয়ে আনুন',
      'toast.prices': 'দর হালনাগাদ হয়েছে। নতুন দাম দেখানো হচ্ছে।',
      'toast.copied': 'মেমো কপি হয়েছে',
      'toast.copyfail': 'কপি করা যায়নি। মেমোর লেখা নিজে বেছে নিয়ে কপি করুন।',
      'dock.text': '{sacks}, মোট {total}',
      'dock.go': 'অর্ডার দেখুন',
      'foot.line': '২৫ ও ৫০ কেজির বস্তায় চাল।',
      'foot.contact.h': 'যোগাযোগ',
      'foot.phone.todo': 'দোকানের ফোন নম্বর এখানে বসবে',
      'foot.address.todo': 'দোকানের ঠিকানা এখানে বসবে',
    },
    en: {
      'skip': 'Skip to main content',
      'nav.label': 'Main menu',
      'nav.rice': 'Rice list',
      'nav.how': 'How ordering works',
      'nav.order': 'Order',
      'hero.h': 'Buy rice by the sack.',
      'hero.sub': 'Kornomart sells many kinds of rice in 25 kg and 50 kg sacks. Prices are updated regularly, so the price you see here is the current one.',
      'hero.cta1': 'Choose rice',
      'hero.cta2': 'How ordering works',
      'slip.h': 'Rice prices',
      'slip.col': 'Rice',
      'slip.foot': 'Prices in taka, per sack.',
      'slip.updated': 'Updated {date}',
      'kg': '{n} kg',
      'shelf.h': 'Rice list',
      'shelf.sub': 'Pick a weight, enter how many sacks you need, then add them to your order.',
      'item.weight': 'Sack weight',
      'item.perkg': '{price} per kg',
      'item.save': '{amount} less than two {kg} kg sacks',
      'item.qty': 'Number of sacks',
      'item.less': 'One sack fewer',
      'item.more': 'One sack more',
      'item.add': 'Add to order',
      'item.out': 'Out of stock',
      'load.loading': 'Loading prices…',
      'load.error.h': 'Prices can’t be shown right now',
      'load.error.p': 'Check your internet connection and try again.',
      'load.retry': 'Try again',
      'how.h': 'How ordering works',
      'how.1.h': 'Choose your sacks',
      'how.1.p': 'Pick the kind of rice, the sack weight and how many sacks you need.',
      'how.2.h': 'Give your name, mobile number and address',
      'how.2.p': 'You pay nothing online.',
      'how.3.h': 'We confirm by phone, then deliver',
      'how.3.p': 'The shop calls you to confirm the order. You pay when the rice reaches you.',
      'order.h': 'Your order',
      'order.empty': 'You haven’t added any sacks yet.',
      'order.browse': 'See the rice list',
      'order.total': 'Total',
      'order.each': '{price} per sack',
      'order.remove': 'Remove {name}, {kg}',
      'order.qtyfor': '{name}, {kg}: number of sacks',
      'order.pricenote': 'The total uses current prices. If a price changes, it changes here too.',
      'form.h': 'Where to deliver',
      'form.name': 'Your name',
      'form.name.ph': 'e.g. Abdul Karim…',
      'form.phone': 'Mobile number',
      'form.phone.hint': '11 digits, starting with 01.',
      'form.address': 'Address',
      'form.address.ph': 'House or shop, road, area, thana, district…',
      'form.note': 'Anything else (optional)',
      'form.note.ph': 'e.g. Please call after the afternoon…',
      'form.submit': 'Send order',
      'form.sending': 'Sending…',
      'err.empty': 'Add at least one sack to your order first.',
      'err.name': 'Enter your name, at least 2 letters. Use only letters, spaces, dots and hyphens.',
      'err.phone': 'Enter an 11-digit mobile number, like 017XXXXXXXX.',
      'err.address': 'Enter your full address, at least 10 characters.',
      'err.fast': 'The form was sent too quickly. Wait a few seconds, then send the order again.',
      'err.limit': 'An order was sent a moment ago. Send the next one in {s} seconds.',
      'err.send': 'The order could not be sent. Check your connection and try again. Nothing you typed was lost.',
      'memo.h': 'Order memo',
      'memo.preview': 'Preview version: this order has not been sent to the shop yet. Once the site is live, the same button will deliver it straight to the shop.',
      'memo.sent': 'The shop has your order. They will call you to confirm it.',
      'memo.ref': 'Memo number',
      'memo.date': 'Date',
      'memo.name': 'Name',
      'memo.phone': 'Mobile',
      'memo.address': 'Address',
      'memo.note': 'Note',
      'memo.copy': 'Copy memo',
      'memo.new': 'Start a new order',
      'toast.added': 'Added {sacks} of {name} ({kg}) to your order',
      'toast.removed': 'Removed {name} ({kg})',
      'toast.undo': 'Undo',
      'toast.prices': 'Prices were updated. You are seeing the new ones.',
      'toast.copied': 'Memo copied',
      'toast.copyfail': 'Copying failed. Select the memo text and copy it yourself.',
      'dock.text': '{sacks}, total {total}',
      'dock.go': 'See order',
      'foot.line': 'Rice in 25 kg and 50 kg sacks.',
      'foot.contact.h': 'Contact',
      'foot.phone.todo': 'The shop’s phone number goes here',
      'foot.address.todo': 'The shop’s address goes here',
    },
  };

  /* ───────── 3. State ───────── */

  let lang = 'bn';
  let catalogue = [];
  let byId = new Map();
  let signature = '';
  let loadFailed = false;
  let lastFetchAt = 0;
  let orderInView = false;
  let sending = false;
  let memo = null;                 // the order last shown as a memo, or null
  let shownErrors = {};
  const cart = new Map();          // "product-id:kg" → sacks
  const picks = new Map();         // product id → { kg, qty } chosen on the shelf
  const pageOpenedAt = Date.now();
  let formTouchedAt = 0;

  /* ───────── 4. Small helpers ───────── */

  const $ = (selector, root = document) => root.querySelector(selector);

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  const icon = (name) => $('#ico-' + name).content.firstElementChild.cloneNode(true);

  function remember(area, key, value) { try { window[area].setItem(key, value); } catch { /* storage can be off */ } }
  function recall(area, key) { try { return window[area].getItem(key); } catch { return null; } }

  const FORMATS = {
    bn: {
      num: new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 }),
      date: new Intl.DateTimeFormat('bn-BD', { timeZone: SETTINGS.timeZone, day: 'numeric', month: 'long', year: 'numeric' }),
    },
    en: {
      num: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }),
      date: new Intl.DateTimeFormat('en-GB', { timeZone: SETTINGS.timeZone, day: 'numeric', month: 'long', year: 'numeric' }),
    },
  };

  const toAscii = (text) => String(text).replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09E6));
  const toBangla = (value) => String(value).replace(/\d/g, (d) => String.fromCharCode(0x09E6 + Number(d)));
  const digits = (n) => (lang === 'bn' ? toBangla(n) : String(n));
  const num = (n) => FORMATS[lang].num.format(n);
  const taka = (n) => '৳' + num(n);
  const kgLabel = (kg) => t('kg', { n: num(kg) });
  const sackCount = (n) => (lang === 'bn' ? `${toBangla(n)} বস্তা` : `${n} ${n === 1 ? 'sack' : 'sacks'}`);
  const pick = (pair) => (pair ? pair[lang] || pair.bn : '');
  const other = (pair) => (pair ? pair[lang === 'bn' ? 'en' : 'bn'] : '');

  function t(key, vars) {
    let text = WORDS[lang][key];
    if (text === undefined) text = WORDS.bn[key];
    if (text === undefined) return key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
  }

  const clampQty = (value) => {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(SETTINGS.maxSacksPerLine, n);
  };

  /** Runs a re-render and puts keyboard focus back on the same control afterwards. */
  function keepFocus(render) {
    const active = document.activeElement;
    const mark = active && active.dataset ? active.dataset.fk : null;
    render();
    if (!mark) return;
    for (const node of document.querySelectorAll('[data-fk]')) {
      if (node.dataset.fk === mark && !node.disabled) { node.focus({ preventScroll: true }); break; }
    }
  }

  /* ───────── 5. Prices: fetch, check, refresh ───────── */

  /** Strips control characters and angle brackets, trims, and cuts to a maximum length. */
  function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
  }

  function cleanPair(value, max) {
    if (!value || typeof value !== 'object') return null;
    const bn = cleanText(value.bn, max);
    const en = cleanText(value.en, max);
    if (!bn && !en) return null;
    return Object.freeze({ bn: bn || en, en: en || bn });
  }

  /** Accepts only well-formed price records. A broken or tampered record is dropped, never shown. */
  function checkCatalogue(raw) {
    if (!Array.isArray(raw)) throw new Error('catalogue: not a list');
    const seen = new Set();
    const good = [];
    for (const row of raw.slice(0, 200)) {
      if (!row || typeof row !== 'object') continue;
      const id = typeof row.id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(row.id) ? row.id : null;
      if (!id || seen.has(id)) continue;
      const name = cleanPair(row.name, 80);
      if (!name) continue;

      const packs = [];
      if (Array.isArray(row.packs)) {
        for (const pack of row.packs.slice(0, 6)) {
          const kg = pack ? pack.kg : null;
          const price = pack ? pack.price : null;
          const fine = Number.isInteger(kg) && kg >= 1 && kg <= 100
            && Number.isInteger(price) && price >= 1 && price <= 1000000
            && !packs.some((x) => x.kg === kg);
          if (fine) packs.push(Object.freeze({ kg, price }));
        }
      }
      if (!packs.length) continue;
      packs.sort((a, b) => a.kg - b.kg);

      const updated = Date.parse(row.updated_at);
      const tol = row.tolerance_g;
      seen.add(id);
      good.push(Object.freeze({
        id,
        name,
        short: cleanPair(row.short, 30) || name,
        grade: cleanPair(row.grade, 20),
        process: cleanPair(row.process, 30),
        toleranceG: Number.isInteger(tol) && tol > 0 && tol <= 1000 ? tol : null,
        packs: Object.freeze(packs),
        inStock: row.in_stock !== false,
        sort: Number.isFinite(row.sort) ? row.sort : 999,
        updatedAt: Number.isFinite(updated) ? updated : null,
      }));
    }
    if (!good.length) throw new Error('catalogue: no usable records');
    good.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    return good;
  }

  async function fetchCatalogue() {
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), 10000);
    try {
      const reply = await fetch(SETTINGS.catalogueUrl, { cache: 'no-store', signal: stop.signal, headers: { Accept: 'application/json' } });
      if (!reply.ok) throw new Error('catalogue: HTTP ' + reply.status);
      return checkCatalogue(await reply.json());
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function refresh() {
    lastFetchAt = Date.now();
    try {
      const next = await fetchCatalogue();
      const nextSignature = JSON.stringify(next);
      if (nextSignature !== signature) {
        const first = signature === '';
        signature = nextSignature;
        catalogue = next;
        byId = new Map(next.map((p) => [p.id, p]));
        if (first) { loadCart(); saveCart(); } else pruneCart();
        loadFailed = false;
        $('#shelf-error').hidden = true;
        $('#shelf-grid').hidden = false;
        keepFocus(renderAll);
        if (!first) toast(t('toast.prices'));
      }
    } catch {
      // Keep showing the last prices that loaded correctly; only complain when there are none.
      if (!catalogue.length) { loadFailed = true; renderLoadError(); }
    }
  }

  function renderLoadError() {
    $('#shelf-grid').hidden = true;
    $('#shelf-error').hidden = false;
    const row = el('tr');
    row.append(el('th', { scope: 'row', colspan: '3' }, t('load.error.h')));
    const body = $('#rates-body');
    body.replaceChildren(row);
    body.setAttribute('aria-busy', 'false');
  }

  /* ───────── 6. Drawing the page ───────── */

  function renderAll() {
    renderRates();
    renderShelf();
    renderOrder();
    renderContact();
    if (memo) paintMemo();
  }

  function renderRates() {
    const sizes = [...new Set(catalogue.flatMap((p) => p.packs.map((x) => x.kg)))].sort((a, b) => a - b);

    const head = [el('th', { scope: 'col' }, t('slip.col'))];
    for (const kg of sizes) head.push(el('th', { scope: 'col', class: 'num' }, kgLabel(kg)));
    $('#rates-head').replaceChildren(...head);

    const rows = catalogue.map((p) => {
      const row = el('tr');
      const cell = el('th', { scope: 'row' });
      cell.append(el('a', { href: '#chal-' + p.id }, pick(p.short)));
      const detail = [pick(p.grade), pick(p.process)].filter(Boolean).join(', ');
      if (detail) cell.append(el('small', null, detail));
      row.append(cell);
      for (const kg of sizes) {
        const pack = p.packs.find((x) => x.kg === kg);
        row.append(el('td', { class: 'num' }, pack ? taka(pack.price) : '–'));
      }
      return row;
    });
    const body = $('#rates-body');
    body.replaceChildren(...rows);
    body.setAttribute('aria-busy', 'false');

    const latest = Math.max(0, ...catalogue.map((p) => p.updatedAt || 0));
    const stamp = $('#slip-date');
    if (latest > 0) {
      stamp.textContent = t('slip.updated', { date: FORMATS[lang].date.format(latest) });
      stamp.hidden = false;
      stamp.classList.add('is-set');
    } else {
      stamp.hidden = true;
    }
  }

  function pickFor(product) {
    let chosen = picks.get(product.id);
    if (!chosen || !product.packs.some((x) => x.kg === chosen.kg)) {
      chosen = { kg: product.packs[0].kg, qty: chosen ? chosen.qty : 1 };
      picks.set(product.id, chosen);
    }
    return chosen;
  }

  function fitName(text) {
    let count = text.length;
    try { count = [...new Intl.Segmenter('bn', { granularity: 'grapheme' }).segment(text)].length; } catch { /* older browsers */ }
    if (count > 9) return 'tight';
    if (count > 6) return 'medium';
    return null;
  }

  function renderShelf() {
    const grid = $('#shelf-grid');
    grid.replaceChildren(...catalogue.map(buildItem));
    grid.setAttribute('aria-busy', 'false');
  }

  function buildItem(product) {
    const node = $('#tpl-item').content.firstElementChild.cloneNode(true);
    const chosen = pickFor(product);
    node.id = 'chal-' + product.id;
    node.dataset.stock = product.inStock ? 'in' : 'out';

    // The sack is printed in Bangla whatever language the page is in.
    const printed = $('.bag__name', node);
    printed.textContent = product.short.bn;
    const fit = fitName(product.short.bn);
    if (fit) printed.dataset.fit = fit;
    $('.bag__process', node).textContent = product.process ? product.process.bn + ' চাল' : 'চাল';
    $('.bag__grade', node).textContent = product.grade ? product.grade.bn : '';
    $('.bag__tol', node).textContent = product.toleranceG ? '± ' + toBangla(product.toleranceG) + ' গ্রাম' : '';

    $('.buy__name', node).textContent = pick(product.name);
    const alt = $('.buy__alt', node);
    alt.textContent = other(product.name) === pick(product.name) ? '' : other(product.name);
    alt.lang = lang === 'bn' ? 'en' : 'bn';

    $('.seg legend', node).textContent = t('item.weight');
    const options = $('.seg__opts', node);
    for (const pack of product.packs) {
      const id = `kg-${product.id}-${pack.kg}`;
      const input = el('input', { type: 'radio', class: 'seg__input', name: 'kg-' + product.id, id, value: pack.kg, 'data-fk': id });
      input.checked = pack.kg === chosen.kg;
      input.addEventListener('change', () => { chosen.kg = pack.kg; paintItem(node, product); });
      options.append(input, el('label', { class: 'seg__label', for: id }, kgLabel(pack.kg)));
    }

    const qty = buildQty('shelf-' + product.id, chosen.qty, (value) => { chosen.qty = value; });
    $('.qty-slot', node).replaceWith(qty.root);

    const add = $('.add', node);
    add.dataset.fk = 'add-' + product.id;
    add.addEventListener('click', () => {
      addToOrder(product, chosen.kg, chosen.qty);
      chosen.qty = 1;
      qty.set(1);
    });

    paintItem(node, product);
    return node;
  }

  /** Updates the parts of a sack that depend on the chosen weight. */
  function paintItem(node, product) {
    const chosen = pickFor(product);
    const pack = product.packs.find((x) => x.kg === chosen.kg) || product.packs[0];
    const biggest = product.packs[product.packs.length - 1];
    node.dataset.size = product.packs.length > 1 && pack.kg !== biggest.kg ? 'small' : 'full';

    $('.bag__kg', node).textContent = toBangla(pack.kg);
    $('.price', node).textContent = taka(pack.price);
    $('.per', node).textContent = t('item.perkg', { price: taka(Math.round((pack.price / pack.kg) * 100) / 100) });

    const half = product.packs.find((x) => x.kg * 2 === pack.kg);
    const saved = half ? half.price * 2 - pack.price : 0;
    const save = $('.buy__save', node);
    save.hidden = saved <= 0;
    save.textContent = saved > 0 ? t('item.save', { kg: num(half.kg), amount: taka(saved) }) : '';

    const add = $('.add', node);
    add.disabled = !product.inStock;
    add.textContent = product.inStock ? t('item.add') : t('item.out');
  }

  /** A minus button, a number box and a plus button. Accepts Bangla or English digits. */
  function buildQty(mark, value, onChange, label) {
    const root = el('div', { class: 'qty' });
    const less = el('button', { type: 'button', class: 'qty__btn', 'aria-label': t('item.less'), 'data-fk': mark + '-less' });
    const more = el('button', { type: 'button', class: 'qty__btn', 'aria-label': t('item.more'), 'data-fk': mark + '-more' });
    const input = el('input', {
      class: 'qty__input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3',
      name: 'qty-' + mark, 'aria-label': label || t('item.qty'), 'data-fk': mark + '-n',
    });
    less.append(icon('minus'));
    more.append(icon('plus'));

    let current = clampQty(value);
    const paintButtons = () => {
      less.disabled = current <= 1;
      more.disabled = current >= SETTINGS.maxSacksPerLine;
    };
    const paint = () => { input.value = digits(current); paintButtons(); };
    const change = (next, tell) => {
      const safe = clampQty(next);
      const moved = safe !== current;
      current = safe;
      paint();
      if (moved && tell) onChange(current);
    };

    less.addEventListener('click', () => change(current - 1, true));
    more.addEventListener('click', () => change(current + 1, true));
    input.addEventListener('input', () => {
      const typed = parseInt(toAscii(input.value).replace(/\D/g, ''), 10);
      if (!Number.isFinite(typed) || typed < 1) return;      // wait for a usable number
      const safe = clampQty(typed);
      if (safe === current) return;
      current = safe;
      paintButtons();
      onChange(current);
    });
    input.addEventListener('blur', paint);
    input.addEventListener('focus', () => input.select());

    paint();
    root.append(less, input, more);
    return { root, set: (next) => change(next, false) };
  }

  /* ───────── 7. The order ───────── */

  const keyOf = (id, kg) => `${id}:${kg}`;

  function lookup(key) {
    const parts = /^([a-z0-9][a-z0-9-]{0,39}):(\d{1,3})$/.exec(key);
    if (!parts) return null;
    const product = byId.get(parts[1]);
    if (!product) return null;
    const pack = product.packs.find((x) => x.kg === Number(parts[2]));
    return pack ? { product, pack } : null;
  }

  // Only product ids and quantities are saved. Prices always come from the current price list.
  function saveCart() { remember('localStorage', CART_KEY, JSON.stringify([...cart])); }

  function loadCart() {
    cart.clear();
    let saved;
    try { saved = JSON.parse(recall('localStorage', CART_KEY) || '[]'); } catch { saved = []; }
    if (!Array.isArray(saved)) return;
    for (const entry of saved.slice(0, 100)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !lookup(entry[0])) continue;
      cart.set(entry[0], clampQty(entry[1]));
    }
  }

  function pruneCart() {
    let dropped = false;
    for (const key of [...cart.keys()]) {
      if (!lookup(key)) { cart.delete(key); dropped = true; }
    }
    if (dropped) saveCart();
  }

  function addToOrder(product, kg, qty) {
    if (!product.inStock) return;
    const key = keyOf(product.id, kg);
    cart.set(key, clampQty((cart.get(key) || 0) + qty));
    saveCart();
    closeMemo();
    renderOrder();
    bump();
    toast(t('toast.added', { sacks: sackCount(qty), name: pick(product.short), kg: kgLabel(kg) }));
  }

  function removeLine(key) {
    const found = lookup(key);
    const qty = cart.get(key);
    const order = [...cart.keys()];
    cart.delete(key);
    saveCart();
    closeMemo();
    renderOrder();
    $('#order-h').focus({ preventScroll: true });
    if (!found) return;
    toast(t('toast.removed', { name: pick(found.product.short), kg: kgLabel(found.pack.kg) }), {
      label: t('toast.undo'),
      run: () => {
        // Put the line back where it was.
        const now = new Map(cart);
        cart.clear();
        for (const k of order) {
          if (k === key) cart.set(key, qty); else if (now.has(k)) cart.set(k, now.get(k));
        }
        for (const [k, v] of now) if (!cart.has(k)) cart.set(k, v);
        saveCart();
        renderOrder();
      },
    });
  }

  function renderOrder() {
    const rows = [];
    for (const [key, qty] of cart) {
      const found = lookup(key);
      if (!found) continue;
      const { product, pack } = found;
      const name = pick(product.name);
      const weight = kgLabel(pack.kg);

      const row = el('li', { class: 'line' });
      const title = el('div', { class: 'line__name' });
      title.append(el('strong', null, name), el('span', null, `${weight}, ${t('order.each', { price: taka(pack.price) })}`));
      const sum = el('div', { class: 'line__sum' }, taka(pack.price * qty));

      const stepper = buildQty('line-' + key, qty, (value) => {
        cart.set(key, value);
        saveCart();
        closeMemo();
        sum.textContent = taka(pack.price * value);
        paintTotals();
      }, t('order.qtyfor', { name, kg: weight }));
      stepper.root.classList.add('line__qty');

      const remove = el('button', { type: 'button', class: 'line__del', 'aria-label': t('order.remove', { name, kg: weight }), 'data-fk': 'del-' + key });
      remove.append(icon('close'));
      remove.addEventListener('click', () => removeLine(key));

      row.append(title, stepper.root, sum, remove);
      rows.push(row);
    }
    $('#order-lines').replaceChildren(...rows);
    paintTotals();
  }

  function orderTotals() {
    let sacks = 0;
    let total = 0;
    for (const [key, qty] of cart) {
      const found = lookup(key);
      if (!found) continue;
      sacks += qty;
      total += found.pack.price * qty;
    }
    return { sacks, total };
  }

  function paintTotals() {
    const { sacks, total } = orderTotals();
    const has = sacks > 0;
    $('#order-empty').hidden = has;
    $('#order-total').hidden = !has;
    $('#order-note').hidden = !has;
    $('#order-sum').textContent = taka(total);

    const badge = $('#order-count');
    badge.hidden = !has;
    badge.textContent = sacks > 999 ? digits(999) + '+' : digits(sacks);
    $('#order-link').setAttribute('aria-label', has ? `${t('nav.order')}, ${sackCount(sacks)}` : t('nav.order'));

    $('#dock-text').textContent = t('dock.text', { sacks: sackCount(sacks), total: taka(total) });
    paintDock();
    if (has) setStatus(null);
  }

  function paintDock() {
    const show = orderTotals().sacks > 0 && !orderInView;
    $('#dock').dataset.show = String(show);
    document.body.classList.toggle('has-dock', show);
  }

  function bump() {
    const badge = $('#order-count');
    if (!badge.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    badge.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }

  /* ───────── 8. Messages ───────── */

  function toast(message, action) {
    const host = $('#toasts');
    const box = el('div', { class: 'toast' });
    box.append(el('span', null, message));
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      box.dataset.leaving = 'true';
      window.setTimeout(() => box.remove(), 450);
    };
    if (action) {
      const button = el('button', { type: 'button', class: 'toast__btn' }, action.label);
      button.addEventListener('click', () => { action.run(); close(); });
      box.append(button);
    }
    host.append(box);
    while (host.children.length > 3) host.firstElementChild.remove();
    window.setTimeout(close, action ? 7000 : 4000);
  }

  /* ───────── 9. The order form ───────── */

  const FIELDS = ['name', 'phone', 'address', 'note'];

  /** Makes typed text safe and tidy: one line, no control or direction-override characters, no angle brackets. */
  function tidy(value, max) {
    return String(value == null ? '' : value)
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F​‎‏‪-‮⁦-⁩]/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /** "+88 017-1234 5678" or "০১৭১২৩৪৫৬৭৮" → "01712345678" */
  function tidyPhone(value) {
    return toAscii(String(value == null ? '' : value)).replace(/[^\d+]/g, '').replace(/^\+?88(?=01)/, '').slice(0, 15);
  }

  function readForm() {
    const raw = (field) => $('#f-' + field).value;
    return {
      name: tidy(raw('name'), 60),
      phone: tidyPhone(raw('phone')),
      address: tidy(raw('address'), 200),
      note: tidy(raw('note'), 200),
      trap: $('#f-website').value,
    };
  }

  function checkForm(data) {
    const bad = {};
    if (!/^[\p{L}\p{M}‌‍ .'’-]{2,60}$/u.test(data.name)) bad.name = 'err.name';
    if (!/^01[3-9]\d{8}$/.test(data.phone)) bad.phone = 'err.phone';
    if ([...data.address].length < 10) bad.address = 'err.address';
    return bad;
  }

  function showErrors(bad, moveFocus) {
    shownErrors = bad;
    let first = null;
    for (const field of FIELDS) {
      const input = $('#f-' + field);
      const box = $('#err-' + field);
      if (bad[field]) {
        box.textContent = t(bad[field]);
        box.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        first = first || input;
      } else {
        box.textContent = '';
        box.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    }
    if (first && moveFocus) first.focus();
    return first;
  }

  function setStatus(key, vars) {
    const box = $('#form-status');
    if (!key) { box.hidden = true; box.textContent = ''; return; }
    box.textContent = t(key, vars);
    box.hidden = false;
  }

  function newReference() {
    const letters = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = new Uint8Array(5);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    let tail = '';
    for (const b of bytes) tail += letters[b % letters.length];
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SETTINGS.timeZone, year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type) => parts.find((x) => x.type === type).value;
    return `KM-${part('year')}${part('month')}${part('day')}-${tail}`;
  }

  /** The record that goes to the server, and from there to one Google Sheet row per line. */
  function buildOrder(customer) {
    const lines = [];
    for (const [key, qty] of cart) {
      const found = lookup(key);
      if (found) lines.push({ product_id: found.product.id, kg: found.pack.kg, qty, shown_unit_price: found.pack.price });
    }
    return {
      ref: newReference(),
      created_at: new Date().toISOString(),
      lang,
      customer: { name: customer.name, phone: customer.phone, address: customer.address, note: customer.note },
      items: lines,
      shown_total: orderTotals().total,   // what the customer saw; the server works out the real total itself
    };
  }

  async function submitOrder(order) {
    if (!SETTINGS.orderEndpoint) return { mode: 'preview' };
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), 15000);
    try {
      const reply = await fetch(SETTINGS.orderEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
        credentials: 'omit',
        cache: 'no-store',
        signal: stop.signal,
      });
      if (!reply.ok) throw new Error('order: HTTP ' + reply.status);
      return { mode: 'sent' };
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (sending) return;
    setStatus(null);

    const data = readForm();
    const first = showErrors(checkForm(data), false);
    if (!cart.size) {
      setStatus('err.empty');
      $('#form-status').focus();
      return;
    }
    if (first) { first.focus(); return; }

    // Three quiet checks against scripts that fill forms.
    if (data.trap) { setStatus('err.send'); return; }
    const startedAt = formTouchedAt || pageOpenedAt;
    if (Date.now() - startedAt < SETTINGS.minSecondsOnForm * 1000) { setStatus('err.fast'); return; }
    const lastOrderAt = Number(recall('sessionStorage', LAST_ORDER_KEY)) || 0;
    const wait = Math.ceil((lastOrderAt + SETTINGS.secondsBetweenOrders * 1000 - Date.now()) / 1000);
    if (wait > 0) { setStatus('err.limit', { s: digits(wait) }); return; }

    const button = $('#submit');
    sending = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = t('form.sending');
    try {
      const order = buildOrder(data);
      const result = await submitOrder(order);
      remember('sessionStorage', LAST_ORDER_KEY, String(Date.now()));
      openMemo(order, result.mode);
    } catch {
      setStatus('err.send');
    } finally {
      sending = false;
      button.removeAttribute('aria-busy');
      button.textContent = t('form.submit');
    }
  }

  /* ───────── 10. The memo shown after an order ───────── */

  function openMemo(order, mode) {
    memo = { order, mode };
    if (mode === 'sent') { cart.clear(); saveCart(); renderOrder(); }
    paintMemo();
    $('#order-form').hidden = true;
    $('#memo').hidden = false;
    $('#memo-h').focus();
  }

  function closeMemo() {
    if (!memo) return;
    memo = null;
    $('#memo').hidden = true;
    $('#order-form').hidden = false;
  }

  function memoLines() {
    return memo.order.items.map((item) => {
      const product = byId.get(item.product_id);
      const name = product ? pick(product.name) : item.product_id;
      return { label: `${name}, ${kgLabel(item.kg)} × ${digits(item.qty)}`, sum: taka(item.shown_unit_price * item.qty) };
    });
  }

  function memoFacts() {
    const { order } = memo;
    const facts = [
      [t('memo.ref'), order.ref],
      [t('memo.date'), FORMATS[lang].date.format(new Date(order.created_at))],
      [t('memo.name'), order.customer.name],
      [t('memo.phone'), order.customer.phone],
      [t('memo.address'), order.customer.address],
    ];
    if (order.customer.note) facts.push([t('memo.note'), order.customer.note]);
    return facts;
  }

  function paintMemo() {
    const state = $('#memo-state');
    state.dataset.mode = memo.mode;
    state.textContent = t(memo.mode === 'sent' ? 'memo.sent' : 'memo.preview');

    const facts = [];
    for (const [label, value] of memoFacts()) facts.push(el('dt', null, label), el('dd', null, value));
    $('#memo-facts').replaceChildren(...facts);

    $('#memo-lines').replaceChildren(...memoLines().map((line) => {
      const row = el('li');
      row.append(el('span', null, line.label), el('span', null, line.sum));
      return row;
    }));
    $('#memo-sum').textContent = taka(memo.order.shown_total);
  }

  function memoText() {
    const head = lang === 'bn' ? 'কর্ণমার্ট: অর্ডারের মেমো' : 'Kornomart: order memo';
    const facts = memoFacts().map(([label, value]) => `${label}: ${value}`);
    const lines = memoLines().map((line, i) => `${digits(i + 1)}. ${line.label} = ${line.sum}`);
    return [head, ...facts, '', ...lines, `${t('order.total')}: ${taka(memo.order.shown_total)}`].join('\n');
  }

  async function copyMemo() {
    if (!memo) return;
    try {
      await navigator.clipboard.writeText(memoText());
      toast(t('toast.copied'));
    } catch {
      toast(t('toast.copyfail'));
    }
  }

  function startNewOrder() {
    cart.clear();
    saveCart();
    closeMemo();
    $('#f-note').value = '';
    renderOrder();
    $('#order-h').focus();
  }

  /* ───────── 11. Language, contact details, start-up ───────── */

  function applyWords() {
    document.documentElement.lang = lang;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-i18n-ph]')) node.setAttribute('placeholder', t(node.dataset.i18nPh));
    for (const node of document.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
    const toggle = $('#lang-toggle');
    toggle.textContent = lang === 'bn' ? 'English' : 'বাংলা';
    toggle.lang = lang === 'bn' ? 'en' : 'bn';
  }

  function switchLanguage() {
    lang = lang === 'bn' ? 'en' : 'bn';
    remember('localStorage', LANG_KEY, lang);
    applyWords();
    setStatus(null);
    showErrors(shownErrors, false);
    if (catalogue.length) keepFocus(renderAll);
    else if (loadFailed) renderLoadError();
  }

  function renderContact() {
    const { phone, address } = SETTINGS.shop;
    const list = $('#foot-contact');
    const items = [];
    if (phone) {
      const item = el('li');
      item.append(el('a', { href: 'tel:' + phone.replace(/[^\d+]/g, '') }, phone));
      items.push(item);
    } else {
      items.push(el('li', { class: 'todo' }, t('foot.phone.todo')));
    }
    items.push(address ? el('li', null, address) : el('li', { class: 'todo' }, t('foot.address.todo')));
    list.replaceChildren(...items);
  }

  function start() {
    lang = recall('localStorage', LANG_KEY) === 'en' ? 'en' : 'bn';
    applyWords();
    renderContact();

    $('#lang-toggle').addEventListener('click', switchLanguage);
    $('#retry').addEventListener('click', refresh);
    $('#memo-copy').addEventListener('click', copyMemo);
    $('#memo-new').addEventListener('click', startNewOrder);

    const form = $('#order-form');
    form.addEventListener('submit', onSubmit);
    form.addEventListener('focusin', () => { if (!formTouchedAt) formTouchedAt = Date.now(); });
    for (const field of FIELDS) {
      $('#f-' + field).addEventListener('input', () => {
        if (!shownErrors[field]) return;
        const rest = { ...shownErrors };
        delete rest[field];
        showErrors(rest, false);
      });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        orderInView = entries[0].isIntersecting;
        paintDock();
      }, { threshold: 0.05 }).observe($('#order'));
    }

    refresh();
    window.setInterval(() => { if (!document.hidden) refresh(); }, SETTINGS.refreshEveryMs);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastFetchAt > 60000) refresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
