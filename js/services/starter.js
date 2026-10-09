// Starter ice cream menu, expense categories and payment accounts. Idempotent: anything whose name already
// exists is skipped, so loading it again never changes existing menu items, prices or accounts.
import * as idb from '../db/idb.js';
import { lc } from '../core/utils.js';
import * as Catalog from './catalog.js';
import * as Posting from './posting.js';

// Sample prices in Rs. Owners change them under Menu & Prices.
export const STARTER_MENU = [
  { cat: 'Cups', emoji: '🍨', items: [['Vanilla Cup', 150], ['Chocolate Cup', 150], ['Strawberry Cup', 150], ['Mango Cup', 160], ['Pistachio Cup', 180], ['Butterscotch Cup', 170]] },
  { cat: 'Cones', emoji: '🍦', items: [['Vanilla Cone', 100], ['Chocolate Cone', 100], ['Strawberry Cone', 100], ['Double Scoop Cone', 180]] },
  { cat: 'Sundaes', emoji: '🍧', items: [['Chocolate Sundae', 300], ['Mango Sundae', 320], ['Brownie Sundae', 380]] },
  { cat: 'Shakes', emoji: '🥤', items: [['Chocolate Shake', 250], ['Strawberry Shake', 250], ['Mango Shake', 250], ['Oreo Shake', 300]] },
  { cat: 'Kulfi & Falooda', emoji: '🍮', items: [['Malai Kulfi', 100], ['Pista Kulfi', 120], ['Matka Kulfi', 150], ['Falooda', 220], ['Rabri Falooda', 280]] },
  { cat: 'Toppings', emoji: '🍫', items: [['Brownie Piece', 100], ['Chocolate Syrup', 50], ['Nuts Topping', 60], ['Sprinkles', 30], ['Extra Scoop', 80]] },
  { cat: 'Family Tubs', emoji: '🧊', items: [['Vanilla 1 L Tub', 900], ['Chocolate 1 L Tub', 900], ['Strawberry 1 L Tub', 900]] },
];

// Expense categories are accounts of type "expense", so every expense is posted to the ledger.
export const STARTER_EXPENSES = ['Milk & Cream', 'Sugar & Flavours', 'Ice & Packing', 'Gas / LPG', 'Electricity & Water', 'Rent', 'Staff Salary', 'Transport', 'Repairs & Cleaning'];
// Where money is received or paid from. "bank" covers wallets and bank accounts.
export const STARTER_PAYMENTS = [{ name: 'JazzCash', type: 'bank' }, { name: 'EasyPaisa', type: 'bank' }, { name: 'Bank Account', type: 'bank' }];

// Icon for a payment account: phone wallets get a phone icon, cash a stack of notes, banks a bank.
export const payIcon = (a) => (a.type === 'cash' ? 'cash-stack' : /jazz|easy|wallet/i.test(a.name) ? 'phone' : 'bank');

export const emojiFor = (catName) => STARTER_MENU.find((m) => lc(m.cat) === lc(catName))?.emoji || '🍨';

export async function loadStarterMenu() {
  const categories = Catalog.allCategories();
  const products = new Set(Catalog.allProducts().map((p) => lc(p.name)));
  const accounts = new Set((await idb.getAll('accounts')).map((a) => lc(a.name)));
  let addedProducts = 0; let addedAccounts = 0;

  for (const group of STARTER_MENU) {
    let cat = categories.find((c) => lc(c.name) === lc(group.cat));
    if (!cat) {
      const id = await Posting.saveCategory({ name: group.cat });
      cat = { id, name: group.cat };
      categories.push(cat);
    }
    for (const [name, price] of group.items) {
      if (products.has(lc(name))) continue;
      await Posting.saveProduct({ name, categoryId: cat.id, unit: 'serving', salePrice: price, wholesalePrice: 0, purchasePrice: 0, trackStock: false });
      products.add(lc(name)); addedProducts++;
    }
  }
  for (const name of STARTER_EXPENSES) {
    if (accounts.has(lc(name))) continue;
    await Posting.saveAccount({ name, type: 'expense' }); accounts.add(lc(name)); addedAccounts++;
  }
  for (const acc of STARTER_PAYMENTS) {
    if (accounts.has(lc(acc.name))) continue;
    await Posting.saveAccount({ name: acc.name, type: acc.type }); accounts.add(lc(acc.name)); addedAccounts++;
  }
  await Catalog.load();
  return { addedProducts, addedAccounts };
}
