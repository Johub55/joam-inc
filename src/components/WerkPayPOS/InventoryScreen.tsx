import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { showToast } from '../../services/appToast';
import { InventoryItem } from '../../types';
import { 
  Boxes, 
  Plus, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  ShoppingCart,
  Zap,
  RotateCcw,
  X 
} from 'lucide-react';

export const InventoryScreen: React.FC = () => {
  const { 
    inventory, 
    buyInventory, 
    addInventoryItem, 
    totalExpenses, 
    orders 
  } = useApp();

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<number>(100);
  const [newItemMin, setNewItemMin] = useState<number>(20);
  const [newItemCost, setNewItemCost] = useState<number>(0.50);
  const [newItemUnit, setNewItemUnit] = useState<string>('stuks');
  const [newItemSupplier, setNewItemSupplier] = useState<string>('HAVI Logistics');

  // Stats calculation
  const totalStockValue = inventory.reduce((sum, item) => sum + item.stock_qty * item.cost_price, 0);
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);
  const estimatedNetProfit = Math.max(0, totalRevenue - totalExpenses);

  const lowStockItems = inventory.filter(i => i.stock_qty <= i.min_qty);

  const handleAutoReorderAllLow = () => {
    if (lowStockItems.length === 0) {
      showToast('Geen artikelen onder de minimale voorraadgrens!', 'info');
      return;
    }
    let reorderedCount = 0;
    lowStockItems.forEach(item => {
      const needed = Math.max(20, (item.min_qty * 2) - item.stock_qty);
      buyInventory(item.id, needed);
      reorderedCount++;
    });
    showToast(`⚡ Automatisch ${reorderedCount} lage voorraad artikelen bijbesteld!`, 'success');
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      showToast('Voer een naam in voor de grondstof.', 'warning');
      return;
    }
    addInventoryItem({
      item_name: newItemName.trim(),
      stock_qty: newItemQty,
      min_qty: newItemMin,
      cost_price: newItemCost,
      unit: newItemUnit,
      supplier_name: newItemSupplier
    });
    setShowAddModal(false);
    setNewItemName('');
    showToast(` Grondstof '${newItemName.trim()}' toegevoegd aan voorraad!`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Boxes className="w-6 h-6 text-amber-400" />
            <span>Voorraad, Inkoop &amp; Magazijnwaarde</span>
          </h1>
          <p className="text-xs text-slate-400">
            Houd broodjes, vlees, friet en sauzen bij. Inkoop wordt direct verrekend met je nettowinst.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lowStockItems.length > 0 && (
            <button
              onClick={handleAutoReorderAllLow}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg transition animate-pulse"
              title="Aanvullen tot veilige voorraad"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>Auto-Bijbestellen ({lowStockItems.length} tekorten)</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nieuwe Grondstof Toevoegen</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-rose-400 font-bold uppercase tracking-wider block">
            Totale Inkoopkosten
          </span>
          <div className="text-2xl font-black text-rose-400 mt-1">
            {euro(totalExpenses)}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Kosten aan leveranciers</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-cyan-400 font-bold uppercase tracking-wider block">
            Huidige Magazijnwaarde
          </span>
          <div className="text-2xl font-black text-cyan-400 mt-1">
            {euro(totalStockValue)}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Voorraadwaarde in schap</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider block">
            Geraamde Nettowinst
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {euro(estimatedNetProfit)}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Omzet min inkoop</span>
        </div>
      </div>

      {/* Inventory Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <span>📦 Voorraadlijst &amp; Bijbestellen</span>
          </h2>
          <span className="text-xs text-slate-400">{inventory.length} artikelen geregistreerd</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="p-3.5">Grondstof / Item</th>
                <th className="p-3.5">Voorraad</th>
                <th className="p-3.5">Min. Limiet</th>
                <th className="p-3.5">Inkoopprijs</th>
                <th className="p-3.5">Waarde</th>
                <th className="p-3.5">Leverancier</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Bijbestellen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {inventory.map(item => {
                const isLow = item.stock_qty <= item.min_qty;
                const itemTotal = item.stock_qty * item.cost_price;

                return (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-bold text-white">{item.item_name}</td>
                    <td className="p-3.5">
                      <span className={`font-black text-sm ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {item.stock_qty} {item.unit}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400">{item.min_qty} {item.unit}</td>
                    <td className="p-3.5 font-mono">{euro(item.cost_price)}</td>
                    <td className="p-3.5 font-bold text-slate-200">{euro(itemTotal)}</td>
                    <td className="p-3.5 text-slate-400">{item.supplier_name || 'HAVI'}</td>
                    <td className="p-3.5">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" /> Bijna op
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Voldoende
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => buyInventory(item.id, 10)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                          title={`Koop 10 ${item.unit} voor ${euro(item.cost_price * 10)}`}
                        >
                          +10 ({euro(item.cost_price * 10)})
                        </button>
                        <button
                          onClick={() => buyInventory(item.id, 50)}
                          className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-500 text-white transition shadow"
                          title={`Koop 50 ${item.unit} voor ${euro(item.cost_price * 50)}`}
                        >
                          +50 ({euro(item.cost_price * 50)})
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Inventory Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">➕ Nieuwe Grondstof Toevoegen</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Itemnaam</label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="bv. WerkMac Saus Jerrycan"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Aantal op voorraad</label>
                  <input
                    type="number"
                    value={newItemQty}
                    onChange={e => setNewItemQty(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Minimale voorraadgrens</label>
                  <input
                    type="number"
                    value={newItemMin}
                    onChange={e => setNewItemMin(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Inkoopprijs per eenheid (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItemCost}
                    onChange={e => setNewItemCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Eenheid</label>
                  <select
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="stuks">Stuks</option>
                    <option value="dozen">Dozen</option>
                    <option value="liters">Liters</option>
                    <option value="kg">Kg</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Leverancier</label>
                <input
                  type="text"
                  value={newItemSupplier}
                  onChange={e => setNewItemSupplier(e.target.value)}
                  placeholder="bv. HAVI Logistics"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 text-slate-300"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold bg-amber-400 hover:bg-amber-300 text-slate-950"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
