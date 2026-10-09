// Home: today's sales, how customers paid, expenses and what sells best. Everything is computed from saved records.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtQty, fmtTime, localDate, today, round2 } from '../core/utils.js';
import { cur } from '../core/views.js';
import { pref } from '../core/settings.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import { loadStarterMenu, emojiFor, payIcon } from '../services/starter.js';
import { celebrate } from '../core/fx.js';

const $ = window.jQuery;
const WEEKDAY = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });

// Today's figures plus the last 7 days of sales. Voided sales and expenses are excluded.
export async function todayFigures() {
  const day = today();
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(localDate(d)); }
  const week = IDBKeyRange.bound(days[0], day);
  const [sales, items, vouchers, entries, accounts] = await Promise.all([
    idb.getAllByIndex('sales', 'date', week),
    idb.getAllByIndex('saleItems', 'date', week),
    idb.getAllByIndex('vouchers', 'date', IDBKeyRange.only(day)),
    idb.getAllByIndex('entries', 'date', IDBKeyRange.only(day)),
    idb.getAll('accounts'),
  ]);
  const live = sales.filter((s) => s.status !== 'void');
  const todays = live.filter((s) => s.date === day).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todayIds = new Set(todays.map((s) => s.id));
  const sumTotal = (list) => round2(list.reduce((s, d) => s + d.total, 0));

  const byDay = days.map((d) => { const list = live.filter((s) => s.date === d); return { date: d, total: sumTotal(list), count: list.length }; });

  // Money in per payment account, from today's sale entries (voids delete their entries, so these are live only).
  const payAccts = accounts.filter((a) => ['cash', 'bank'].includes(a.type) && a.active)
    .sort((a, b) => (a.type === 'cash' ? -1 : b.type === 'cash' ? 1 : a.name.localeCompare(b.name)));
  const received = new Map(payAccts.map((a) => [a.id, 0]));
  for (const e of entries) if (e.refType === 'sale' && received.has(e.accountId)) received.set(e.accountId, received.get(e.accountId) + e.debit - e.credit);

  const expenses = vouchers.filter((v) => v.type === 'payment' && v.counterType === 'expense' && v.status !== 'void');
  const spent = sumTotal(expenses.map((e) => ({ total: e.amount })));

  const top = new Map();
  for (const i of items) {
    if (!todayIds.has(i.saleId)) continue;
    const category = Catalog.category(Catalog.product(i.productId)?.categoryId)?.name;
    const x = top.get(i.productId) || { name: i.name, category, qty: 0, amount: 0 };
    x.qty += i.qty; x.amount += i.amount; top.set(i.productId, x);
  }

  return {
    sales: sumTotal(todays), count: todays.length, recent: todays.slice(0, 5),
    payAccts: payAccts.map((a) => ({ id: a.id, name: a.name, type: a.type, amount: round2(received.get(a.id) || 0) })),
    spent, net: round2(sumTotal(todays) - spent), expenseCount: expenses.length,
    week: byDay, weekTotal: sumTotal(live.filter((s) => s.date >= days[0])),
    top: [...top.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5),
  };
}

const home = {
  async render(el) {
    this.destroy();
    const $el = $(el);
    $el.html(UI.spinner());
    const u = Auth.user();
    const f = await todayFigures();
    const lastBackup = pref.get('lastBackupAt');
    const hasMenu = Catalog.allProducts().length > 0;
    const backupDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000) : null;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const maxDay = Math.max(1, ...f.week.map((d) => d.total));
    const maxTop = f.top[0]?.qty || 1;
    const tile = (href, icon, cls, title, sub, perm) => (perm && !Auth.can(perm) ? '' : `<div class="col-6 col-md-4 col-xl-2"><a class="hub-tile ${cls}" href="${href}">
      <div class="hub-ico"><i class="bi bi-${icon}"></i></div><div class="min-w-0"><div class="t">${title}</div><div class="s">${sub}</div></div></a></div>`);

    $el.html(`
      <section class="hero-card home-hero">
        <div class="home-hero-top">
          <div>
            <div class="hello">${greet}${u?.name ? `, ${esc(u.name.split(' ')[0])}` : ''} 🍦</div>
            <div class="date">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          </div>
          <span class="pill"><i class="bi bi-${navigator.onLine ? 'cloud-check' : 'wifi-off'}"></i>${navigator.onLine ? 'Online' : 'Offline'}</span>
        </div>
        <div class="lbl">Today's sales</div>
        <div class="big money" data-count="${f.sales}" data-money="1">0</div>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-3">
          <span class="pill"><i class="bi bi-receipt"></i>${f.count} bill${f.count === 1 ? '' : 's'}</span>
          <span class="pill"><i class="bi bi-wallet2"></i>Expenses ${esc(cur())} ${fmtNum(f.spent)}</span>
          <span class="pill ${f.net < 0 ? 'pill-neg' : ''}"><i class="bi bi-piggy-bank"></i>Left over ${esc(cur())} ${fmtNum(f.net)}</span>
        </div>
        ${Auth.can('sale.create') ? `<a class="btn hero-sell" href="#/pos"><span class="hero-sell-ico"><i class="bi bi-cup-straw"></i></span><span class="flex-grow-1 text-start"><span class="d-block fw-bold fs-5">Sell now</span><span class="d-block small opacity-75">Tap flavours, take the money, done</span></span><i class="bi bi-arrow-right-circle fs-3"></i></a>` : ''}
      </section>

      ${!hasMenu ? `<div class="setup-card card mt-3">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div class="setup-ico">🍨</div>
          <div class="flex-grow-1 min-w-0"><div class="fw-bold">Set up your ice cream menu in one tap</div>
            <div class="small text-body-secondary">Adds cups, cones, shakes, kulfi, falooda, toppings and expense types. Change any name or price later.</div></div>
          ${Auth.can('product.edit') ? '<button class="btn btn-primary btn-starter"><i class="bi bi-magic me-1"></i>Load starter menu</button>' : ''}
        </div>
      </div>` : ''}

      ${!navigator.onLine ? '<div class="alert alert-secondary py-2 small mt-3"><i class="bi bi-wifi-off me-1"></i>You are offline. Everything you do is saved on this device.</div>' : ''}
      ${Auth.can('backup.export') && (backupDays === null || backupDays >= 7) ? `<div class="alert alert-warning py-2 small d-flex align-items-center gap-2 mt-3"><i class="bi bi-shield-exclamation"></i><div class="flex-grow-1">${backupDays === null ? 'No backup has been made on this device yet.' : `Last backup was ${backupDays} days ago.`} Your data only lives on this device.</div><a class="btn btn-sm btn-warning" href="#/backup">Back up</a></div>` : ''}

      <div class="section-title"><h2>How customers paid today</h2></div>
      <div class="pay-grid stagger">
        ${f.payAccts.map((a) => `<div class="pay-card ${a.type === 'cash' ? 'is-cash' : 'is-wallet'}">
          <div class="pay-ico"><i class="bi bi-${payIcon(a)}"></i></div>
          <div class="min-w-0"><div class="l">${esc(a.name)}</div><div class="v money" data-count="${a.amount}" data-money="1">0</div></div>
        </div>`).join('') || UI.emptyState('No payment accounts yet', 'bank')}
      </div>

      <div class="section-title"><h2>Quick actions</h2></div>
      <div class="row g-2 stagger">
        ${tile('#/pos', 'cup-straw', 'c-pink', 'Sell', 'New bill', 'sale.create')}
        ${tile('#/expenses', 'wallet2', 'c-mint', 'Add expense', `${f.expenseCount} today`, 'account.manage')}
        ${tile('#/sales', 'receipt', 'c-violet', 'Bills', 'Past sales & reprint')}
        ${tile('#/products', 'card-list', 'c-amber', 'Menu & Prices', `${Catalog.allProducts().filter((p) => p.active).length} items`)}
        ${tile('#/reports', 'bar-chart-line', 'c-sky', 'Reports', 'Sales, expenses, profit', 'reports.view')}
        ${tile('#/backup', 'cloud-arrow-down', 'c-slate', 'Backup', backupDays === null ? 'Not backed up yet' : `Last ${backupDays}d ago`, 'backup.export')}
      </div>

      <div class="row g-3 mt-1">
        <div class="col-lg-7"><div class="card viz-card h-100">
          <div class="viz-head"><div><div class="ttl">Last 7 days</div><div class="sub">${esc(cur())} ${fmtNum(f.weekTotal)} in total</div></div></div>
          <div class="bars" role="img" aria-label="Sales for the last 7 days">
            ${f.week.map((d, i) => `<div class="bar-col ${d.date === today() ? 'is-today' : ''}" style="--d:${i * 70}ms" title="${esc(d.date)}: ${esc(cur())} ${fmtNum(d.total)} · ${d.count} bills">
              <div class="bar-val">${d.total ? fmtNum(d.total) : ''}</div>
              <div class="bar-track"><div class="bar-fill" style="height:${Math.max(d.total ? 6 : 2, (d.total / maxDay) * 100)}%"></div></div>
              <div class="bar-lbl">${esc(WEEKDAY(d.date))}</div>
            </div>`).join('')}
          </div>
        </div></div>
        <div class="col-lg-5"><div class="card viz-card h-100">
          <div class="viz-head"><div><div class="ttl">Best sellers today</div><div class="sub">By number of cups, cones and more</div></div></div>
          ${f.top.length ? f.top.map((p, i) => `<div class="hbar" style="--d:${i * 80}ms">
              <div class="name"><span class="rank">${emojiFor(p.category)}</span>${esc(p.name)}</div>
              <div class="amt">${fmtQty(p.qty)}×</div>
              <div class="track"><div class="fill" style="width:${Math.max(4, (p.qty / maxTop) * 100)}%"></div></div>
            </div>`).join('') : UI.emptyState('No sales yet today. Your best sellers will appear here.', 'cup-straw')}
        </div></div>
      </div>

      <div class="row g-3 mt-1">
        <div class="col-md-12"><div class="section-title mt-0"><h2>Latest bills</h2><a href="#/sales">View all</a></div>
          <div class="list-card">${f.recent.map((s) => `<a class="list-row" href="#/sales/${encodeURIComponent(s.id)}">
              <div class="bill-ico"><i class="bi bi-receipt"></i></div>
              <div class="main"><div class="title">${esc(s.customerName || 'Walk-in Customer')}</div><div class="sub">${esc(s.number)} · ${esc(fmtTime(s.createdAt))}</div></div>
              <div class="end"><div class="fw-bold money">${fmtNum(s.total)}</div></div></a>`).join('') || UI.emptyState('No bills yet today', 'receipt')}
          </div>
        </div>
      </div>`);

    UI.countUp(el, (v, node) => (node.dataset.money ? `${cur()} ${fmtNum(v)}` : String(Math.round(v))));

    $el.on('click', '.btn-starter', async function () {
      const $b = $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Adding…');
      try {
        const r = await loadStarterMenu();
        celebrate();
        UI.toast(`Menu ready: ${r.addedProducts} items and ${r.addedAccounts} accounts added`);
        await home.render(el);
      } catch (err) {
        UI.toastError(err);
        $b.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Load starter menu');
      }
    });
    // Keep the numbers live when a sale, expense or purchase is saved while this page is open.
    this._h = () => { if (location.hash === '' || location.hash.startsWith('#/dashboard')) home.render(el); };
    document.addEventListener('data:changed', this._h);
  },
  destroy() {
    if (this._h) document.removeEventListener('data:changed', this._h);
    this._h = null;
  },
};

export default home;
