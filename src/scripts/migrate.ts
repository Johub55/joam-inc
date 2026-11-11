import { createClient } from '@supabase/supabase-js';
import { db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { DEFAULT_SUPABASE_POS_URL, DEFAULT_SUPABASE_POS_KEY } from '../services/store';

const supabase = createClient(DEFAULT_SUPABASE_POS_URL, DEFAULT_SUPABASE_POS_KEY);

async function migrate() {
    console.log('Starting migration from Supabase to Firestore...');

    try {
        // 1. Migrate Products
        const { data: products, error: productsError } = await supabase.from('products').select('*');
        if (productsError) console.error('Error fetching products:', productsError);
        else if (products) {
            for (const p of products) {
                await setDoc(doc(db, 'products', String(p.id)), p);
            }
            console.log(`Migrated ${products.length} products`);
        }

        // 2. Migrate Orders
        const { data: orders, error: ordersError } = await supabase.from('orders').select('*');
        if (ordersError) console.error('Error fetching orders:', ordersError);
        else if (orders) {
            for (const o of orders) {
                await setDoc(doc(db, 'orders', String(o.id || o.no)), o);
            }
            console.log(`Migrated ${orders.length} orders`);
        }

        // 3. Migrate Bank Accounts
        const { data: bankAccounts, error: bankError } = await supabase.from('bank_accounts').select('*');
        if (bankError) console.error('Error fetching bank accounts:', bankError);
        else if (bankAccounts) {
            for (const b of bankAccounts) {
                await setDoc(doc(db, 'bank_accounts', String(b.id)), b);
            }
            console.log(`Migrated ${bankAccounts.length} bank accounts`);
        }

        // 4. Migrate POS Users
        const { data: posUsers, error: usersError } = await supabase.from('pos_users').select('*');
        if (usersError) console.error('Error fetching pos users:', usersError);
        else if (posUsers) {
            for (const u of posUsers) {
                await setDoc(doc(db, 'pos_users', String(u.id)), u);
            }
            console.log(`Migrated ${posUsers.length} pos users`);
        }
    
        // 5. Migrate Inventory
        const { data: inventory, error: invError } = await supabase.from('inventory').select('*');
        if (invError) console.error('Error fetching inventory:', invError);
        else if (inventory) {
            for (const i of inventory) {
                await setDoc(doc(db, 'inventory', String(i.id)), i);
            }
            console.log(`Migrated ${inventory.length} inventory items`);
        }

        // 6. Migrate Coupons
        const { data: coupons, error: coupError } = await supabase.from('coupons').select('*');
        if (coupError) console.error('Error fetching coupons:', coupError);
        else if (coupons) {
            for (const c of coupons) {
                await setDoc(doc(db, 'coupons', String(c.id)), c);
            }
            console.log(`Migrated ${coupons.length} coupons`);
        }

        // 7. Migrate Gift Cards
        const { data: giftCards, error: gcError } = await supabase.from('gift_cards').select('*');
        if (gcError) console.error('Error fetching gift cards:', gcError);
        else if (giftCards) {
            for (const g of giftCards) {
                await setDoc(doc(db, 'gift_cards', String(g.id)), g);
            }
            console.log(`Migrated ${giftCards.length} gift cards`);
        }

        // 8. Migrate Bank Transactions
        const { data: txs, error: txError } = await supabase.from('bank_transactions').select('*');
        if (txError) console.error('Error fetching transactions:', txError);
        else if (txs) {
            for (const t of txs) {
                await setDoc(doc(db, 'bank_transactions', String(t.id)), t);
            }
            console.log(`Migrated ${txs.length} transactions`);
        }
        
        console.log('Migration completed successfully.');

    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
