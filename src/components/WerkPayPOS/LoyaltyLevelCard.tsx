import React, { useState } from 'react';
import { 
  Trophy, 
  Sparkles, 
  Check, 
  Lock, 
  ArrowRight, 
  TrendingUp, 
  ShieldCheck, 
  Star,
  Zap,
  Coins,
  Crown,
  AlertTriangle,
  Calendar,
  Clock,
  Info
} from 'lucide-react';
import { LoyaltyCustomer, TIER_LEVELS, getTierInfo, subscribeVipClub, getMonthlyTierStatus, getLoyaltyCustomers } from '../../services/loyalty';
import { euro } from '../../services/store';
import { showToast } from '../../services/appToast';
import { AudioFX } from '../../services/audio';
import { useApp } from '../../context/AppContext';
import { VipWerkPaySubscriptionModal } from './VipWerkPaySubscriptionModal';

interface LoyaltyLevelCardProps {
  customer: LoyaltyCustomer;
  onCustomerUpdated?: (updated: LoyaltyCustomer) => void;
}

export const LoyaltyLevelCard: React.FC<LoyaltyLevelCardProps> = ({ customer, onCustomerUpdated }) => {
  const { posClient } = useApp();
  const currentTier = getTierInfo(customer.tier || customer.totalSpent, customer.vipSubscriptionActive);
  const currentLevel = currentTier.level;
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [showWerkPayVipModal, setShowWerkPayVipModal] = useState<boolean>(false);

  const monthlyStatus = getMonthlyTierStatus(customer);

  // Next Tier calculation
  const nextTier = TIER_LEVELS.find(t => t.level === currentLevel + 1) || null;
  const spentSoFar = customer.totalSpent || 0;
  
  let progressPercent = 100;
  let neededToNext = 0;

  if (nextTier && !customer.vipSubscriptionActive) {
    const prevMin = currentTier.minSpent;
    const nextMin = nextTier.minSpent;
    neededToNext = Math.max(0, nextMin - spentSoFar);
    const range = nextMin - prevMin;
    const progressInRange = Math.max(0, spentSoFar - prevMin);
    progressPercent = Math.min(100, Math.round((progressInRange / range) * 100));
  }

  const handleSubscribeVip = (plan: 'vip_monthly_499' | 'vip_monthly_999') => {
    setSubscribing(true);
    const updated = subscribeVipClub(customer.phone, plan, posClient);
    if (updated) {
      AudioFX.chime();
      showToast(`🌟 Welkom bij de VIP Club! Je 2.0x dubbele WerkCoins boost en gratis snack-voucher zijn geactiveerd.`, 'success');
      if (onCustomerUpdated) onCustomerUpdated(updated);
    } else {
      showToast('Kon abonnement niet activeren. Klant niet gevonden.', 'error');
    }
    setSubscribing(false);
  };

  return (
    <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-600 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20 shrink-0">
            👑
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2 justify-center sm:justify-start">
              <span>Level &amp; VIP Systeem</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${currentTier.badgeBg} ${currentTier.color} ${currentTier.borderColor}`}>
                Level {currentLevel}: {currentTier.name}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Spaar sneller met automatische multipliers &amp; behoud je status via maandelijkse uitgaven!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-center">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Deze Maand Besteed</div>
            <div className="text-base font-black text-amber-400">{euro(customer.currentMonthSpent || 0)}</div>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-center">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Totaal Besteed</div>
            <div className="text-base font-black text-emerald-400">{euro(spentSoFar)}</div>
          </div>
        </div>
      </div>

      {/* SEPHORA-STYLE MONTHLY TIER RETENTION & 2-MONTH DOWNGRADE CARD */}
      <div className={`p-5 rounded-3xl border-2 transition-all space-y-4 shadow-xl ${
        monthlyStatus.status === 'safe'
          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
          : monthlyStatus.status === 'danger_month_2'
          ? 'bg-rose-950/40 border-rose-500/60 text-rose-200'
          : monthlyStatus.status === 'warning_month_1'
          ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
          : monthlyStatus.status === 'vip_active'
          ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
          : 'bg-slate-950 border-slate-800 text-slate-300'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black shrink-0 ${
              monthlyStatus.status === 'safe' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
              monthlyStatus.status === 'danger_month_2' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
              monthlyStatus.status === 'warning_month_1' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
              'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
            }`}>
              {monthlyStatus.status === 'safe' ? '🛡️' : monthlyStatus.status === 'danger_month_2' ? '⚠️' : '🎯'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-sm uppercase tracking-tight">
                  Statusbehoud &amp; Maandtarget (Sephora Systeem)
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  monthlyStatus.status === 'safe' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  monthlyStatus.status === 'danger_month_2' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                  'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {monthlyStatus.status === 'safe' ? 'Status Veilig' : monthlyStatus.status === 'danger_month_2' ? 'Downgrade Risico (2/2)' : 'In Grace Period (1/2)'}
                </span>
              </div>
              <p className="text-xs opacity-90 mt-0.5">
                {monthlyStatus.statusMessage}
              </p>
            </div>
          </div>

          {currentTier.monthlyTarget > 0 && !customer.vipSubscriptionActive && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right shrink-0">
              <span className="text-[10px] text-slate-400 block font-bold">Maandtarget</span>
              <span className="text-xs font-black text-amber-300 font-mono">{euro(currentTier.monthlyTarget)} / maand</span>
            </div>
          )}
        </div>

        {/* Progress bar towards monthly retention target */}
        {currentTier.monthlyTarget > 0 && !customer.vipSubscriptionActive && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span>Voortgang deze maand: {euro(customer.currentMonthSpent || 0)} / {euro(currentTier.monthlyTarget)}</span>
              <span className="font-mono">{monthlyStatus.progressPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  monthlyStatus.progressPercent >= 100 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                }`}
                style={{ width: `${monthlyStatus.progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              <span>💡 Regel: 2 opeenvolgende maanden onder target = 1 level downgrade</span>
              <span>{monthlyStatus.neededThisMonth > 0 ? `Nog ${euro(monthlyStatus.neededThisMonth)} nodig deze maand` : '✅ Doel behaald!'}</span>
            </div>
          </div>
        )}
      </div>

      {/* VIP Club Monthly Membership Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-cyan-950/60 border-2 border-amber-400/60 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 text-center md:text-left">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-950 font-black flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-amber-500/20">
            ⭐
          </div>
          <div>
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h3 className="font-black text-white text-base uppercase tracking-tight">
                Werkdonalds VIP Club Maandabonnement
              </h3>
              {customer.vipSubscriptionActive && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/30">
                  ACTIEF TOT {customer.vipSubscriptionExpires}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Ontgrendel direct <strong>2.0x Dubbele WerkCoins</strong>, gratis maandelijkse snack vouchers en gegarandeerde status zonder downgrade voor maar <strong>€ 4,99 / maand</strong>!
            </p>
          </div>
        </div>

        {!customer.vipSubscriptionActive ? (
          <button
            disabled={subscribing}
            onClick={() => setShowWerkPayVipModal(true)}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-400/20 active:scale-95 transition shrink-0 flex items-center gap-2"
          >
            <Crown className="w-4 h-4" />
            <span>Word VIP Lid (€ 4,95/mnd)</span>
          </button>
        ) : (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center">
            ✓ VIP Club Geactiveerd
          </div>
        )}
      </div>

      {/* Progress to Next Level */}
      {nextTier && !customer.vipSubscriptionActive ? (
        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-300 flex items-center gap-1.5">
              <span>Voortgang naar Level {nextTier.level}:</span>
              <span className={nextTier.color}>{nextTier.name}</span>
            </span>
            <span className="text-amber-400 font-mono">{progressPercent}%</span>
          </div>

          {/* Progress Bar Track */}
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full transition-all duration-500 shadow-md"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Huidig Totaal: {euro(spentSoFar)}</span>
            <span className="text-amber-300 font-bold">
              Nog {euro(neededToNext)} tot {nextTier.icon} {nextTier.name} ({nextTier.multiplier}x boost!)
            </span>
            <span>Doel: {euro(nextTier.minSpent)}</span>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center text-xl font-black shrink-0">
            💎
          </div>
          <div>
            <div className="text-sm font-black text-cyan-300">MAX LEVEL BEREIKT: VIP DIAMANT</div>
            <p className="text-xs text-slate-300">
              Je profiteert van de maximale 2.0x dubbele WerkCoins boost en alle exclusieve privileges!
            </p>
          </div>
        </div>
      )}

      {/* 4 Tier Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        {TIER_LEVELS.map(t => {
          const isUnlocked = currentLevel >= t.level;
          const isCurrent = currentLevel === t.level;

          return (
            <div
              key={t.level}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-3 ${
                isCurrent 
                  ? 'bg-slate-900 border-amber-400 shadow-xl shadow-amber-500/10 ring-2 ring-amber-400/20' 
                  : isUnlocked
                  ? 'bg-slate-950/80 border-slate-700'
                  : 'bg-slate-950/40 border-slate-800 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{t.icon}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${t.badgeBg} ${t.color} ${t.borderColor}`}>
                    Level {t.level}
                  </span>
                </div>

                <div className="mt-2">
                  <h3 className={`font-black text-base ${t.color}`}>
                    {t.name}
                  </h3>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {t.minSpent === 0 ? 'Basis Level' : `Vanaf ${euro(t.minSpent)} totaal`}
                  </div>
                  {t.monthlyTarget > 0 && (
                    <div className="text-[10px] text-amber-300/90 font-bold mt-0.5">
                      Target: {euro(t.monthlyTarget)}/mnd
                    </div>
                  )}
                </div>

                <div className="mt-2 p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">Coins Boost:</span>
                  <span className="text-xs font-black text-amber-400 font-mono">{t.multiplier}x</span>
                </div>

                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-300">
                  {t.perks.map((p, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isUnlocked ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <span className={isUnlocked ? 'text-slate-200' : 'text-slate-500'}>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                {isCurrent ? (
                  <div className="text-center text-[10px] font-black text-amber-400 uppercase tracking-wider py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    ⭐ Huidig Level
                  </div>
                ) : isUnlocked ? (
                  <div className="text-center text-[10px] font-bold text-emerald-400 py-1">
                    ✓ Ontgrendeld
                  </div>
                ) : (
                  <div className="text-center text-[10px] font-bold text-slate-500 py-1 flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Nog {euro(Math.max(0, t.minSpent - spentSoFar))} nodig</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showWerkPayVipModal && (
        <VipWerkPaySubscriptionModal
          customerPhone={customer.phone}
          customerName={customer.name}
          onClose={() => setShowWerkPayVipModal(false)}
          onSuccess={() => {
            setShowWerkPayVipModal(false);
            const allCusts = getLoyaltyCustomers();
            const updated = allCusts.find(c => c.phone === customer.phone || c.id === customer.id);
            if (updated && onCustomerUpdated) {
              onCustomerUpdated(updated);
            }
          }}
        />
      )}

    </div>
  );
};
