import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_PRODUCTS } from '../services/defaultProducts';
import { FIREBASE_PROJECT_ID, FIREBASE_DATABASE_ID } from '../services/firebase';
import {
  Cloud,
  CheckCircle2,
  X,
  Zap,
  RefreshCw,
  ShieldCheck,
  Database,
  Lock,
  Unlock,
  Activity,
  Sparkles,
  Wifi
} from 'lucide-react';

interface CloudSyncModalProps {
  onClose: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ onClose }) => {
  const {
    isOnline,
    isRealtimeActive,
    syncStatus,
    lastSyncTime,
    forceSyncNow,
    testConnection,
    resetProductsToDefault,
    tablesFrozen,
    toggleTablesFrozen,
    products,
    orders,
    bankAccounts,
    posUsers
  } = useApp();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [productSyncMsg, setProductSyncMsg] = useState<{ success: boolean; text: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Kon verbinding met Firebase Cloud Firestore niet testen.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCloudSyncProducts = async () => {
    setSyncingProducts(true);
    setProductSyncMsg(null);
    try {
      await resetProductsToDefault();
      setProductSyncMsg({
        success: true,
        text: `Alle ${DEFAULT_PRODUCTS.length} standaard Werkdonalds & Koekploeg producten (inclusief keuzemenu's) zijn gesynchroniseerd naar Firebase Firestore!`
      });
    } catch (err: any) {
      setProductSyncMsg({
        success: false,
        text: `Fout bij synchroniseren: ${err?.message || 'Controleer je internetverbinding'}`
      });
    } finally {
      setSyncingProducts(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/60 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <span>Firebase Cloud Realtime Sync</span>
                {isRealtimeActive ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                    ⚡ Live Realtime
                  </span>
                ) : isOnline ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono font-bold">
                    🔄 Verbonden
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                    💾 Offline Cache
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Automatische live cloud-synchronisatie voor alle kassa&apos;s, keukenschermen, spaarpaal en WerkPay Bank.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Laatste sync:{' '}
              <strong className="text-slate-200">
                {lastSyncTime ? lastSyncTime.toLocaleTimeString('nl-NL') : 'Live stream actief'}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
            >
              <Wifi className={`w-3.5 h-3.5 ${testing ? 'animate-pulse text-cyan-400' : 'text-cyan-400'}`} />
              <span>{testing ? 'Testen...' : 'Test Verbinding'}</span>
            </button>
            <button
              onClick={() => forceSyncNow()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>Nu Synchroniseren</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{testResult.message}</span>
            </div>
          )}

          {/* Overview card */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <h3 className="font-extrabold text-sm text-emerald-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Directe Firebase Cloud Synchronisatie (Zero-Setup)
            </h3>
            <p className="leading-relaxed text-slate-300">
              Werkdonalds POS en WerkPay Bank draaien volledig op Firebase Cloud Firestore. Alle apparaten (kassa, keuken,
              afhaal-TV, spaarpaal, digitale telefoon en Raspberry Pi Pico pinapparaat) ontvangen wijzigingen zonder vertraging.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-white">{products.length}</div>
                <div className="text-[10px] text-slate-400">Producten</div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-amber-400">{orders.length}</div>
                <div className="text-[10px] text-slate-400">Bestellingen</div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-cyan-400">{bankAccounts.length}</div>
                <div className="text-[10px] text-slate-400">WerkPay Rekeningen</div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-emerald-400">{posUsers.length}</div>
                <div className="text-[10px] text-slate-400">Medewerkers</div>
              </div>
            </div>
          </div>

          {/* Cloud info */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-white">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Actieve Cloud Omgeving</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Project ID</span>
                <span className="text-emerald-300 font-bold break-all">{FIREBASE_PROJECT_ID}</span>
              </div>
              <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Firestore Database</span>
                <span className="text-cyan-300 font-bold break-all">{FIREBASE_DATABASE_ID}</span>
              </div>
            </div>
          </div>

          {/* Maintenance & Freeze controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div>
                <h4 className="font-bold text-white flex items-center gap-2 text-xs">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Producten &amp; Keuzemenu&apos;s Herstellen</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Zet alle standaard menu-items inclusief keuzemenu&apos;s en recepten terug en sync ze direct naar Firebase.
                </p>
              </div>
              <button
                onClick={handleCloudSyncProducts}
                disabled={syncingProducts}
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingProducts ? 'animate-spin' : ''}`} />
                <span>{syncingProducts ? 'Synchroniseren...' : 'Reset & Sync Standaard Menu'}</span>
              </button>
              {productSyncMsg && (
                <p className={`text-[11px] font-semibold ${productSyncMsg.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {productSyncMsg.text}
                </p>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div>
                <h4 className="font-bold text-white flex items-center gap-2 text-xs">
                  {tablesFrozen ? (
                    <Lock className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Unlock className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>Productwijzigingen Vergrendelen (Freeze)</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  {tablesFrozen
                    ? 'Bevroren: tijdelijk zijn product-, prijs- en voorraadwijzigingen geblokkeerd.'
                    : 'Ontgrendeld: managers kunnen producten, prijzen en keuzemenu’s live aanpassen.'}
                </p>
              </div>
              <button
                onClick={() => toggleTablesFrozen()}
                className={`w-full py-2 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
                  tablesFrozen
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600/80 hover:bg-rose-600 text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{tablesFrozen ? 'Ontgrendel Cloud Tabellen' : 'Bevries Cloud Tabellen'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Alleen realtime Firebase Cloud Firestore actief — geen handmatige SQL scripts meer nodig.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
