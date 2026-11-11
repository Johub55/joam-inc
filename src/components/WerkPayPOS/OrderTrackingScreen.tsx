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
  Flame, 
  PackageCheck, 
  BellRing, 
  Receipt,
  Sparkles,
  Tv,
  CreditCard,
  ArrowLeft,
  RefreshCw,
  ShoppingBag,
  Radio,
  Zap,
  CheckCircle2
} from 'lucide-react';

export const OrderTrackingScreen: React.FC = () => {
  const { 
    trackedOrderNo, 
    setTrackedOrderNo, 
    orders, 
    setActiveReceiptOrder,
    setAppMode,
    setPosScreen,
    getUserOrders,
    forceSyncNow,
    syncStatus,
    updateOrderStatus
  } = useApp();

  const [hasPlayedChime, setHasPlayedChime] = useState<boolean>(false);

  const myOrders = getUserOrders();

  // If no order is selected yet, default to the most recent user order or latest order
  const effectiveOrderNo = trackedOrderNo || (myOrders.length > 0 ? myOrders[0].no : (orders.length > 0 ? orders[0].no : null));
  const order = orders.find(o => o.no === effectiveOrderNo);

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
  }, [effectiveOrderNo]);

  const stages = [
    { key: 'wachten', label: 'Ontvangen', icon: Clock, desc: 'Bestelling genoteerd' },
    { key: 'cooking', label: 'Bereiding', icon: Flame, desc: 'Grill & Frituur' },
    { key: 'inpakken', label: 'Inpakken', icon: PackageCheck, desc: 'Tray & Zak' },
    { key: 'klaar', label: 'Klaar!', icon: BellRing, desc: 'Afhalen bij balie' }
  ];

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950 text-center overflow-y-auto">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-3xl font-black">
            🍔
          </div>
          <div>
            <h2 className="text-xl font-black text-white flex items-center justify-center gap-2">
              <Radio className="w-5 h-5 text-amber-400 animate-spin" />
              <span>OrderRadar: Geen Bestelling</span>
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Er is momenteel geen actieve bestelling op de radar. Plaats een bestelling via de kassa of selecteer een bestelnummer hieronder.
            </p>
          </div>

          {orders.length > 0 && (
            <div className="space-y-2 text-left pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-bold block">Recente bestellingen in het systeem:</span>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {orders.slice(0, 8).map(o => (
                  <button
                    key={o.no}
                    onClick={() => setTrackedOrderNo(o.no)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono font-bold text-xs border border-slate-700 transition"
                  >
                    #{o.no} ({getStatusMeta(o.status).shortLabel})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <button
              onClick={() => setPosScreen('kassa')}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Naar Bestellen</span>
            </button>
            <button
              onClick={() => setPosScreen('afhaal')}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition"
            >
              <Tv className="w-4 h-4" />
              <span>Afhaal-TV</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(order.status);
  const isReady = isOrderReady(order.status);
  const isFinished = isOrderFinished(order.status);

  let currentStageIndex = 0;
  if (order.status === 'wachten' || order.status === 'new') currentStageIndex = 0;
  else if (order.status === 'oven_grill' || order.status === 'frituren') currentStageIndex = 1;
  else if (order.status === 'inpakken') currentStageIndex = 2;
  else if (isReady || isFinished) currentStageIndex = 3;

  const totalItems = order.items.reduce((sum, it) => sum + it.qty, 0);
  const doneItems = order.items.filter(it => it.done).reduce((sum, it) => sum + it.qty, 0);
  const itemsPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : (isReady ? 100 : 25);

  const handleOpenReceipt = () => {
    setActiveReceiptOrder(order);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-5">
      
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPosScreen('kassa')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition"
            title="Terug naar kassa/bestellen"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Radio className="w-5 h-5 animate-pulse" />
                </span>
                <span>📡 WERKDONALDS ORDER-RADAR</span>
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black border border-amber-500/40">
                #{order.no}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live radar monitoring van je bestelling. Synchroniseert real-time met de keuken en de KDS schermen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => forceSyncNow()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Verversen</span>
          </button>

          <button
            onClick={handleOpenReceipt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 transition"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Kassabon</span>
          </button>

          <button
            onClick={() => setPosScreen('afhaal')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 transition"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Afhaal-TV</span>
          </button>
        </div>
      </div>

      {/* Orders Switcher Chips */}
      {myOrders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-bold shrink-0">Jouw bestellingen:</span>
          {myOrders.map(o => {
            const isCurrent = o.no === order.no;
            const meta = getStatusMeta(o.status);
            return (
              <button
                key={o.no}
                onClick={() => setTrackedOrderNo(o.no)}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-2 shrink-0 border ${
                  isCurrent 
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md shadow-amber-400/20' 
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                <span className="font-mono">#{o.no}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
                  isCurrent ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}>
                  {meta.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status Hero Card */}
      <div className={`p-6 sm:p-8 rounded-3xl border transition-all shadow-xl ${
        isReady 
          ? 'bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border-emerald-500/50 shadow-emerald-500/10' 
          : 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-amber-500/30'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-xl shrink-0 ${
              isReady 
                ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 animate-bounce' 
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {isReady ? '🔔' : statusMeta.emoji}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                  isReady ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : `${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`
                }`}>
                  {isReady ? 'Gereed om af te halen' : statusMeta.label}
                </span>
                {isReady && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Meld je bij de balie!</span>
                  </span>
                )}
                {order.paymentMeta?.account && (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <CreditCard className="w-3 h-3" />
                    <span>@{order.paymentMeta.account}</span>
                  </span>
                )}
              </div>

              <h2 className={`text-2xl sm:text-3xl font-black mt-2 ${isReady ? 'text-emerald-300' : 'text-white'}`}>
                {isReady ? `Bestelling #${order.no} staat KLAAR!` : statusMeta.description}
              </h2>

              <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
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
                <div className="pt-4 flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        AudioFX.bell();
                      } catch {}
                      await updateOrderStatus(order.no, 'afgehaald');
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center gap-2 cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Ik heb mijn bestelling afgehaald / ontvangen</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 min-w-[200px] text-right shrink-0">
            <div className="text-xs text-slate-400">Ordernummer</div>
            <div className="text-3xl font-black font-mono text-amber-400">#{order.no}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {order.orderType === 'dine_in' ? '🍽️ Opeten in de zaak' : '🛍️ Meenemen / Afhaal'}
              {order.identifier ? ` • ${order.identifier}` : ''}
            </div>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative">
            {stages.map((stage, idx) => {
              const Icon = stage.icon;
              const isPassed = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx;

              return (
                <div 
                  key={stage.key}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/10'
                      : isPassed
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-950/50 border-slate-800/70 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950 animate-pulse'
                        : isPassed
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">Stap {idx + 1}/4</span>
                  </div>
                  <div className={`font-bold text-xs ${isCurrent ? 'text-amber-300' : isPassed ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {stage.label}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{stage.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Order Details & Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Items Progress & Breakdown */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-white">Gerechten &amp; Bereidingsstatus</h3>
              <p className="text-xs text-slate-400">Overzicht van items die in de keuken worden bereid</p>
            </div>
            <div className="text-xs font-bold text-slate-300">
              {doneItems} van {totalItems} gereed ({itemsPercent}%)
            </div>
          </div>

          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                itemsPercent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-amber-400'
              }`}
              style={{ width: `${itemsPercent}%` }}
            />
          </div>

          <div className="space-y-2.5 pt-2">
            {order.items.map((it, idx) => {
              const notes = parseKitchenNotes(it.notes);
              return (
                <div 
                  key={idx}
                  className={`p-3.5 rounded-2xl border transition flex items-start justify-between gap-3 text-xs ${
                    it.done 
                      ? 'bg-slate-950/60 border-emerald-500/30' 
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="font-black text-amber-400 font-mono text-sm px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800">
                      {it.qty}x
                    </span>
                    <div>
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>{it.name}</span>
                        {it.done && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ✓ Klaar
                          </span>
                        )}
                      </div>
                      {notes.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {notes.map((n, nIdx) => (
                            <div key={nIdx} className="text-[11px] text-slate-400">
                              • {n}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-slate-200">{euro(it.price * it.qty)}</div>
                    <div className="text-[10px] text-slate-500">{euro(it.price)} p.st.</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Meta & Receipt Summary */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow space-y-4 text-xs">
            <h3 className="font-bold text-sm text-white">Betaling &amp; Gegevens</h3>

            <div className="space-y-2.5">
              <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-800">
                <span>Tijdstip:</span>
                <span className="text-white font-mono">{order.time}</span>
              </div>
              <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-800">
                <span>Type:</span>
                <span className="text-white font-bold">
                  {order.orderType === 'dine_in' ? 'Opeten in zaak' : 'Meenemen / Afhaal'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-800">
                <span>Betaalmethode:</span>
                <span className="text-cyan-400 font-bold uppercase">{order.paymentMethod}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-400 pb-2 border-b border-slate-800 font-bold">
                  <span>Korting:</span>
                  <span>- {euro(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-white pt-1">
                <span>Totaal betaald:</span>
                <span className="text-amber-400">{euro(order.total)}</span>
              </div>
            </div>

            <button
              onClick={handleOpenReceipt}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
            >
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Bekijk Volledige Kassabon</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
