import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BankAccount, LinkedNfcTag } from '../../types';
import {
  formatCardUid,
  generateVirtualCardUid,
  isVirtualCardNumber,
  normalizeCardUid,
  parseLinkedUids,
} from '../../services/store';
import { showToast } from '../../services/appToast';
import { LinkCardModal } from './LinkCardModal';
import {
  CreditCard,
  Radio,
  Search,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  Tag,
  Unlink,
  ShieldCheck,
  Save,
  X,
} from 'lucide-react';

interface ManagedIdentity {
  username: string;
  displayName: string;
  hasBank: boolean;
  hasPos: boolean;
  bankAccount?: BankAccount;
  isAdmin: boolean;
}

export const UidManagerPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { bankAccounts, posUsers, saveBankAccount } = useApp();

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'physical' | 'virtual'>('all');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Pico W scanning modal state
  const [scanTarget, setScanTarget] = useState<{ username: string; mode: 'primary' | 'extra' } | null>(null);

  // Manual edit / add modal state
  const [editingIdentity, setEditingIdentity] = useState<ManagedIdentity | null>(null);
  const [editPrimaryUid, setEditPrimaryUid] = useState('');
  const [editExtraUid, setEditExtraUid] = useState('');
  const [editExtraLabel, setEditExtraLabel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const identities: ManagedIdentity[] = useMemo(() => {
    const map = new Map<string, ManagedIdentity>();

    for (const acc of bankAccounts) {
      const key = acc.username.trim().toLowerCase();
      map.set(key, {
        username: acc.username,
        displayName: acc.account_holder || acc.username,
        hasBank: true,
        hasPos: false,
        bankAccount: {
          ...acc,
          linked_uids: parseLinkedUids(acc.linked_uids || []),
        },
        isAdmin: Boolean(acc.is_admin),
      });
    }

    for (const pu of posUsers) {
      const key = pu.username.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.hasPos = true;
        existing.isAdmin = existing.isAdmin || Boolean(pu.is_admin);
      } else {
        map.set(key, {
          username: pu.username,
          displayName: pu.name || pu.username,
          hasBank: false,
          hasPos: true,
          isAdmin: Boolean(pu.is_admin),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aPhys = a.bankAccount && !isVirtualCardNumber(a.bankAccount.card_uid) ? 1 : 0;
      const bPhys = b.bankAccount && !isVirtualCardNumber(b.bankAccount.card_uid) ? 1 : 0;
      if (aPhys !== bPhys) return bPhys - aPhys;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [bankAccounts, posUsers]);

  const stats = useMemo(() => {
    let physicalPrimary = 0;
    let extraCount = 0;
    for (const item of identities) {
      if (!item.bankAccount) continue;
      if (!isVirtualCardNumber(item.bankAccount.card_uid) && normalizeCardUid(item.bankAccount.card_uid)) {
        physicalPrimary++;
      }
      extraCount += (item.bankAccount.linked_uids || []).length;
    }
    return {
      physicalPrimary,
      extraCount,
      totalPhysical: physicalPrimary + extraCount,
      totalAccounts: identities.length,
    };
  }, [identities]);

  const filteredIdentities = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qClean = normalizeCardUid(search);

    return identities.filter((item) => {
      const prim = item.bankAccount?.card_uid || '';
      const hasPhysical =
        Boolean(item.bankAccount) &&
        ((Boolean(normalizeCardUid(prim)) && !isVirtualCardNumber(prim)) ||
          (item.bankAccount?.linked_uids || []).length > 0);

      if (filterMode === 'physical' && !hasPhysical) return false;
      if (filterMode === 'virtual' && hasPhysical) return false;

      if (!q) return true;
      if (item.displayName.toLowerCase().includes(q) || item.username.toLowerCase().includes(q)) {
        return true;
      }
      if (qClean && normalizeCardUid(prim).includes(qClean)) return true;
      return (item.bankAccount?.linked_uids || []).some(
        (t) => t.uid.includes(qClean) || (t.label || '').toLowerCase().includes(q)
      );
    });
  }, [identities, search, filterMode]);

  const handleCopy = (uid: string) => {
    const clean = normalizeCardUid(uid);
    try {
      navigator.clipboard?.writeText(clean);
    } catch {}
    setCopiedUid(clean);
    setTimeout(() => setCopiedUid(null), 1600);
  };

  const handleUnlinkPrimary = async (item: ManagedIdentity) => {
    if (!item.bankAccount) return;
    const oldUid = item.bankAccount.card_uid;
    const extras = parseLinkedUids(item.bankAccount.linked_uids || []);
    // Als er nog een extra tag is, maak die niet zomaar hoofd; zet hoofdpas terug naar unieke virtuele pas
    const freshVirtual = generateVirtualCardUid();
    const res = await saveBankAccount({
      ...item.bankAccount,
      card_uid: freshVirtual,
      linked_uids: extras,
    });
    if (res.success) {
      showToast(`Fysieke UID ${oldUid} losgekoppeld van @${item.username}.`, 'info');
    }
  };

  const handleRemoveExtraTag = async (item: ManagedIdentity, uidToRemove: string) => {
    if (!item.bankAccount) return;
    const nextExtras = parseLinkedUids(item.bankAccount.linked_uids || []).filter(
      (t) => t.uid !== uidToRemove
    );
    const res = await saveBankAccount({
      ...item.bankAccount,
      linked_uids: nextExtras,
    });
    if (res.success) {
      showToast(`Extra tag ${uidToRemove} verwijderd bij @${item.username}.`, 'info');
    }
  };

  const openManualEdit = (item: ManagedIdentity) => {
    setEditingIdentity(item);
    setEditPrimaryUid(item.bankAccount?.card_uid || '');
    setEditExtraUid('');
    setEditExtraLabel('');
  };

  const handleSaveManualEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIdentity) return;

    setSavingEdit(true);
    const cleanPrimary = editPrimaryUid.trim()
      ? isVirtualCardNumber(editPrimaryUid)
        ? normalizeCardUid(editPrimaryUid).replace(/(.{4})/g, '$1 ').trim()
        : normalizeCardUid(editPrimaryUid)
      : generateVirtualCardUid();

    const existingExtras: LinkedNfcTag[] = parseLinkedUids(
      editingIdentity.bankAccount?.linked_uids || []
    );
    const cleanExtra = normalizeCardUid(editExtraUid);
    const nextExtras = cleanExtra
      ? [
          ...existingExtras.filter((t) => t.uid !== cleanExtra),
          {
            uid: cleanExtra,
            label: editExtraLabel.trim() || 'Extra NFC Tag',
            linkedAt: new Date().toISOString(),
          },
        ]
      : existingExtras;

    let res: { success: boolean; message?: string };
    if (editingIdentity.bankAccount) {
      res = await saveBankAccount({
        ...editingIdentity.bankAccount,
        card_uid: cleanPrimary,
        linked_uids: nextExtras.filter((t) => t.uid !== normalizeCardUid(cleanPrimary)),
      });
    } else {
      res = await saveBankAccount({
        username: editingIdentity.username.trim().toLowerCase(),
        account_holder: editingIdentity.displayName,
        card_uid: cleanPrimary,
        linked_uids: nextExtras.filter((t) => t.uid !== normalizeCardUid(cleanPrimary)),
        pin_code: '1234',
        balance: 0,
        is_admin: editingIdentity.isAdmin,
      });
    }

    setSavingEdit(false);
    if (res.success) {
      showToast(`UID-instellingen voor @${editingIdentity.username} opgeslagen!`, 'success');
      setEditingIdentity(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Overzicht */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Fysieke Hoofdpassen
          </div>
          <div className="text-xl font-black text-purple-400 mt-0.5">{stats.physicalPrimary}</div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Extra Gekoppelde Tags
          </div>
          <div className="text-xl font-black text-cyan-400 mt-0.5">{stats.extraCount}</div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Totaal Fysieke UID&apos;s
          </div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">{stats.totalPhysical}</div>
        </div>
      </div>

      {/* Zoek & Filterbalk */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam, @gebruikersnaam, UID of tag-naam..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg transition ${
              filterMode === 'all' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Alle ({identities.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('physical')}
            className={`px-2.5 py-1 rounded-lg transition ${
              filterMode === 'physical' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Met NFC
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('virtual')}
            className={`px-2.5 py-1 rounded-lg transition ${
              filterMode === 'virtual' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Zonder NFC
          </button>
        </div>
      </div>

      {/* Lijst van accounts en gekoppelde UID's */}
      <div className={`space-y-2.5 ${compact ? 'max-h-[420px] overflow-y-auto pr-1' : ''}`}>
        {filteredIdentities.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-xl">
            Geen accounts of gekoppelde UID&apos;s gevonden voor deze zoekopdracht.
          </div>
        ) : (
          filteredIdentities.map((item) => {
            const primUid = item.bankAccount?.card_uid || '';
            const primClean = normalizeCardUid(primUid);
            const hasPhysicalPrim = Boolean(primClean) && !isVirtualCardNumber(primClean);
            const extras = parseLinkedUids(item.bankAccount?.linked_uids || []);

            return (
              <div
                key={item.username.toLowerCase()}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center font-black text-xs shrink-0">
                      {item.displayName[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {item.displayName}
                        </span>
                        <span className="text-[11px] font-mono text-cyan-400">@{item.username}</span>
                        {item.hasPos && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                            POS
                          </span>
                        )}
                        {item.hasBank && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 font-bold">
                            WerkPay
                          </span>
                        )}
                        {item.isAdmin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold inline-flex items-center gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actieknoppen */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setScanTarget({ username: item.username, mode: 'primary' })}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-purple-600 hover:bg-purple-500 text-white inline-flex items-center gap-1 transition"
                    >
                      <Radio className="w-3 h-3" />
                      <span>{hasPhysicalPrim ? 'Pas Vervangen' : 'Scan NFC'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScanTarget({ username: item.username, mode: 'extra' })}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 inline-flex items-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Extra Tag</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openManualEdit(item)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 transition"
                      title="Handmatig UID invoeren of bewerken"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Bewerk UID</span>
                    </button>

                    {hasPhysicalPrim && (
                      <button
                        type="button"
                        onClick={() => handleUnlinkPrimary(item)}
                        className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1 transition"
                        title="Fysieke hoofdpas loskoppelen"
                      >
                        <Unlink className="w-3 h-3" />
                        <span>Ontkoppel</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* UID Overzicht per account */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-900 text-[11px]">
                  {item.bankAccount ? (
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono ${
                        hasPhysicalPrim
                          ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <CreditCard className="w-3 h-3 shrink-0" />
                      <span className="font-sans font-bold text-[10px] uppercase opacity-75">
                        {hasPhysicalPrim ? 'NFC Hoofdpas:' : 'Virtueel:'}
                      </span>
                      <span className="font-bold">
                        {hasPhysicalPrim ? primClean : formatCardUid(primUid)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(primClean)}
                        className="ml-0.5 text-slate-400 hover:text-white transition"
                        title="Kopieer UID"
                      >
                        {copiedUid === primClean ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      Nog geen WerkPay/NFC record — klik op Scan NFC of Bewerk UID om direct een pas te koppelen.
                    </span>
                  )}

                  {extras.map((tag) => (
                    <div
                      key={tag.uid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-cyan-950/30 border-cyan-500/40 text-cyan-200 font-mono"
                    >
                      <Tag className="w-3 h-3 text-cyan-400 shrink-0" />
                      {tag.label && (
                        <span className="font-sans font-bold text-[10px] text-cyan-300">
                          {tag.label}:
                        </span>
                      )}
                      <span className="font-bold">{tag.uid}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(tag.uid)}
                        className="text-cyan-400 hover:text-white transition"
                        title="Kopieer UID"
                      >
                        {copiedUid === tag.uid ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExtraTag(item, tag.uid)}
                        className="text-rose-400 hover:text-rose-200 transition ml-0.5"
                        title="Verwijder gekoppelde tag"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Live NFC Scan via Pico W */}
      {scanTarget && (
        <LinkCardModal
          username={scanTarget.username}
          defaultMode={scanTarget.mode}
          onClose={() => setScanTarget(null)}
        />
      )}

      {/* Modal: Handmatig UID Bewerken / Extra Tag Toevoegen */}
      {editingIdentity && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-black text-base">✏️ UID&apos;s Beheren</h3>
                <p className="text-xs text-slate-400">
                  {editingIdentity.displayName} (<span className="font-mono text-cyan-400">@{editingIdentity.username}</span>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingIdentity(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Hoofd Kaart-UID (leeglaten = nieuw virtueel nummer)
                </label>
                <input
                  type="text"
                  value={editPrimaryUid}
                  onChange={(e) => setEditPrimaryUid(e.target.value.toUpperCase())}
                  placeholder="bijv. 04A1B2C3 of 4000 1234 5678 9012"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-400"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Tip: als deze UID al op een ander account stond, wordt hij automatisch netjes overgezet.
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Extra NFC Tag toevoegen (optioneel)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editExtraUid}
                    onChange={(e) => setEditExtraUid(e.target.value.toUpperCase())}
                    placeholder="UID (bijv. A3F91204)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <input
                    type="text"
                    value={editExtraLabel}
                    onChange={(e) => setEditExtraLabel(e.target.value)}
                    placeholder="Label (bijv. Sleutelhanger)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingIdentity(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl font-black bg-purple-600 hover:bg-purple-500 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingEdit ? 'Opslaan...' : 'Opslaan in Database'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
