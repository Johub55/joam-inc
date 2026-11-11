import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { generateGiftCardCode } from '../../services/discountService';
import { showToast } from '../../services/appToast';
import { 
  Gift, 
  X, 
  Sparkles, 
  CreditCard, 
  Check, 
  Copy, 
  Send, 
  QrCode, 
  ShoppingBag, 
  Plus, 
  HeartHandshake,
  Search,
  Receipt
} from 'lucide-react';

interface GiftCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GiftCardModal: React.FC<GiftCardModalProps> = ({ isOpen, onClose }) => {
  const { giftCards, createGiftCard, topUpGiftCard, currentBankAccount, user, posUsers } = useApp();

  const [activeTab, setActiveTab] = useState<'order' | 'check' | 'all'>('order');
  const [selectedAmount, setSelectedAmount] = useState<number>(25);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [senderName, setSenderName] = useState<string>(user?.name || currentBankAccount?.account_holder || 'Werkdonalds Vriend');
  const [message, setMessage] = useState<string>('Eet smakelijk bij Werkdonalds! 🍔🍟');
  const [cardDesign, setCardDesign] = useState<'gold' | 'neon' | 'classic'>('gold');

  const [createdCard, setCreatedCard] = useState<{
    code: string;
    amount: number;
    recipient: string;
    sender: string;
    message: string;
  } | null>(null);

  const [searchCode, setSearchCode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleOrderGiftCard = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (isNaN(finalAmount) || finalAmount < 5) {
      showToast('Minimale cadeaukaart waarde is € 5,00', 'warning');
      return;
    }

    const newCode = generateGiftCardCode();
    createGiftCard(newCode, finalAmount);

    setCreatedCard({
      code: newCode,
      amount: finalAmount,
      recipient: recipientName.trim() || 'Lover of Burgers',
      sender: senderName.trim() || 'Werkdonalds Fan',
      message: message.trim()
    });

    AudioFX.success();
    showToast(`🎁 Cadeaukaart ${newCode} van ${euro(finalAmount)} succesvol geactiveerd!`, 'success');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Code gekopieerd naar klembord!', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const foundCard = giftCards.find(g => g.code.toUpperCase() === searchCode.trim().toUpperCase());

  return (
    <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-5 shadow-2xl relative max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center text-2xl font-black shadow-lg shadow-amber-500/20">
              🎁
            </div>
            <div>
              <h2 className="font-black text-lg text-white uppercase tracking-tight flex items-center gap-2">
                <span>Werkdonalds Cadeaukaart</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                  GIFT CARDS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Bestel of check digitale cadeaukaarten voor vrienden & collega’s
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold gap-1">
          <button
            type="button"
            onClick={() => { setActiveTab('order'); setCreatedCard(null); }}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1 transition ${
              activeTab === 'order' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Bestellen</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('check')}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1 transition ${
              activeTab === 'check' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Check Saldo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1 transition ${
              activeTab === 'all' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Alle Cards &amp; Privé ({giftCards.length})</span>
          </button>
        </div>

        {/* 1. ORDER TAB */}
        {activeTab === 'order' && !createdCard && (
          <form onSubmit={handleOrderGiftCard} className="space-y-4">
            
            {/* Amount Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Kies Cadeaukaart Waarde:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 75].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                    className={`py-2.5 rounded-xl font-black text-sm border transition ${
                      selectedAmount === amt && !customAmount
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {euro(amt)}
                  </button>
                ))}
              </div>

              <div className="mt-2.5">
                <input
                  type="number"
                  placeholder="Of typ eigen bedrag (€)..."
                  value={customAmount}
                  onChange={e => {
                    setCustomAmount(e.target.value);
                    if (e.target.value) setSelectedAmount(parseFloat(e.target.value) || 0);
                  }}
                  min="5"
                  max="500"
                  step="0.5"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Recipient & Sender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Voor wie is het? (Ontvanger)</label>
                <input
                  type="text"
                  placeholder="Bijv. Lucas de Jong"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Van wie? (Afzender)</label>
                <input
                  type="text"
                  placeholder="Jouw naam"
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Personal Message */}
            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-300">Persoonlijk Berichtje:</label>
              <input
                type="text"
                placeholder="Bijv. Gefeliciteerd met je verjaardag! 🍔"
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Visual Preview */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 text-slate-950 shadow-xl space-y-3 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80 block">
                    Werkdonalds Gift Card
                  </span>
                  <span className="text-xl font-black font-mono">
                    {euro(customAmount ? parseFloat(customAmount) || 0 : selectedAmount)}
                  </span>
                </div>
                <span className="text-2xl">🍔</span>
              </div>

              <div className="text-xs font-semibold">
                <p className="line-clamp-1 italic">"{message || 'Geniet van heerlijke gerechten!'}"</p>
                <p className="text-[11px] opacity-80 mt-1">Voor: {recipientName || 'Klant'}</p>
              </div>

              <div className="pt-2 border-t border-slate-950/20 flex justify-between items-center text-[10px] font-mono font-bold opacity-75">
                <span>Direct inwisselbaar aan de kassa & kiosk</span>
                <span>⭐⭐⭐⭐⭐</span>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-400/20 active:scale-95 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Cadeaukaart Activeren &amp; Bestellen ({euro(customAmount ? parseFloat(customAmount) || 0 : selectedAmount)})</span>
            </button>
          </form>
        )}

        {/* 2. ORDER CONFIRMATION / CREATED CARD */}
        {activeTab === 'order' && createdCard && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-6 rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 text-slate-950 shadow-2xl space-y-4 text-center">
              <span className="text-4xl">🎉</span>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">
                  Cadeaukaart Klaar voor Gebruik!
                </h3>
                <p className="text-xs font-semibold text-slate-900 mt-0.5">
                  Waarde: <strong className="text-lg">{euro(createdCard.amount)}</strong>
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 text-white rounded-2xl border-2 border-slate-900 font-mono text-center space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Jouw Cadeaukaart Code</span>
                <span className="text-xl font-black text-amber-300 tracking-wider">
                  {createdCard.code}
                </span>
              </div>

              <p className="text-xs text-slate-900 italic">
                "{createdCard.message}" — Van {createdCard.sender}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCopy(createdCard.code)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Gekopieerd!' : 'Code Kopiëren'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setCreatedCard(null); setRecipientName(''); }}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition"
              >
                Nog een bestellen
              </button>
            </div>
          </div>
        )}

        {/* 3. CHECK SALDO TAB */}
        {activeTab === 'check' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">
                Voer Cadeaukaart Code in:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Bijv. GC-8932-XXXX"
                  value={searchCode}
                  onChange={e => setSearchCode(e.target.value.toUpperCase())}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {foundCard ? (
              <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/50 space-y-3 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Actieve Cadeaukaart
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                    {foundCard.code}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-400">Beschikbaar Saldo:</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {euro(foundCard.current_balance)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between">
                  <span>Oorspronkelijk bedrag: {euro(foundCard.initial_balance)}</span>
                  <span>Status: {foundCard.is_active ? 'Geldig' : 'Inactief'}</span>
                </div>
              </div>
            ) : searchCode.trim() ? (
              <div className="p-4 rounded-2xl bg-slate-950 border border-rose-500/30 text-center text-xs text-slate-400 space-y-1">
                <p className="text-rose-400 font-bold">Geen actieve cadeaukaart gevonden met deze code.</p>
                <p className="text-[11px] text-slate-500">Controleer de code op typefouten.</p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400 space-y-1">
                <p>Vul de code van de cadeaukaart in om het actuele saldo te controleren.</p>
              </div>
            )}
          </div>
        )}

        {/* 4. ALLE CARDS & PRIVÉ TAB */}
        {activeTab === 'all' && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Overzicht Huidige Cadeaukaarten</span>
              <span className="text-slate-400 font-mono text-[11px]">{giftCards.length} Kaarten Totaal</span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {giftCards.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-2xl border border-slate-800">
                  Nog geen cadeaukaarten aanwezig. Maak er een aan via 'Bestellen'.
                </div>
              ) : (
                giftCards.map(card => {
                  const isPriv = card.is_private || card.notes?.includes('Privé') || card.code.startsWith('PRV');
                  return (
                    <div key={card.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-amber-300 text-sm">{card.code}</span>
                          {isPriv && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              🔒 Privé Card
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopy(card.code)}
                            className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                          >
                            [Kopieer Code]
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Huidig Saldo: <strong className="text-emerald-400 font-extrabold">{euro(card.current_balance)}</strong> (Start: {euro(card.initial_balance)})
                        </div>
                        {(card.recipient_name || card.sender_name) && (
                          <div className="text-[10px] text-slate-500 italic">
                            Aan: {card.recipient_name || 'Klant'} {card.sender_name ? `• Van: ${card.sender_name}` : ''}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => topUpGiftCard(card.id, 10)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs"
                          title="Saldo +€10"
                        >
                          +€10
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
