import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, formatCardUid, isVirtualCardNumber, parseLinkedUids, accountMatchesUid, normalizeCardUid } from '../../services/store';
import { BankAccount } from '../../types';
import { showToast } from '../../services/appToast';
import { 
  ShieldCheck, 
  Search, 
  Plus, 
  Edit, 
  Sparkles, 
  Trash2, 
  Coins, 
  X,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Radio,
  Tag
} from 'lucide-react';
import { LinkCardModal } from '../WerkPayPOS/LinkCardModal';
import { UidManagerPanel } from '../WerkPayPOS/UidManagerPanel';


export const ManagerAccountsScreen: React.FC = () => {
  const { 
    bankAccounts, 
    saveBankAccount, 
    deleteBankAccount,
    quickMoneyAccount, 
    currentBankAccount 
  } = useApp();

  const [search, setSearch] = useState<string>('');
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [showPairingModal, setShowPairingModal] = useState<boolean>(false);
  const [pairingAcc, setPairingAcc] = useState<BankAccount | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [activeSubView, setActiveSubView] = useState<'accounts' | 'uids'>('accounts');
  const [revealedPins, setRevealedPins] = useState<Record<string | number, boolean>>({});
  const [showEditSecrets, setShowEditSecrets] = useState<boolean>(false);

  const toggleRevealPin = (id: string | number) => {
    setRevealedPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // New account form
  const [newUsername, setNewUsername] = useState<string>('');
  const [newHolder, setNewHolder] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('1234');
  const [newPin, setNewPin] = useState<string>('1234');
  const [newBalance, setNewBalance] = useState<string>('25.00');
  const [newIsAdmin, setNewIsAdmin] = useState<boolean>(false);

  const filteredAccounts = bankAccounts.filter(a => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      a.username.toLowerCase().includes(q) ||
      a.account_holder.toLowerCase().includes(q) ||
      a.card_uid.replace(/\s+/g, '').toLowerCase().includes(q.replace(/\s+/g, '')) ||
      accountMatchesUid(a, search) ||
      parseLinkedUids(a.linked_uids || []).some(t => (t.label || '').toLowerCase().includes(q))
    );
  });

  const totalAccounts = bankAccounts.length;
  const adminCount = bankAccounts.filter(a => a.is_admin).length;
  const totalBalances = bankAccounts.filter(a => !a.is_admin).reduce((s, a) => s + a.balance, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newHolder.trim()) {
      showToast('Vul gebruikersnaam en kaarthouder in.', 'warning');
      return;
    }
    
    // Generate random 16-digit card UID
    const r1 = Math.floor(1000 + Math.random() * 9000);
    const r2 = Math.floor(1000 + Math.random() * 9000);
    const r3 = Math.floor(1000 + Math.random() * 9000);
    const r4 = Math.floor(1000 + Math.random() * 9000);
    const generatedUid = `${r1} ${r2} ${r3} ${r4}`;

    await saveBankAccount({
      username: newUsername.trim(),
      account_holder: newHolder.trim(),
      password: newPassword,
      pin_code: newPin,
      balance: parseFloat(newBalance) || 0,
      is_admin: newIsAdmin,
      card_uid: generatedUid
    });

    setShowCreateModal(false);
    setNewUsername('');
    setNewHolder('');
    setNewBalance('25.00');
    setNewIsAdmin(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc) return;
    await saveBankAccount(editingAcc);
    setEditingAcc(null);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
            <span>WerkPay Bankrekeningen &amp; Beheer</span>
          </h1>
          <p className="text-xs text-slate-400">
            Overzicht van alle geregistreerde WerkPay betaalpassen, pincodes, saldi en God Mode privileges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveSubView('accounts')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeSubView === 'accounts'
                  ? 'bg-cyan-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bankrekeningen
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('uids')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                activeSubView === 'uids'
                  ? 'bg-purple-500 text-white font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Gekoppelde UID&apos;s Beheren</span>
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nieuwe Bankrekening Openen</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
            Totaal Accounts
          </span>
          <div className="text-2xl font-black text-white mt-1">{totalAccounts}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">
            Beheerders (God Mode)
          </span>
          <div className="text-2xl font-black text-amber-400 mt-1">{adminCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider block">
            Totaal Klantsaldo
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{euro(totalBalances)}</div>
        </div>
      </div>

      {/* Search & List OR UID Manager */}
      {activeSubView === 'uids' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <UidManagerPanel />
        </div>
      ) : (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek op naam, gebruikersnaam of UID..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filteredAccounts.length} accounts gevonden
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="p-3.5">Kaarthouder</th>
                <th className="p-3.5">Gebruikersnaam</th>
                <th className="p-3.5">Kaart-UID</th>
                <th className="p-3.5">Pincode</th>
                <th className="p-3.5">Saldo</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Snelknoppen &amp; Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAccounts.map(acc => (
                <tr key={acc.id} className="hover:bg-slate-800/40 transition">
                  <td className="p-3.5 font-bold text-white flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-black text-xs">
                      {acc.account_holder[0]}
                    </div>
                    <span>{acc.account_holder}</span>
                  </td>
                  <td className="p-3.5 font-mono text-cyan-300">@{acc.username}</td>
                  <td className="p-3.5 font-mono text-slate-300">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          !isVirtualCardNumber(acc.card_uid) && normalizeCardUid(acc.card_uid)
                            ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold'
                            : 'text-slate-400'
                        }`}
                      >
                        {!isVirtualCardNumber(acc.card_uid) && normalizeCardUid(acc.card_uid)
                          ? normalizeCardUid(acc.card_uid)
                          : formatCardUid(acc.card_uid)}
                      </span>
                      {parseLinkedUids(acc.linked_uids || []).map(tag => (
                        <span
                          key={tag.uid}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]"
                          title={tag.label || 'Extra NFC Tag'}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag.label ? `${tag.label}: ` : ''}{tag.uid}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 font-mono text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>{revealedPins[acc.id] ? (acc.pin_code || '1234') : '••••'}</span>
                      <button
                        type="button"
                        onClick={() => toggleRevealPin(acc.id)}
                        className="text-slate-500 hover:text-cyan-400 p-0.5 rounded transition"
                        title={revealedPins[acc.id] ? "Pincode verbergen" : "Pincode tonen (Beheerder)"}
                      >
                        {revealedPins[acc.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="p-3.5">
                    <span className={`font-black text-sm ${acc.is_admin ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {acc.is_admin ? '€ ∞' : euro(acc.balance)}
                    </span>
                  </td>
                  <td className="p-3.5">
                    {acc.is_admin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
                        <Sparkles className="w-3 h-3" /> GOD MODE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                        Klant
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => { setPairingAcc(acc); setShowPairingModal(true); }}
                        className="px-2 py-1 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30"
                      >
                        Koppel NFC
                      </button>
                      {!acc.is_admin && (
                        <>
                          <button
                            onClick={() => quickMoneyAccount(acc.id, 10)}
                            className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                          >
                            + €10
                          </button>
                          <button
                            onClick={() => quickMoneyAccount(acc.id, -10)}
                            className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30"
                          >
                            - €10
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setEditingAcc({ ...acc })}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Bewerken"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Weet je zeker dat je de bankrekening van ${acc.account_holder} (@${acc.username}) wilt verwijderen?`)) {
                            deleteBankAccount(acc.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-400 hover:text-rose-200 border border-slate-800 hover:border-rose-800 transition"
                        title="Verwijder account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* MODAL: Create New Bank Account */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">➕ Nieuwe WerkPay Bankrekening</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Volledige Naam Rekeninghouder</label>
                <input
                  type="text"
                  required
                  value={newHolder}
                  onChange={e => setNewHolder(e.target.value)}
                  placeholder="bv. Thomas Jansen"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Gebruikersnaam</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="thomas"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Startsaldo (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newBalance}
                    onChange={e => setNewBalance(e.target.value)}
                    placeholder="25.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Wachtwoord</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Pincode (4 cijfers)</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsAdmin}
                  onChange={e => setNewIsAdmin(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-400"
                />
                <span className="font-bold text-slate-300">
                  ✨ Beheerder / God Mode (Oneindig saldo)
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 text-slate-300"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                >
                  Rekening Openen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Bank Account */}
      {editingAcc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">✏️ Rekening Bewerken</h3>
              <button onClick={() => setEditingAcc(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Naam Rekeninghouder</label>
                <input
                  type="text"
                  required
                  value={editingAcc.account_holder}
                  onChange={e => setEditingAcc({ ...editingAcc, account_holder: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Gebruikersnaam</label>
                  <input
                    type="text"
                    required
                    value={editingAcc.username}
                    onChange={e => setEditingAcc({ ...editingAcc, username: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Saldo (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingAcc.balance}
                    onChange={e => setEditingAcc({ ...editingAcc, balance: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Kaart-UID</label>
                <input
                  type="text"
                  value={editingAcc.card_uid}
                  onChange={e => setEditingAcc({ ...editingAcc, card_uid: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-400 font-bold block">Wachtwoord</label>
                    <button
                      type="button"
                      onClick={() => setShowEditSecrets(!showEditSecrets)}
                      className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      {showEditSecrets ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                      <span>{showEditSecrets ? 'Verberg' : 'Toon'}</span>
                    </button>
                  </div>
                  <input
                    type={showEditSecrets ? "text" : "password"}
                    value={editingAcc.password || ''}
                    onChange={e => setEditingAcc({ ...editingAcc, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Pincode</label>
                  <input
                    type={showEditSecrets ? "text" : "password"}
                    value={editingAcc.pin_code || ''}
                    onChange={e => setEditingAcc({ ...editingAcc, pin_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAcc.is_admin}
                  onChange={e => setEditingAcc({ ...editingAcc, is_admin: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-400"
                />
                <span className="font-bold text-slate-300">
                  ✨ Beheerder / God Mode (Oneindig saldo)
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAcc(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 text-slate-300"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                >
                  Wijzigingen Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NFC Pairing */}
      {showPairingModal && pairingAcc && (
        <LinkCardModal 
          onClose={() => setShowPairingModal(false)}
          username={pairingAcc.username}
        />
      )}

    </div>
  );
};
