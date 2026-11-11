import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { 
  getStatusMeta, 
  isOrderReady, 
  isOrderFinished, 
  parseKitchenNotes 
} from '../../services/orderStatus';
import { 
  Clock, 
  CheckCircle2, 
  Flame, 
  PackageCheck, 
  Utensils, 
  BellRing, 
  X, 
  Receipt,
  Sparkles,
  ChefHat,
  Tv,
  CreditCard,
  ArrowRight
} from 'lucide-react';

export const OrderTrackingModal: React.FC = () => {
  const { 
    trackedOrderNo, 
    setTrackedOrderNo, 
    orders, 
    setActiveReceiptOrder,
    setAppMode,
    setPosScreen,
    currentBankAccount,
    getUserOrders,
    updateOrderStatus
  } = useApp();

  const [hasPlayedChime, setHasPlayedChime] = useState<boolean>(false);

  // Find the tracked order from the live orders array
  const order = orders.find(o => o.no === trackedOrderNo);
  const myOrders = getUserOrders();

  // Trigger sound when status changes to ready/done
  useEffect(() => {
    if (order && isOrderReady(order.status) && !hasPlayedChime) {
      AudioFX.bell();
      setHasPlayedChime(true);
    }
  }, [order?.status, hasPlayedChime]);

  // Reset chime trigger if order changes
  useEffect(() => {
    setHasPlayedChime(false);
  }, [trackedOrderNo]);

  if (!trackedOrderNo) return null;

  // Graceful fallback if order is not loaded yet
  if (!order) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-black">
            🍔
          </div>
          <h2 className="text-lg font-black text-white">Bestelling #{trackedOrderNo}</h2>
          <p className="text-xs text-slate-400">
            Deze bestelling wordt gesynchroniseerd of kon niet direct worden gevonden in het actieve systeem.
          </p>

          {myOrders.length > 0 && (
            <div className="space-y-2 text-left pt-2">
              <span className="text-xs text-slate-400 font-bold block">Jouw overige bestellingen:</span>
              <div className="flex flex-wrap gap-2">
                {myOrders.map(o => (
                  <button
                    key={o.no}
                    onClick={() => setTrackedOrderNo(o.no)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono font-bold text-xs border border-slate-700"
                  >
                    #{o.no} ({getStatusMeta(o.status).shortLabel})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setAppMode('pos');
                setPosScreen('afhaal');
                setTrackedOrderNo(null);
              }}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5"
            >
              <Tv className="w-4 h-4" />
              <span>Naar Afhaalscherm</span>
            </button>
            <button
              onClick={() => setTrackedOrderNo(null)}
              className="px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(order.status);
  const isReady = isOrderReady(order.status);
  const isFinished = isOrderFinished(order.status);

  // Calculate items progress
  const totalItems = order.items.reduce((sum, it) => sum + it.qty, 0);
  const doneItems = order.items.filter(it => it.done).reduce((sum, it) => sum + it.qty, 0);
  const itemsPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : (isReady ? 100 : 25);

  // Stages for the visual progress tracker
  const stages = [
    { key: 'wachten', label: 'Ontvangen', icon: Clock, desc: 'Bestelling genoteerd' },
    { key: 'cooking', label: 'Bereiding', icon: Flame, desc: 'Grill & Frituur' },
    { key: 'inpakken', label: 'Inpakken', icon: PackageCheck, desc: 'Tray & Zak' },
    { key: 'klaar', label: 'Klaar!', icon: BellRing, desc: 'Afhalen bij balie' }
  ];

  let currentStageIndex = 0;
  if (order.status === 'wachten' || order.status === 'new') currentStageIndex = 0;
  else if (order.status === 'oven_grill' || order.status === 'frituren') currentStageIndex = 1;
  else if (order.status === 'inpakken') currentStageIndex = 2;
  else if (isReady || isFinished) currentStageIndex = 3;

  const handleOpenReceipt = () => {
    setActiveReceiptOrder(order);
    setTrackedOrderNo(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
              🍔
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white">Live Bestelling Status</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black border border-amber-500/30">
                  #{order.no}
                </span>
                {order.paymentMeta?.account && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <CreditCard className="w-3 h-3" />
                    <span>@{order.paymentMeta.account}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {order.orderType === 'dine_in' ? '🍽️ Opeten in de zaak' : '🛍️ Meenemen / Afhaal'}
                {order.identifier ? ` • ${order.identifier}` : ''} • {order.time}
              </p>
            </div>
          </div>

          <button
            onClick={() => setTrackedOrderNo(null)}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
            title="Sluit scherm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If user has multiple orders, display clean switcher tabs */}
        {myOrders.length > 1 && (
          <div className="px-5 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-400 font-bold shrink-0">Jouw bestellingen:</span>
            {myOrders.map(o => {
              const isCurrent = o.no === order.no;
              const meta = getStatusMeta(o.status);
              return (
                <button
                  key={o.no}
                  onClick={() => setTrackedOrderNo(o.no)}
                  className={`px-3 py-1 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 ${
                    isCurrent 
                      ? 'bg-amber-400 text-slate-950 shadow' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span className="font-mono">#{o.no}</span>
                  <span className="text-[10px] opacity-80">{meta.shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Dynamic Status Banner */}
        <div className={`p-5 sm:p-6 border-b transition-all ${
          isReady 
            ? 'bg-emerald-950/40 border-emerald-500/50' 
            : 'bg-amber-950/20 border-amber-500/30'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg shrink-0 ${
              isReady 
                ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 animate-bounce' 
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {isReady ? '🔔' : statusMeta.emoji}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isReady ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : `${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`
                }`}>
                  {isReady ? 'Gereed om af te halen' : statusMeta.label}
                </span>
                {isReady && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Haal op bij de balie!</span>
                  </span>
                )}
              </div>

              <h3 className={`text-xl sm:text-2xl font-black mt-1 ${isReady ? 'text-emerald-300' : 'text-white'}`}>
                {isReady ? `Bestelling #${order.no} staat KLAAR!` : statusMeta.description}
              </h3>

              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {isReady ? (
                  order.orderType === 'dine_in' ? (
                    <span>
                      Meld je nu bij de afhaalbalie om je bestelling op te halen om <strong className="text-emerald-300 font-bold">hier heerlijk op te eten</strong>! Vergeet je dienblad niet. Eet smakelijk!
                    </span>
                  ) : (
                    <span>
                      Meld je nu bij de afhaalbalie om je bestelling <strong className="text-emerald-300 font-bold">in te pakken en mee te nemen</strong>! Je tas staat klaar. Eet smakelijk!
                    </span>
                  )
                ) : (
                  order.orderType === 'dine_in' ? (
                    <span>
                      Neem alvast gezellig plaats aan een tafeltje. Onze koks bereiden je gerechten met zorg voor om <strong className="text-amber-300 font-bold">hier op te eten</strong>. We roepen je nummer om zodra het klaar is!
                    </span>
                  ) : (
                    <span>
                      Onze koks pakken je bestelling zo meteen stevig in voor <strong className="text-amber-300 font-bold">onderweg / meenemen</strong>. Zodra je tas klaarstaat bij de balie, roepen we je bestelnummer om!
                    </span>
                  )
                )}
              </p>

              {isReady && (
                <div className="pt-3 flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        AudioFX.bell();
                      } catch {}
                      await updateOrderStatus(order.no, 'afgehaald');
                      setTrackedOrderNo(null);
                    }}
                    className="px-4 py-2 rounded-xl text-[11px] font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span>Ik heb mijn bestelling afgehaald / ontvangen</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="grid grid-cols-4 gap-2 relative">
              {stages.map((stage, idx) => {
                const Icon = stage.icon;
                const isPassed = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;

                let ringColor = 'border-slate-800 bg-slate-950 text-slate-500';
                if (isPassed) {
                  ringColor = 'border-emerald-500 bg-emerald-500 text-slate-950';
                } else if (isCurrent) {
                  ringColor = isReady 
                    ? 'border-emerald-400 bg-emerald-500 text-slate-950 animate-pulse'
                    : 'border-amber-400 bg-amber-500 text-slate-950 ring-4 ring-amber-500/20';
                }

                return (
                  <div key={stage.key} className="flex flex-col items-center text-center">
                    <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center font-bold mb-2 shadow transition-all ${ringColor}`}>
                      {isPassed ? <CheckCircle2 className="w-5 h-5 stroke-[2.5]" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[11px] font-bold ${isCurrent ? 'text-white font-black' : isPassed ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {stage.label}
                    </span>
                    <span className="text-[9px] text-slate-400 hidden sm:block">
                      {stage.desc}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Preparation bar */}
            <div className="mt-4 bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                    <span>Producten voortgang keuken</span>
                  </span>
                  <span className="font-mono font-bold text-amber-400">
                    {doneItems}/{totalItems} gereed ({itemsPercent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      isReady ? 'bg-emerald-400' : 'bg-gradient-to-r from-amber-400 to-orange-400'
                    }`}
                    style={{ width: `${isReady ? 100 : Math.max(10, itemsPercent)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Producten Checklist */}
        <div className="p-5 overflow-y-auto max-h-[36vh] space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Inhoud van je bestelling</span>
            <span className="text-[10px] text-slate-500 lowercase">live bijgewerkt door de keuken</span>
          </h4>

          <div className="space-y-2">
            {order.items.map((item, idx) => {
              const notesParts = parseKitchenNotes(item.itemNote);

              return (
                <div 
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all ${
                    item.done 
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200' 
                      : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className={`px-2 py-0.5 rounded-lg font-mono font-black text-xs ${
                        item.done ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-amber-400'
                      }`}>
                        {item.qty}×
                      </span>
                      <div>
                        <h5 className={`font-bold text-sm ${item.done ? 'text-emerald-200' : 'text-white'}`}>
                          {item.name}
                        </h5>
                        <span className="text-xs text-slate-400 font-mono">
                          {euro(item.price * item.qty)}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge per product stage */}
                    {(() => {
                      const stage = item.stage || (item.done ? 'klaar' : 'wachten');
                      if (stage === 'klaar') {
                        return (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Gereed</span>
                          </span>
                        );
                      }
                      if (stage === 'inpakken') {
                        return (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                            <span>📦</span>
                            <span>Wordt ingepakt</span>
                          </span>
                        );
                      }
                      if (stage === 'bereiden') {
                        return (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />
                            <span>Vers bereiden</span>
                          </span>
                        );
                      }
                      return (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 bg-slate-800 text-slate-400 border border-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>In wachtrij</span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* Highlights for Customizations & Sauces */}
                  {notesParts.length > 0 && (
                    <div className="mt-2 pl-7 flex flex-wrap gap-1.5">
                      {notesParts.map((part, pIdx) => {
                        let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
                        if (part.type === 'sauce') {
                          badgeClass = 'bg-amber-400/20 text-amber-200 border-amber-400/40 font-bold';
                        } else if (part.type === 'omission') {
                          badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
                        } else if (part.type === 'addition') {
                          badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
                        } else if (part.type === 'drink') {
                          badgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold';
                        }

                        return (
                          <span 
                            key={pIdx}
                            className={`text-[11px] px-2 py-0.5 rounded-lg border flex items-center gap-1 ${badgeClass}`}
                          >
                            {part.type === 'sauce' && '🥫'}
                            {part.type === 'omission' && '🚫'}
                            {part.type === 'addition' && '➕'}
                            {part.type === 'drink' && '🥤'}
                            <span>{part.text}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Totaalbedrag: <strong className="text-white font-mono font-bold">{euro(order.total)}</strong> ({order.paymentMethod.toUpperCase()})
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAppMode('pos');
                setPosScreen('afhaal');
                setTrackedOrderNo(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
              title="Bekijk de bestelling op het grote scherm"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Afhaal-TV</span>
            </button>

            <button
              onClick={handleOpenReceipt}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Receipt className="w-3.5 h-3.5 text-amber-400" />
              <span>Bekijk Bon</span>
            </button>

            <button
              onClick={() => setTrackedOrderNo(null)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black shadow transition active:scale-95"
            >
              Sluiten
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
