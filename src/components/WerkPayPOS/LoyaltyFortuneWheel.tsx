import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Gift, 
  Coins, 
  RotateCw, 
  Trophy, 
  CheckCircle2, 
  Lock, 
  ArrowRight,
  Zap,
  Star
} from 'lucide-react';
import { 
  WHEEL_PRIZES, 
  WheelPrize, 
  LoyaltyCustomer, 
  claimWheelSpin, 
  canCustomerSpinToday,
  getTierInfo 
} from '../../services/loyalty';
import { AudioFX } from '../../services/audio';
import { showToast } from '../../services/appToast';

interface LoyaltyFortuneWheelProps {
  customer: LoyaltyCustomer;
  onCustomerUpdated: (updated: LoyaltyCustomer) => void;
}

export const LoyaltyFortuneWheel: React.FC<LoyaltyFortuneWheelProps> = ({ customer, onCustomerUpdated }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [wonPrize, setWonPrize] = useState<WheelPrize | null>(null);
  const [wonVoucherCode, setWonVoucherCode] = useState<string | null>(null);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  const spinStatus = canCustomerSpinToday(customer);
  const totalSlices = WHEEL_PRIZES.length;
  const sliceAngle = (2 * Math.PI) / totalSlices;

  // Draw the fortune wheel
  const drawWheel = (angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 16;

    ctx.clearRect(0, 0, size, size);

    // Save context for rotation
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle);

    // Outer decorative rim
    ctx.beginPath();
    ctx.arc(0, 0, radius + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    // Draw Slices
    for (let i = 0; i < totalSlices; i++) {
      const prize = WHEEL_PRIZES[i];
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = prize.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Draw Slice Text & Emoji
      ctx.save();
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = prize.textColor || '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${prize.emoji} ${prize.label}`, radius - 20, 0);
      ctx.restore();
    }

    // Outer decorative dots / bulb lights
    const numBulbs = 16;
    for (let b = 0; b < numBulbs; b++) {
      const bAngle = (b * 2 * Math.PI) / numBulbs;
      const bx = Math.cos(bAngle) * (radius + 4);
      const by = Math.sin(bAngle) * (radius + 4);
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = b % 2 === 0 ? '#fef08a' : '#ffffff';
      ctx.fill();
    }

    ctx.restore();

    // Center Hub / Pin
    ctx.beginPath();
    ctx.arc(center, center, 26, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👑', center, center);

    // Top Pointer / Ticker Arrow
    ctx.save();
    ctx.translate(center, 12);
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(-14, 0);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    drawWheel(rotationAngle);
  }, [rotationAngle]);

  const handleSpin = (isPaidBonus = false) => {
    if (isSpinning) return;
    if (!spinStatus.canSpin && !isPaidBonus) {
      if (customer.coins < 25) {
        showToast(spinStatus.message || 'Niet genoeg WerkCoins voor een extra draai (kost 25 coins).', 'warning');
        return;
      }
    }

    setIsSpinning(true);
    setWonPrize(null);
    setWonVoucherCode(null);

    try { AudioFX.click(); } catch {}

    // Random prize selection
    const prizeIndex = Math.floor(Math.random() * totalSlices);
    const targetPrize = WHEEL_PRIZES[prizeIndex];

    // Calculate target angle to point the top indicator to the slice
    const extraFullRotations = 5 + Math.floor(Math.random() * 3);
    const sliceCenterAngle = prizeIndex * sliceAngle + sliceAngle / 2;
    const targetEndAngle = (extraFullRotations * 2 * Math.PI) + ( (3 * Math.PI / 2) - sliceCenterAngle );

    const startTime = performance.now();
    const duration = 4200; // ms
    const initialAngle = rotationAngle % (2 * Math.PI);

    let lastTickAngle = initialAngle;

    const animateWheel = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      
      // Smooth cubic ease out
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentAngle = initialAngle + (targetEndAngle - initialAngle) * easeOut;

      setRotationAngle(currentAngle);

      // Play audio tick whenever passing a slice
      if (Math.abs(currentAngle - lastTickAngle) >= sliceAngle) {
        try { AudioFX.beep(); } catch {}
        lastTickAngle = currentAngle;
      }

      if (progress < 1) {
        requestAnimationFrame(animateWheel);
      } else {
        // Finished
        setIsSpinning(false);
        setWonPrize(targetPrize);
        try { AudioFX.chime(); } catch {}

        // Claim reward & generate voucher
        const result = claimWheelSpin(customer.phone, targetPrize);
        if (result && result.customer) {
          onCustomerUpdated(result.customer);
          if (result.voucher) {
            setWonVoucherCode(result.voucher.code);
          }
        }

        showToast(`🎉 Gefeliciteerd! Je wint: ${targetPrize.emoji} ${targetPrize.label}!`, 'success');
      }
    };

    requestAnimationFrame(animateWheel);
  };

  const tierInfo = getTierInfo(customer.tier || customer.totalSpent, customer.vipSubscriptionActive);

  return (
    <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20 shrink-0">
            🎡
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2 justify-center sm:justify-start">
              <span>Rad van Fortuin</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono">
                Daily Spin
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Draai elke dag gratis aan het rad na je betaling voor bonus WerkCoins, gratis snacks of directe vouchers!
            </p>
          </div>
        </div>

        {/* Tier Boost Badge */}
        <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 text-xs font-black ${tierInfo.badgeBg} ${tierInfo.borderColor} ${tierInfo.color}`}>
          <span className="text-base">{tierInfo.icon}</span>
          <div>
            <div>{tierInfo.name} Level ({tierInfo.multiplier}x Boost)</div>
            <div className="text-[10px] text-slate-400 font-normal">Spaar sneller extra munten!</div>
          </div>
        </div>
      </div>

      {/* Main Wheel Area */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 py-2">
        
        {/* Visual Wheel Canvas */}
        <div className="relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={340}
            height={340}
            className="w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] drop-shadow-2xl"
          />

          {/* Winning Overlay Flash */}
          {wonPrize && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-4 text-center animate-fadeIn border-4 border-amber-400 shadow-2xl z-20">
              <span className="text-5xl animate-bounce mb-1">{wonPrize.emoji}</span>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Je Hebt Gewonnen!</span>
              <h3 className="text-xl font-black text-white">{wonPrize.label}</h3>
              {wonPrize.coinsReward > 0 && (
                <div className="text-xs font-mono font-bold text-emerald-400 mt-1">
                  +{wonPrize.coinsReward} WerkCoins direct bijgeschreven!
                </div>
              )}
              {wonVoucherCode && (
                <div className="mt-2 p-2.5 bg-slate-900 border border-purple-500/50 rounded-xl space-y-1 w-full max-w-[220px]">
                  <span className="text-[10px] text-purple-300 font-bold block uppercase">🎟️ Jouw Voucher Code:</span>
                  <span className="font-mono text-xs font-black text-amber-300 block">{wonVoucherCode}</span>
                  <span className="text-[9px] text-slate-400 block">Opgeslagen in je profiel &amp; direct bruikbaar!</span>
                </div>
              )}
              <button
                onClick={() => { setWonPrize(null); setWonVoucherCode(null); }}
                className="mt-3 px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition active:scale-95"
              >
                Super, Geweldig!
              </button>
            </div>
          )}
        </div>

        {/* Action Panel & Prizes List */}
        <div className="flex-1 max-w-md w-full space-y-4">
          
          {/* Spin Trigger Button */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Status van vandaag:</span>
              {spinStatus.canSpin ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Gratis Draai Klaar!
                </span>
              ) : spinStatus.reason === 'no_order_today' ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Na betaling
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-bold">
                  Vandaag al gedraaid
                </span>
              )}
            </div>

            {spinStatus.canSpin ? (
              <button
                disabled={isSpinning}
                onClick={() => handleSpin(false)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-base uppercase tracking-wider shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
              >
                <RotateCw className={`w-5 h-5 ${isSpinning ? 'animate-spin' : ''}`} />
                <span>{isSpinning ? 'Draaien...' : '🎡 Draai Het Rad (GRATIS)'}</span>
              </button>
            ) : spinStatus.reason === 'no_order_today' ? (
              <div className="space-y-3 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30">
                <div className="flex items-start gap-2.5 text-xs text-amber-200">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-black text-white">Bestel vandaag om te ontgrendelen!</strong>
                    <span>{spinStatus.message}</span>
                  </div>
                </div>
                <button
                  disabled={isSpinning || customer.coins < 25}
                  onClick={() => handleSpin(true)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Toch nu draaien met 25 Coins</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  disabled={isSpinning || customer.coins < 25}
                  onClick={() => handleSpin(true)}
                  className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                >
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>Extra Bonus Draai (25 Coins)</span>
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  Morgen na je volgende bestelling staat er weer een gratis draai klaar!
                </p>
              </div>
            )}
          </div>

          {/* Quick Overview of Possible Prizes */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
              🎁 Mogelijke Prijzen op het Rad:
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {WHEEL_PRIZES.map(p => (
                <div key={p.id} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span>{p.emoji}</span>
                  <span className="font-bold text-slate-200 truncate">{p.label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
