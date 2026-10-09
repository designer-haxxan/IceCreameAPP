// Expenses: everyday shop costs (milk, gas, rent, salaries…) paid from cash, JazzCash, EasyPaisa or bank.
// Each expense is a payment voucher posted to the ledger, so the Cash Book and Reports include it.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtTime, fmtDate, today, monthStart, uuid, num, round2, AppError } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { celebrate, pulse } from '../core/fx.js';
import * as Auth from '../services/auth.js';
import * as Posting from '../services/posting.js';
import { payIcon } from '../services/starter.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;
let $root = null; let period = 'today';

// Icon for each starter expense category; anything the owner adds gets a generic receipt icon.
const EXPENSE_ICON = {
  'Milk & Cream': 'droplet', 'Sugar & Flavours': 'cup', 'Ice & Packing': 'snow', 'Gas / LPG': 'fire',
  'Electricity & Water': 'lightning-charge', Rent: 'house-door', 'Staff Salary': 'person-badge', Transport: 'truck', 'Repairs & Cleaning': 'tools',
};
const iconFor = (name) => EXPENSE_ICON[name] || 'receipt';

async function loadData() {
  const from = period === 'month' ? monthStart(today()) : today();
  const range = IDBKeyRange.bound(from, today());
  const [vouchers, sales, accounts] = await Promise.all([
    idb.getAllByIndex('vouchers', 'date', range),
    idb.getAllByIndex('sales', 'date', range),
    idb.getAll('accounts'),
  ]);
  const names = new Map(accounts.map((a) => [a.id, a]));
  const expenses = vouchers
    .filter((v) => v.type === 'payment' && v.counterType === 'expense' && v.status !== 'void')
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const byCategory = new Map();
  for (const e of expenses) byCategory.set(e.counterAccountId, (byCategory.get(e.counterAccountId) || 0) + e.amount);
  const categories = [...byCategory.entries()].map(([id, amount]) => ({ id, name: names.get(id)?.name || 'Expense', amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
  const spent = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const sold = round2(sales.filter((s) => s.status !== 'void').reduce((s, d) => s + d.total, 0));
  return { expenses, categories, spent, sold, net: round2(sold - spent), names };
}

async function render() {
  if (!$root) return;
  const d = await loadData();
  const canVoid = Auth.can('voucher.void');
  const label = period === 'month' ? 'this month' : 'today';
  const maxCat = d.categories[0]?.amount || 1;
  $root.html(`
    <div class="exp-hero">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <div class="exp-kicker"><i class="bi bi-wallet2 me-1"></i>Expenses ${esc(label)}</div>
          <div class="exp-total money" data-count="${d.spent}" data-money="1">0</div>
        </div>
        <div class="seg" role="tablist" aria-label="Period">
          <button class="seg-btn ${period === 'today' ? 'active' : ''}" data-period="today" role="tab" aria-selected="${period === 'today'}">Today</button>
          <button class="seg-btn ${period === 'month' ? 'active' : ''}" data-period="month" role="tab" aria-selected="${period === 'month'}">This month</button>
        </div>
      </div>
      <div class="exp-kpis">
        <div class="kpi-mini"><span>Sales ${esc(label)}</span><b class="money">${esc(cur())} ${fmtNum(d.sold)}</b></div>
        <div class="kpi-mini"><span>Expenses</span><b class="money">${esc(cur())} ${fmtNum(d.spent)}</b></div>
        <div class="kpi-mini ${d.net < 0 ? 'neg' : 'pos'}"><span>Left over</span><b class="money">${esc(cur())} ${fmtNum(d.net)}</b></div>
      </div>
      <button class="btn exp-add btn-add-exp"><i class="bi bi-plus-circle-fill me-2"></i>Add expense</button>
    </div>

    <div class="section-title"><h2>Where the money went</h2></div>
    <div class="card viz-card">
      ${d.categories.length ? d.categories.map((c, i) => `<div class="hbar" style="--d:${i * 60}ms">
        <div class="name"><i class="bi bi-${iconFor(c.name)} me-2"></i>${esc(c.name)}</div>
        <div class="amt money">${fmtNum(c.amount)}</div>
        <div class="track"><div class="fill" style="width:${Math.max(4, (c.amount / maxCat) * 100)}%"></div></div>
      </div>`).join('') : UI.emptyState(`No expenses ${label}. Tap “Add expense” when you buy something.`, 'wallet2')}
    </div>

    <div class="section-title"><h2>Expense list</h2></div>
    <div class="list-card">
      ${d.expenses.map((e) => `<div class="list-row exp-row">
        <div class="exp-ico"><i class="bi bi-${iconFor(e.counterName)}"></i></div>
        <div class="main"><div class="title">${esc(e.counterName)}</div>
          <div class="sub">${esc(fmtDate(e.date))} · ${esc(fmtTime(e.createdAt))} · ${esc(e.accountName)}${e.note ? ` · ${esc(e.note)}` : ''}</div></div>
        <div class="end"><div class="fw-bold money">${fmtNum(e.amount)}</div>
          ${canVoid ? `<button class="btn btn-sm btn-link text-danger p-0 btn-void" data-id="${esc(e.id)}" aria-label="Remove expense"><i class="bi bi-x-circle"></i> Remove</button>` : ''}</div>
      </div>`).join('') || UI.emptyState('Nothing here yet', 'receipt')}
    </div>`);
  UI.countUp($root[0], (v, node) => (node.dataset.money ? `${cur()} ${fmtNum(v)}` : String(Math.round(v))));
}

// Chip-style category picker, payment-source buttons, amount, date and note.
async function addExpense() {
  Auth.require('account.manage');
  const accounts = await idb.getAll('accounts');
  // Only shop costs: the system "Purchases" and "Purchase Returns" accounts are posted by the Stock module, not by hand.
  const expenseAccts = accounts.filter((a) => a.type === 'expense' && a.active && (!a.system || a.id === 'expense'))
    .sort((a, b) => (a.id === 'expense' ? 1 : b.id === 'expense' ? -1 : a.name.localeCompare(b.name)));
  const payAccts = accounts.filter((a) => ['cash', 'bank'].includes(a.type) && a.active)
    .sort((a, b) => (a.type === 'cash' ? -1 : b.type === 'cash' ? 1 : a.name.localeCompare(b.name)));
  if (!expenseAccts.length) throw new AppError('Add an expense category under Cash & Banks first.');
  if (!payAccts.length) throw new AppError('Add a cash or wallet account first.');
  const pickCat = (a) => `<button type="button" class="cat-pick" data-id="${esc(a.id)}"><i class="bi bi-${iconFor(a.name)}"></i><span>${esc(a.name)}</span></button>`;
  const r = await UI.formModal({
    title: 'Add expense', submitLabel: 'Save expense', submitClass: 'btn-primary btn-lg',
    body: `
      <label class="form-label fw-semibold">What did you pay for?</label>
      <div class="cat-grid mb-3">${expenseAccts.map(pickCat).join('')}<button type="button" class="cat-pick cat-new"><i class="bi bi-plus-lg"></i><span>New type</span></button></div>
      <input type="hidden" name="counterAccountId" value="${esc(expenseAccts[0].id)}">

      <label class="form-label fw-semibold">Amount (${esc(cur())})</label>
      <input name="amount" class="form-control form-control-lg exp-amount money mb-3" inputmode="decimal" placeholder="0" autocomplete="off">

      <label class="form-label fw-semibold">Paid from</label>
      <div class="pay-methods mb-3">${payAccts.map((a, i) => `<button type="button" class="pay-method ${i === 0 ? 'active' : ''}" data-acc="${esc(a.id)}" aria-pressed="${i === 0}"><i class="bi bi-${payIcon(a)}"></i><span>${esc(a.name)}</span></button>`).join('')}</div>
      <input type="hidden" name="accountId" value="${esc(payAccts[0].id)}">

      <div class="row g-2">
        <div class="col-6"><label class="form-label">Date</label><input type="date" name="date" class="form-control" value="${today()}" max="${today()}"></div>
        <div class="col-6"><label class="form-label">Note (optional)</label><input name="note" class="form-control" maxlength="200" placeholder="e.g. 5 litres milk"></div>
      </div>`,
    onShown: ($m) => {
      $m.on('click', '.cat-pick:not(.cat-new)', function () {
        $m.find('.cat-pick').removeClass('active'); $(this).addClass('active');
        $m.find('[name=counterAccountId]').val(this.dataset.id); pulse(this);
      });
      $m.on('click', '.cat-new', async function () {
        const name = (window.prompt('Name of the new expense (for example: Ice cubes)') || '').trim();
        if (!name) return;
        try {
          const acc = await Posting.saveAccount({ name, type: 'expense' });
          const $btn = $(pickCat({ id: acc.id, name: acc.name }));
          $btn.insertBefore(this);
          $m.find('.cat-pick').removeClass('active'); $btn.addClass('active');
          $m.find('[name=counterAccountId]').val(acc.id);
        } catch (err) { UI.toast(err.message || String(err), 'danger'); }
      });
      $m.on('click', '.pay-method', function () {
        $m.find('.pay-method').removeClass('active').attr('aria-pressed', 'false');
        $(this).addClass('active').attr('aria-pressed', 'true');
        $m.find('[name=accountId]').val(this.dataset.acc); pulse(this);
      });
      setTimeout(() => $m.find('.exp-amount').trigger('focus'), 150);
    },
    onSubmit: async (v) => {
      const amount = round2(num(v.amount));
      if (!(amount > 0)) throw new AppError('Type the amount you paid.');
      await Posting.saveVoucher({
        id: uuid(), type: 'payment', date: v.date || today(), amount,
        accountId: v.accountId, counterAccountId: v.counterAccountId, note: (v.note || '').trim(),
      });
      return { amount };
    },
  });
  if (r) { celebrate(24); UI.toast(`Expense saved: ${cur()} ${fmtNum(r.amount)}`); }
  return !!r;
}

export default {
  async render(el) {
    $root = $(el);
    $root.html(UI.spinner());
    await render();
    $root.on('click', '[data-period]', function () { period = this.dataset.period; render(); });
    $root.on('click', '.btn-add-exp', async () => { try { if (await addExpense()) await render(); } catch (err) { UI.toastError(err); } });
    $root.on('click', '.btn-void', async function () {
      if (!await UI.confirmDialog('Remove this expense? It will be cancelled in the Cash Book and Reports.', { okLabel: 'Remove', okClass: 'btn-danger' })) return;
      try { await Posting.voidDocument('voucher', this.dataset.id, 'Entered by mistake'); UI.toast('Expense removed'); await render(); } catch (err) { UI.toastError(err); }
    });
    this._h = () => { if (location.hash.startsWith('#/expenses')) render(); };
    document.addEventListener('data:changed', this._h);
  },
  destroy() {
    if (this._h) document.removeEventListener('data:changed', this._h);
    this._h = null; $root?.off(); $root = null;
  },
};
