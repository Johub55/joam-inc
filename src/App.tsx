import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ShieldAlert, Lock } from 'lucide-react';
import { Header } from './components/Header';
import { PosScreen } from './components/WerkPayPOS/PosScreen';
import { KitchenScreen } from './components/WerkPayPOS/KitchenScreen';
import { PickupScreen } from './components/WerkPayPOS/PickupScreen';
import { InventoryScreen } from './components/WerkPayPOS/InventoryScreen';
import { ManagerScreen } from './components/WerkPayPOS/ManagerScreen';
import { OrderTrackingScreen } from './components/WerkPayPOS/OrderTrackingScreen';
import { ReceiptModal } from './components/WerkPayPOS/ReceiptModal';
import { PaymentModal } from './components/WerkPayPOS/PaymentModal';
import { WalletScreen } from './components/WerkPayBank/WalletScreen';
import { ManagerAccountsScreen } from './components/WerkPayBank/ManagerAccountsScreen';
import { StaffCashRequestNotifier } from './components/WerkPayPOS/StaffCashRequestNotifier';
import { StaffPaalPairingNotifier } from './components/WerkPayPOS/StaffPaalPairingNotifier';
import { SupabaseModal } from './components/SupabaseModal';
import { GitHubExportModal } from './components/GitHubExportModal';
import { DigitalPhone } from './components/DigitalPhone/DigitalPhone';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';
import { PickupControlScreen } from './components/WerkPayPOS/PickupControlScreen';
import { LoyaltyTerminalScreen } from './components/WerkPayPOS/LoyaltyTerminalScreen';
import { AppToast } from './components/AppToast';
import { TwoFactorChallengeModal } from './components/TwoFactorChallengeModal';
import { TwoFactorSetupModal } from './components/TwoFactorSetupModal';
import { SystemLockScreen } from './components/WerkPayPOS/SystemLockScreen';

const MainLayout: React.FC = () => {
  const { 
    appMode, 
    setAppMode, 
    posScreen, 
    setPosScreen,
    werkpayScreen,
    isBlocked,
    blockedReason,
    clientIp,
    deviceId,
    pending2FALogin,
    setPending2FALogin,
    currentPosUser,
    logoutPos,
    isSystemLocked,
    setIsSystemLocked
  } = useApp();

  const [showGithubModal, setShowGithubModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showSetup2FA, setShowSetup2FA] = useState<boolean>(false);

  const [managerSessionUnlocked, setManagerSessionUnlocked] = useState<boolean>(() => {
    if (!currentPosUser) return false;
    return sessionStorage.getItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`) === 'true';
  });

  // Automatically sync unlock status when posScreen or user changes
  React.useEffect(() => {
    if (currentPosUser) {
      setManagerSessionUnlocked(sessionStorage.getItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`) === 'true');
    } else {
      setManagerSessionUnlocked(false);
    }
  }, [posScreen, currentPosUser]);

  // Global keyboard shortcut to instantly lock the manager screen & block the system (NumpadEnter only)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'NumpadEnter') {
        e.preventDefault();
        if (currentPosUser) {
          sessionStorage.removeItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`);
          setManagerSessionUnlocked(false);
          setIsSystemLocked(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPosUser, setIsSystemLocked]);

  if (isBlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 text-center z-[999999]">
        <div className="max-w-md w-full bg-slate-900 border-2 border-rose-500/50 rounded-3xl p-8 space-y-6 shadow-2xl shadow-rose-950/50 animate-fadeIn">
          <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-rose-500 uppercase tracking-tight mb-2">
              🚫 Toegang Geblokkeerd
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Dit apparaat of IP-adres is door de beheerder op de zwarte lijst geplaatst en kan momenteel geen acties of bestellingen uitvoeren.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left font-mono text-[11px] space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">IP-adres:</span>
              <span className="text-amber-300 font-bold">{clientIp || 'Detecteren...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Apparaat ID:</span>
              <span className="text-cyan-300 font-bold">{deviceId}</span>
            </div>
            <div className="pt-2 border-t border-slate-800 text-rose-400">
              <span className="text-slate-500 block mb-0.5">Reden van blokkade:</span>
              <span>{blockedReason}</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-500">
            Neem contact op met de beheerder of kassaverantwoordelijke als je denkt dat dit een vergissing is.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* GitHub Deployment Auto-Update Listener & Banner */}
      <AutoUpdateBanner />

      {/* Universal Top Header */}
      <Header onOpenGithub={() => setShowGithubModal(true)} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Werkdonalds POS screens */}
        {appMode === 'pos' && (
          <>
            {posScreen === 'kassa' && (
              <PosScreen onOpenPaymentModal={() => setShowPaymentModal(true)} />
            )}
            {posScreen === 'keuken' && <KitchenScreen />}
            {posScreen === 'afhaal' && <PickupScreen />}
            {posScreen === 'pickup_control' && <PickupControlScreen />}
            {posScreen === 'voorraad' && <InventoryScreen />}
            {posScreen === 'manager' && (
              managerSessionUnlocked ? (
                <ManagerScreen />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-slate-950 p-4 sm:p-6">
                  {currentPosUser?.is_2fa_enabled ? (
                    <TwoFactorChallengeModal
                      username={currentPosUser.username}
                      userTitle="Manager Dashboard"
                      onSuccess={() => {
                        sessionStorage.setItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`, 'true');
                        setManagerSessionUnlocked(true);
                      }}
                      onCancel={() => {
                        setPosScreen('kassa');
                      }}
                    />
                  ) : (
                    <div className="bg-slate-900 border border-purple-500/40 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-6 text-white text-center">
                      <div className="w-16 h-16 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto shadow-lg shadow-purple-950/50">
                        <Lock className="w-8 h-8 animate-pulse text-purple-300" />
                      </div>
                      <div className="space-y-1.5">
                        <h2 className="text-xl font-black text-purple-400">🔒 2FA Setup Verplicht</h2>
                        <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                          Om toegang te krijgen tot de managerinstellingen is tweestapsverificatie (2FA) verplicht. Stel nu 2FA in om door te gaan.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSetup2FA(true)}
                        className="w-full py-3.5 rounded-2xl font-black text-sm bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
                      >
                        <span>🔑 Start 2FA Inschakelen</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
            {posScreen === 'volgscherm' && <OrderTrackingScreen />}
            {posScreen === 'loyalty_terminal' && <LoyaltyTerminalScreen />}
          </>
        )}

        {/* WerkPay Bank screens */}
        {appMode === 'werkpay' && (
          <>
            {(werkpayScreen === 'wallet' || werkpayScreen === 'overboeken') && <WalletScreen />}
            {werkpayScreen === 'accounts' && <ManagerAccountsScreen />}
          </>
        )}

        {/* Split screen testing mode: POS left, WerkPay Bank right */}
        {appMode === 'split' && (
          <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-108px)] overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* Left side: POS Kassa */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-between">
                <span>🍔 Werkdonalds Kassa (Bestellen &amp; Afrekenen)</span>
                <span className="text-[10px] text-slate-400">Live Test Mode</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <PosScreen onOpenPaymentModal={() => setShowPaymentModal(true)} />
              </div>
            </div>

            {/* Right side: WerkPay Bank */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-between">
                <span>💳 WerkPay Digitale Bank (Saldo &amp; Transacties)</span>
                <span className="text-[10px] text-slate-400">Realtime Saldo Updates</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <WalletScreen />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Global Modals & Notifications */}
      <AppToast />
      <StaffCashRequestNotifier />
      <StaffPaalPairingNotifier />
      <ReceiptModal />
      {showPaymentModal && (
        <PaymentModal onClose={() => setShowPaymentModal(false)} />
      )}
      {appMode === 'setup' && (
        <SupabaseModal onClose={() => setAppMode('pos')} />
      )}
      <GitHubExportModal isOpen={showGithubModal} onClose={() => setShowGithubModal(false)} />
      <DigitalPhone />
      {showSetup2FA && currentPosUser && (
        <TwoFactorSetupModal
          username={currentPosUser.username}
          onClose={() => setShowSetup2FA(false)}
          onSuccess={() => {
            setShowSetup2FA(false);
          }}
        />
      )}
      {pending2FALogin && (
        <TwoFactorChallengeModal
          username={pending2FALogin.user.username}
          userTitle={pending2FALogin.loginType === 'pos' ? 'POS Kassa' : 'WerkPay Bank'}
          onSuccess={() => {
            // Confirm pending login state
          }}
          onCancel={() => setPending2FALogin(null)}
        />
      )}
      <SystemLockScreen />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
