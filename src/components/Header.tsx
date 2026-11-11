import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { euro } from '../services/store';
import { AudioFX } from '../services/audio';
import { PosScreenType } from '../types';
import { showToast } from '../services/appToast';
import { PosLoginModal } from './WerkPayPOS/PosLoginModal';
import { DiyTerminalModal } from './WerkPayPOS/DiyTerminalModal';
import { 
  Utensils, 
  CreditCard, 
  Columns, 
  Database, 
  User, 
  LogOut, 
  Wifi, 
  WifiOff, 
  ChefHat, 
  Tv, 
  Boxes, 
  BarChart3, 
  ShoppingCart,
  Sparkles,
  ShieldCheck,
  Github,
  Volume2,
  VolumeX,
  Cpu,
  RotateCw,
  Eye,
  Sliders,
  Megaphone,
  Radio
} from 'lucide-react';
import { getStatusMeta } from '../services/orderStatus';

interface HeaderProps {
  onOpenGithub?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenGithub }) => {
  const { 
    appMode, 
    setAppMode, 
    posScreen, 
    setPosScreen,
    werkpayScreen,
    setWerkpayScreen,
    activeBrand,
    setActiveBrand,
    brandConfig,
    customBranding,
    managerOverride,
    currentPosUser, 
    canAccess,
    logoutPos,
    currentBankAccount,
    logoutWerkPay,
    isOnline,
    syncStatus,
    isRealtimeActive,
    lastSyncTime,
    forceSyncNow,
    orders,
    cart,
    activeUserOrders,
    setTrackedOrderNo,
    getUserOrders
  } = useApp();

  const [showPosLoginModal, setShowPosLoginModal] = useState(false);
  const [showPayLoginModal, setShowPayLoginModal] = useState(false);
  const [showDiyTerminalModal, setShowDiyTerminalModal] = useState(false);

  const activeKitchenCount = orders.filter(o => o.status === 'new').length;
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const [soundActive, setSoundActive] = useState<boolean>(AudioFX.isEnabled);

  // Determine permissions using centralized canAccess
  const isCustomer = !currentPosUser || 
    currentPosUser.username === 'bestel_kassa' || 
    currentPosUser.username === 'klant' || 
    (!canAccess('kitchen') && !canAccess('voorraad') && !canAccess('manager'));

  const canAccessKitchen = canAccess('kitchen');
  const canAccessInventory = canAccess('voorraad');
  const canAccessManager = canAccess('manager');
  const canAccessPickupControl = canAccess('manager') || canAccess('pickup_control') || currentPosUser?.is_admin || currentPosUser?.username.toLowerCase() === 'joas';

  const handleSelectPosScreen = (screen: PosScreenType) => {
    if (screen === 'keuken' && !canAccessKitchen) {
      showToast('Geen toegang tot de keuken. Als je dit recht niet hebt mag je dit scherm niet openen.', 'error');
      return;
    }
    if (screen === 'voorraad' && !canAccessInventory) {
      showToast('Geen toegang tot de voorraad. Als je dit recht niet hebt mag je dit scherm niet openen.', 'error');
      return;
    }
    if (screen === 'manager' && !canAccessManager) {
      showToast('Geen toegang tot het manager scherm. Alleen managers met het manager-recht kunnen dit scherm openen.', 'error');
      return;
    }
    if (screen === 'pickup_control' && !canAccessPickupControl) {
      showToast('Geen toegang tot TV & Nieuws Beheer. Alleen bevoegde rangen kunnen dit scherm openen.', 'error');
      return;
    }
    
    // Auto lock manager screen when navigating away from it to ensure strict security
    if (screen !== 'manager' && currentPosUser) {
      sessionStorage.removeItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`);
    }
    
    setPosScreen(screen);
  };

  const isKoekploeg = activeBrand === 'koekploeg';

  const displayBranding = (customBranding && customBranding.useCustomBranding) ? {
    name: customBranding.storeName,
    tagline: customBranding.tagline,
    logoEmoji: customBranding.logoEmoji,
    themeColor: 'custom',
    badgeText: customBranding.storeName.toUpperCase(),
    accentBadgeClass: `bg-[${customBranding.primaryColor}]/20 text-[${customBranding.primaryColor}] border-[${customBranding.primaryColor}]/30`,
    headerGradient: customBranding.headerGradient
  } : brandConfig;

  // If logged in as RPI Kiosk account or locked terminal, hide the top header completely
  if (currentPosUser?.username === 'rpi' || currentPosUser?.is_terminal_locked) {
    return null;
  }

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl">
      {/* Top Banner with App Switcher & User Statuses */}
      <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
        
        {/* Brand Identification with Brand Switcher */}
        <div className="flex items-center gap-3">
          <div 
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-2xl shadow-lg transition-all ${
              (customBranding && customBranding.useCustomBranding)
                ? `bg-gradient-to-r ${customBranding.headerGradient} text-white shadow-lg`
                : isKoekploeg 
                ? 'bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-600 text-slate-950 shadow-amber-500/30'
                : 'bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white shadow-blue-500/25'
            }`}
          >
            {displayBranding.logoEmoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">{displayBranding.name}</span>
              {managerOverride && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 border border-emerald-500/30 animate-pulse font-black">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="hidden sm:inline">OVERRIDE ACTIEF</span>
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                (customBranding && customBranding.useCustomBranding)
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : brandConfig.accentBadgeClass
              }`}>
                {displayBranding.badgeText}
              </span>
              <span className="text-slate-500">×</span>
              <span className="font-extrabold text-lg tracking-tight text-cyan-400">WerkPay</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                BANK
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {displayBranding.tagline}
            </p>
          </div>

          {/* Quick Brand Switcher Toggle */}
          <div className="ml-2 flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveBrand('koekploeg')}
              className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
                isKoekploeg 
                  ? 'bg-amber-500 text-slate-950 shadow-sm' 
                  : 'text-slate-400 hover:text-amber-300'
              }`}
              title="Wissel naar De Koekploeg (Stroopwafels & Geel thema)"
            >
              <span>🧇</span>
              <span className="hidden md:inline">Koekploeg</span>
            </button>
            <button
              onClick={() => setActiveBrand('werkpay')}
              className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
                !isKoekploeg 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-blue-300'
              }`}
              title="Wissel naar Werkdonalds (Burgers & Blauw thema)"
            >
              <span>🍔</span>
              <span className="hidden md:inline">Werkdonalds</span>
            </button>
          </div>
        </div>

        {/* Primary App Switcher (POS vs WerkPay) */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => setAppMode('pos')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              appMode === 'pos'
                ? isKoekploeg 
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-black' 
                  : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>{isKoekploeg ? 'De Koekploeg Kassa' : 'Werkdonalds POS'}</span>
            {activeKitchenCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                {activeKitchenCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setAppMode('werkpay')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              appMode === 'werkpay'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>WerkPay Bank</span>
          </button>
        </div>

        {/* Right Status Bars: Supabase Live Dot & User Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sound Toggle Button */}
          <button
            onClick={() => {
              const next = !AudioFX.isEnabled;
              AudioFX.setEnabled(next);
              if (next) AudioFX.bell();
              setSoundActive(next);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
              soundActive 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:bg-slate-700/50'
            }`}
            title={soundActive ? 'Geluid actief (klik om te muten)' : 'Geluid gedempt (klik om in te schakelen)'}
          >
            {soundActive ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
            <span className="text-[11px] hidden md:inline">{soundActive ? 'Geluid Aan' : 'Geluid Uit'}</span>
          </button>

          {/* Live Sync Status & Manual Refresh */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAppMode('setup')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                isRealtimeActive
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                  : isOnline
                  ? 'bg-blue-950/60 border-blue-500/40 text-blue-300 hover:bg-blue-900/50'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
              }`}
              title={
                isRealtimeActive
                  ? `⚡ Live Realtime actief (Laatste sync: ${lastSyncTime ? lastSyncTime.toLocaleTimeString('nl-NL') : 'zojuist'})`
                  : isOnline
                  ? `🔄 Live Polling elke 3s (Laatste sync: ${lastSyncTime ? lastSyncTime.toLocaleTimeString('nl-NL') : 'zojuist'})`
                  : '⚠️ Lokale opslag / offline'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRealtimeActive
                    ? 'bg-emerald-400 animate-ping'
                    : isOnline
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-[11px] font-bold hidden sm:inline">
                {isRealtimeActive ? 'Live Realtime' : isOnline ? 'Live Sync (3s)' : 'Offline / Demo'}
              </span>
            </button>

            <button
              onClick={() => forceSyncNow()}
              className="p-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Nu geforceerd synchroniseren met Supabase"
            >
              <RotateCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>

          {/* Active Order Live Tracking Shortcut */}
          {activeUserOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setTrackedOrderNo(activeUserOrders[0].no)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-md shadow-amber-500/25 transition active:scale-95 animate-pulse"
              title={`Volg jouw actieve bestelling #${activeUserOrders[0].no} live`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bestelling #{activeUserOrders[0].no} Volgen</span>
              <span className="sm:hidden">#{activeUserOrders[0].no}</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-950/20 text-[10px] font-bold hidden md:inline">
                {getStatusMeta(activeUserOrders[0].status).shortLabel}
              </span>
            </button>
          )}

          {/* WerkPay Account Badge */}
          {currentBankAccount ? (
            <div 
              onClick={() => { setAppMode('werkpay'); setWerkpayScreen('wallet'); }}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-medium cursor-pointer hover:border-cyan-400 transition"
              title="WerkPay kaarthouder & saldo"
            >
              <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold">{currentBankAccount.account_holder.split(' ')[0]}</span>
              <span className="font-extrabold text-cyan-200 bg-cyan-500/20 px-1.5 py-0.5 rounded text-[11px]">
                {currentBankAccount.is_admin ? '€ ∞' : euro(currentBankAccount.balance)}
              </span>
            </div>
          ) : (
            <button
              onClick={() => { setAppMode('werkpay'); }}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
            >
              Inloggen WerkPay
            </button>
          )}

          {/* POS Staff vs Customer / Not Logged In */}
          {currentPosUser ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold">{currentPosUser.name.split(' ')[0]}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                currentPosUser.is_admin 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                  : isCustomer 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {currentPosUser.is_admin ? 'Manager' : isCustomer ? 'Klant' : 'Medewerker'}
              </span>
              <button 
                onClick={logoutPos} 
                className="hover:text-rose-400 p-0.5 ml-1 transition" 
                title="Uitloggen van Kassa"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPosLoginModal(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 transition shadow-sm border border-blue-500/40"
            >
              <User className="w-3.5 h-3.5" />
              <span>Inloggen Kassa</span>
            </button>
          )}
        </div>
      </div>

      {/* Secondary Bar for POS Screens when in 'pos' mode */}
      {appMode === 'pos' && (
        (currentPosUser?.is_terminal_locked || currentPosUser?.username === 'rpi') ? (
          <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between bg-amber-950/80 border-b border-amber-500/30 text-amber-300 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="text-base">🔒</span>
              <span className="text-white font-extrabold">Raspberry Pi Terminal (Kiosk Stand)</span>
              <span className="text-amber-400 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 font-black">
                👑 WerkLoyalty Spaarpaal
              </span>
            </div>
            <button
              onClick={logoutPos}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black transition shadow-md shadow-rose-600/30"
              title="Sessie Beëindigen / Uitloggen van RPI Terminal"
            >
              <LogOut className="w-4 h-4" />
              <span>Sessie Beëindigen</span>
            </button>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto bg-slate-900/90 border-b border-slate-800 text-xs">
          <button
            onClick={() => handleSelectPosScreen('kassa')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              posScreen === 'kassa' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{isCustomer ? 'Bestellen' : 'Kassa'}</span>
            {cartItemCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full font-black text-[10px] bg-white text-blue-700">
                {cartItemCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleSelectPosScreen('afhaal')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              posScreen === 'afhaal' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Tv className="w-3.5 h-3.5 opacity-60" />
            <span>Afhaalscherm TV</span>
          </button>

          {!isCustomer && canAccessPickupControl && (
            <button
              onClick={() => handleSelectPosScreen('pickup_control')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                posScreen === 'pickup_control' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'text-rose-400 hover:bg-rose-950/40 hover:text-rose-300'
              }`}
              title="Open het Afhaalscherm & NOS Nieuwsbalk Regiescherm"
            >
              <Sliders className="w-4 h-4 text-rose-400" />
              <span>📺 TV &amp; Nieuws Beheer</span>
            </button>
          )}

          {/* OrderRadar (Live Volgscherm) Button */}
          <button
            type="button"
            onClick={() => {
              if (activeUserOrders.length > 0) {
                setTrackedOrderNo(activeUserOrders[0].no);
              } else {
                const myOrders = getUserOrders();
                if (myOrders.length > 0) {
                  setTrackedOrderNo(myOrders[0].no);
                } else if (orders.length > 0) {
                  setTrackedOrderNo(orders[0].no);
                }
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeUserOrders.length > 0 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 animate-pulse' 
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Open de OrderRadar live status voor jouw bestelling"
          >
            <Radio className="w-4 h-4 text-amber-400 animate-spin" />
            <span>📡 OrderRadar</span>
            {activeUserOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full font-black text-[10px] bg-amber-400 text-slate-950">
                #{activeUserOrders[0].no}
              </span>
            )}
          </button>

          {/* Keuken (KDS) - strictly hidden from customers */}
          {!isCustomer && canAccessKitchen && (
            <button
              onClick={() => handleSelectPosScreen('keuken')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                posScreen === 'keuken' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              <span>Keuken (KDS)</span>
              {activeKitchenCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full font-black text-[10px] bg-rose-600 text-white">
                  {activeKitchenCount}
                </span>
              )}
            </button>
          )}

          {/* Voorraad & Inkoop - strictly hidden from customers */}
          {!isCustomer && canAccessInventory && (
            <button
              onClick={() => handleSelectPosScreen('voorraad')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                posScreen === 'voorraad' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Voorraad &amp; Inkoop</span>
            </button>
          )}

          {/* Manager & Menu - strictly hidden from customers */}
          {!isCustomer && canAccessManager && (
            <button
              onClick={() => handleSelectPosScreen('manager')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                posScreen === 'manager' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Manager &amp; Menu</span>
            </button>
          )}
        </div>
        )
      )}

      {/* Secondary Bar for WerkPay Screens when in 'werkpay' mode */}
      {appMode === 'werkpay' && (
        <div className="px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto bg-slate-900/90 border-b border-slate-800 text-xs">
          <button
            onClick={() => setWerkpayScreen('wallet')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              werkpayScreen === 'wallet' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Mijn Bankpas &amp; Saldo</span>
          </button>

          {/* Mijn Bestellingen (Live Volgen) Button */}
          <button
            type="button"
            onClick={() => {
              if (activeUserOrders.length > 0) {
                setTrackedOrderNo(activeUserOrders[0].no);
              } else {
                const myOrders = getUserOrders();
                if (myOrders.length > 0) {
                  setTrackedOrderNo(myOrders[0].no);
                } else {
                  setWerkpayScreen('wallet');
                }
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeUserOrders.length > 0 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 animate-pulse' 
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="Volg jouw Werkdonalds bestellingen live"
          >
            <Eye className="w-4 h-4 text-amber-400" />
            <span>Mijn Bestelling Volgen</span>
            {activeUserOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full font-black text-[10px] bg-amber-400 text-slate-950">
                #{activeUserOrders[0].no}
              </span>
            )}
          </button>

          <button
            onClick={() => setWerkpayScreen('overboeken')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              werkpayScreen === 'overboeken' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Geld Overboeken</span>
          </button>

          {(currentBankAccount?.is_admin || currentPosUser?.is_admin) && (
            <button
              onClick={() => setWerkpayScreen('accounts')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                werkpayScreen === 'accounts' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Alle Accounts (Manager)</span>
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {showPosLoginModal && (
        <PosLoginModal onClose={() => setShowPosLoginModal(false)} />
      )}

      {showDiyTerminalModal && (
        <DiyTerminalModal onClose={() => setShowDiyTerminalModal(false)} />
      )}
    </header>
  );
};
