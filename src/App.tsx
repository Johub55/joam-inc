import React, { useState, Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { Header } from './components/Header';
import { PosScreen } from './components/WerkPayPOS/PosScreen';
import { ReceiptModal } from './components/WerkPayPOS/ReceiptModal';
import { PaymentModal } from './components/WerkPayPOS/PaymentModal';
import { StaffCashRequestNotifier } from './components/WerkPayPOS/StaffCashRequestNotifier';
import { StaffPaalPairingNotifier } from './components/WerkPayPOS/StaffPaalPairingNotifier';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';
import { AppToast } from './components/AppToast';
import { TwoFactorChallengeModal } from './components/TwoFactorChallengeModal';
import { TwoFactorSetupModal } from './components/TwoFactorSetupModal';
import { SystemLockScreen } from './components/WerkPayPOS/SystemLockScreen';

const KitchenScreen = lazy(() => import('./components/WerkPayPOS/KitchenScreen').then(m => ({ default: m.KitchenScreen })));
const PickupScreen = lazy(() => import('./components/WerkPayPOS/PickupScreen').then(m => ({ default: m.PickupScreen })));
const PickupControlScreen = lazy(() => import('./components/WerkPayPOS/PickupControlScreen').then(m => ({ default: m.PickupControlScreen })));
const InventoryScreen = lazy(() => import('./components/WerkPayPOS/InventoryScreen').then(m => ({ default: m.InventoryScreen })));
const ManagerScreen = lazy(() => import('./components/WerkPayPOS/ManagerScreen').then(m => ({ default: m.ManagerScreen })));
const OrderTrackingScreen = lazy(() => import('./components/WerkPayPOS/OrderTrackingScreen').then(m => ({ default: m.OrderTrackingScreen })));
const LoyaltyTerminalScreen = lazy(() => import('./components/WerkPayPOS/LoyaltyTerminalScreen').then(m => ({ default: m.LoyaltyTerminalScreen })));
const WalletScreen = lazy(() => import('./components/WerkPayBank/WalletScreen').then(m => ({ default: m.WalletScreen })));
const ManagerAccountsScreen = lazy(() => import('./components/WerkPayBank/ManagerAccountsScreen').then(m => ({ default: m.ManagerAccountsScreen })));
const SupabaseModal = lazy(() => import('./components/SupabaseModal').then(m => ({ default: m.SupabaseModal })));
const GitHubExportModal = lazy(() => import('./components/GitHubExportModal').then(m => ({ default: m.GitHubExportModal })));
const DigitalPhone = lazy(() => import('./components/DigitalPhone/DigitalPhone').then(m => ({ default: m.DigitalPhone })));

const ScreenLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
    <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-5 py-3 rounded-2xl shadow-xl">
      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
      <span className="text-sm font-bold">Scherm laden...</span>
    </div>
  </div>
);

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
    posUsers,
    bankAccounts,
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

  const manager2FARequired = React.useMemo(() => {
    if (!currentPosUser) return false;
    const cleanU = currentPosUser.username.toLowerCase();
    const posMatch = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const bankMatch = bankAccounts.find(a => a.username.toLowerCase() === cleanU);
    return Boolean(
      (currentPosUser.is_2fa_enabled && currentPosUser.totp_secret) ||
      (posMatch?.is_2fa_enabled && posMatch?.totp_secret) ||
      (bankMatch?.is_2fa_enabled && bankMatch?.totp_secret)
    );
  }, [currentPosUser, posUsers, bankAccounts]);

  // Automatically lock manager menu whenever leaving it or switching users/app modes
  React.useEffect(() => {
    if (!currentPosUser) {
      setManagerSessionUnlocked(false);
      return;
    }
    const key = `wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`;
    if (appMode !== 'pos' || posScreen !== 'manager') {
      try { sessionStorage.removeItem(key); } catch {}
      setManagerSessionUnlocked(false);
    } else {
      setManagerSessionUnlocked(sessionStorage.getItem(key) === 'true');
    }
  }, [appMode, posScreen, currentPosUser]);

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
    <div className={`min-h-screen text-slate-100 flex flex-col font-sans select-none antialiased ${currentPosUser?.theme || 'bg-slate-950'}`}>
      {/* GitHub Deployment Auto-Update Listener & Banner */}
      <AutoUpdateBanner />

      {/* Universal Top Header */}
      <Header onOpenGithub={() => setShowGithubModal(true)} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Suspense fallback={<ScreenLoader />}>
          {/* WerkPay POS screens */}
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
                (!manager2FARequired || managerSessionUnlocked) ? (
                  <ManagerScreen />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-slate-950 p-4 sm:p-6">
                    <TwoFactorChallengeModal
                      username={currentPosUser?.username || ''}
                      userTitle="Manager Menu"
                      onSuccess={() => {
                        if (currentPosUser) {
                          sessionStorage.setItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`, 'true');
                        }
                        setManagerSessionUnlocked(true);
                      }}
                      onCancel={() => {
                        setPosScreen('kassa');
                      }}
                    />
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
                  <span>🍔 WerkPay Kassa (Bestellen &amp; Afrekenen)</span>
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
        </Suspense>
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
        <Suspense fallback={null}>
          <SupabaseModal onClose={() => setAppMode('pos')} />
        </Suspense>
      )}
      {showGithubModal && (
        <Suspense fallback={null}>
          <GitHubExportModal isOpen={showGithubModal} onClose={() => setShowGithubModal(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <DigitalPhone />
      </Suspense>
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
          onSuccess={() => {}}
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
