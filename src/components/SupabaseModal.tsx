import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SCHEMA_ONLY_SUPABASE_SQL, BASIS_SUPABASE_SQL, UNIFIED_SUPABASE_SQL, SELF_HOSTED_LAPTOP_SQL, ZIMAOS_SUPABASE_SQL, ZERO_CHANGES_FREEZE_SQL, ZERO_CHANGES_UNFREEZE_SQL, SHADOWBAN_SECURITY_PATCH_SQL } from '../services/sqlScripts';
import { DEFAULT_PRODUCTS } from '../services/defaultProducts';
import { showToast } from '../services/appToast';
import { 
  Database, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Zap, 
  AlertCircle,
  Download,
  CloudUpload,
  RefreshCw,
  Shield,
  Laptop,
  Server,
  Globe,
  Wifi,
  Cpu,
  Network
} from 'lucide-react';

interface SupabaseModalProps {
  onClose: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({ onClose }) => {
  const { supabaseConfig, setSupabaseConfig, isSupabaseConfigured, resetProductsToDefault, tablesFrozen, toggleTablesFrozen } = useApp();
  const [copied, setCopied] = useState<boolean>(false);
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [syncMsg, setSyncMsg] = useState<{ success: boolean; text: string } | null>(null);

  // SQL Script variant: 'schema_only', 'basis', 'full', 'laptop', or 'zimaos'
  const [sqlVariant, setSqlVariant] = useState<'schema_only' | 'basis' | 'full' | 'laptop' | 'zimaos'>('schema_only');

  const [url, setUrl] = useState<string>(supabaseConfig.supabaseUrl || '');
  const [anonKey, setAnonKey] = useState<string>(supabaseConfig.supabaseAnonKey || '');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const activeSqlCode = 
    sqlVariant === 'schema_only' ? SCHEMA_ONLY_SUPABASE_SQL :
    sqlVariant === 'basis' ? BASIS_SUPABASE_SQL :
    sqlVariant === 'laptop' ? SELF_HOSTED_LAPTOP_SQL :
    sqlVariant === 'zimaos' ? ZIMAOS_SUPABASE_SQL :
    UNIFIED_SUPABASE_SQL;



  const handleCopySql = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(activeSqlCode);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = activeSqlCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn("Fallback copy method used due to clipboard error:", e);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadSql = () => {
    const filename = 
      sqlVariant === 'schema_only' ? 'database-schema-only.sql' :
      sqlVariant === 'basis' ? 'database-basis.sql' :
      'database.sql';

    const blob = new Blob([activeSqlCode], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const handleCloudSyncProducts = async () => {
    setSyncingCloud(true);
    setSyncMsg(null);
    try {
      resetProductsToDefault();
      setSyncMsg({
        success: true,
        text: `Alle ${DEFAULT_PRODUCTS.length} WerkPay POS artikelen zijn lokaal klaargezet en direct verzonden naar je Supabase database!`
      });
    } catch (err: any) {
      setSyncMsg({
        success: false,
        text: `Fout bij synchroniseren: ${err?.message || 'Controleer je verbinding'}`
      });
    } finally {
      setTimeout(() => setSyncingCloud(false), 800);
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseConfig({
      supabaseUrl: url.trim(),
      supabaseAnonKey: anonKey.trim()
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/60 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <span>Supabase Integratie &amp; SQL Handleiding</span>
                {isSupabaseConfigured ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                    ⚡ Verbonden
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                    💾 Lokale Simulatie Actief
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Wat moet je doen in Supabase? Volg deze stappen om WerkPay POS en WerkPay Bank te koppelen.
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

        {/* Action Bar (Reset) */}
        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Configuratie Beheer</span>
            <button
                onClick={() => {
                    localStorage.removeItem('wd_sb_cfg');
                    window.location.reload();
                }}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition"
            >
                Reset Verbinding
            </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          
          {/* Why & How explanation card */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <h3 className="font-extrabold text-sm text-emerald-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Waarom en hoe werken de twee apps samen in Supabase?
            </h3>
            <p className="leading-relaxed text-slate-300">
              Voorheen waren WerkPay POS (kassa) en WerkPay (bank) twee losse systemen. Nu delen ze één centrale, veilige database:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong>Atomische RPC betalingen:</strong> De opgeslagen functies (<code className="text-emerald-300 font-mono">werkpay_charge_by_login</code> en <code className="text-emerald-300 font-mono">werkpay_charge_by_card</code>) controleren het banksaldo en boeken het geld in 1 ondeelbare database-transactie af. Hierdoor ontstaat er nooit een discrepantie tussen kassa en bank.
              </li>
              <li>
                <strong>Live Synchronisatie:</strong> Bestelt een klant aan de kassa of kiosk, dan ziet de keuken het direct op het Keukenscherm (KDS), en het Afhaalscherm (TV) roept het bestelnummer om zodra de keuken op gereed klikt.
              </li>
              <li>
                <strong>Centraal Klant- &amp; Saldooverzicht:</strong> In WerkPay ziet de klant direct zijn betaling aan WerkPay POS in zijn rekeningoverzicht.
              </li>
            </ul>
          </div>

          {/* 4 Step Action Guide */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
              Wat moet jij doen in Supabase? (4 simpele stappen)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center mb-1">
                  1
                </span>
                <strong className="text-white block">Open de SQL Editor</strong>
                <p className="text-slate-400">
                  Ga in je Supabase project dashboard naar het linkermenu en klik op het <strong>SQL Editor</strong> icoon.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center mb-1">
                  2
                </span>
                <strong className="text-white block">Maak een Nieuwe Query</strong>
                <p className="text-slate-400">
                  Klik bovenaan op <strong>+ New query</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center mb-1">
                  3
                </span>
                <strong className="text-white block">Plak het Gecombineerde SQL Script</strong>
                <p className="text-slate-400">
                  Klik hieronder op <em>"Kopieer SQL Script"</em> en plak alle SQL-code in het query-invoerveld.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center mb-1">
                  4
                </span>
                <strong className="text-white block">Klik op RUN (Uitvoeren)</strong>
                <p className="text-slate-400">
                  Klik op de groene knop <strong>RUN</strong> rechtsonder. Alle tabellen, RPC-functies en demo-accounts worden in enkele seconden aangemaakt!
                </p>
              </div>
            </div>
          </div>

          {/* SQL Copy & Download Box */}
          <div className="space-y-3">
            
            {/* Variant Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-950 border border-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setSqlVariant('schema_only')}
                className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  sqlVariant === 'schema_only'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>🛡️ Schema Only (Geen Reset)</span>
              </button>

              <button
                type="button"
                onClick={() => setSqlVariant('basis')}
                className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  sqlVariant === 'basis'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>📄 Basis Tabellen</span>
              </button>

              <button
                type="button"
                onClick={() => setSqlVariant('full')}
                className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  sqlVariant === 'full'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>📦 Volledig + Seed</span>
              </button>

              <button
                type="button"
                onClick={() => setSqlVariant('laptop')}
                className={`flex-1 min-w-[130px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  sqlVariant === 'laptop'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>💻 Oude Laptop</span>
              </button>

              <button
                type="button"
                onClick={() => setSqlVariant('zimaos')}
                className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  sqlVariant === 'zimaos'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 font-extrabold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>⚡ ZimaOS &amp; Remote</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-200 block text-xs">
                  {sqlVariant === 'schema_only' && '🛡️ Schema Only (Aanbevolen voor bestaande projecten)'}
                  {sqlVariant === 'basis' && '📄 Basis Schema (Alleen 5 kern-tabellen)'}
                  {sqlVariant === 'full' && '📦 Volledige Unificatie + Standaard Menu Data'}
                  {sqlVariant === 'laptop' && '💻 Self-Hosted Script voor Oude Laptop / Docker Database'}
                  {sqlVariant === 'zimaos' && '⚡ ZimaOS Server & Externe Netwerken (Tailscale / 4G / Cloudflare)'}
                </span>
                <span className="text-[10px] text-emerald-400 font-medium">
                  {sqlVariant === 'schema_only' && '✓ Inclusief Telefoon Chat, Cash, Audit logs, RLS & Realtime — ZONDER jouw producten te overschrijven'}
                  {sqlVariant === 'basis' && '✓ Uitsluitend de basis-tabellen voor snelle opstart'}
                  {sqlVariant === 'full' && '✓ Alle tabellen + 138 standaard producten (ON CONFLICT DO NOTHING)'}
                  {sqlVariant === 'laptop' && '✓ Geoptimaliseerd voor eigen Docker / PostgreSQL op een oude laptop op je lokale netwerk'}
                  {sqlVariant === 'zimaos' && '✓ Geoptimaliseerd voor ZimaOS met Tailscale / Cloudflare Tunnel voor toegang vanaf elk ander netwerk'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSql}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                  <span>{downloaded ? 'Gedownload!' : 'Download .sql'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow ${
                    copied 
                      ? 'bg-emerald-500 text-slate-950' 
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Gekopieerd!' : 'Kopieer SQL'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56 leading-relaxed select-all">
                {activeSqlCode}
              </pre>
            </div>

            {/* Direct Cloud Push Button */}
            <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <strong className="text-blue-300 text-xs flex items-center gap-1.5">
                  <CloudUpload className="w-4 h-4" />
                  Direct alle 138 producten naar de cloud sturen?
                </strong>
                <p className="text-[11px] text-slate-400">
                  Als je al verbonden bent met Supabase, hoef je de SQL niet eens handmatig te plakken.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloudSyncProducts}
                disabled={syncingCloud}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition shadow shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                <span>{syncingCloud ? 'Synchroniseren...' : 'Push 138 Producten'}</span>
              </button>
            </div>

            {/* Quick Status / RLS Fix Snippets for Supabase */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* 1-Klik 0-Veranderingen Tabel-Slot & Nep-Rechten Box */}
              <div className={`p-4 rounded-2xl space-y-3 col-span-1 sm:col-span-2 border ${
                tablesFrozen
                  ? 'bg-rose-950/50 border-rose-500/60 shadow-lg shadow-rose-500/10'
                  : 'bg-purple-950/35 border-purple-500/40'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-white flex items-center gap-2">
                      {tablesFrozen ? '🔒 TABELLEN BEVROREN (0-Veranderingen Slot ACTIEF!)' : '🛡️ 1-Klik 0-Veranderingen Slot & Nep-Rechten (Zonder SQL nodig!)'}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ⚡ Automatisch Online via perms
                      </span>
                    </span>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      <strong>Nep-Rechten (👻 Shadowban)</strong> en <strong>Account-Blokkades</strong> werken nu <strong>100% automatisch online</strong> via de al bestaande <code className="text-purple-300 font-mono">perms</code> kolom in Supabase — je hoeft dus <strong>zelf 0 SQL aan te passen</strong>! Wil je daarnaast met 1 klik zorgen dat er <strong>0 veranderingen aan de tabellen</strong> kunnen worden gebracht? Gebruik de noodknop hieronder:
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await toggleTablesFrozen();
                      showToast(res.message, !tablesFrozen ? 'warning' : 'success');
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition shadow-lg shrink-0 flex items-center gap-2 ${
                      tablesFrozen
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    <span>{tablesFrozen ? '🔓 Ontgrendel Tabellen (Sta wijzigingen weer toe)' : '🔒 BEVRIJS TABELLEN NU (0 Veranderingen)'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(ZERO_CHANGES_FREEZE_SQL);
                      showToast('🔒 1-Regel "0-Veranderingen" SQL gekopieerd! Plak in Supabase SQL Editor om op server-niveau élke wijziging te blokkeren.', 'success');
                    }}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition text-left"
                  >
                    <strong className="block text-rose-300">📋 Kopieer Harde SQL Lock (1 regel)</strong>
                    <span className="text-[10px] text-slate-400">REVOKE INSERT, UPDATE, DELETE (0 veranderingen mogelijk op server)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(ZERO_CHANGES_UNFREEZE_SQL);
                      showToast('🔓 Ontgrendel SQL gekopieerd! Plak in Supabase om tabellen weer schrijfbaar te maken.', 'success');
                    }}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition text-left"
                  >
                    <strong className="block text-emerald-300">📋 Kopieer SQL Unlock (1 regel)</strong>
                    <span className="text-[10px] text-slate-400">GRANT ALL ON ALL TABLES (heft harde server-lock weer op)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(SHADOWBAN_SECURITY_PATCH_SQL);
                      showToast('👻 Nep-Rechten & RPC SQL Patch gekopieerd!', 'success');
                    }}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 transition text-left"
                  >
                    <strong className="block text-purple-300">📋 Kopieer Nep-Rechten SQL (Optioneel)</strong>
                    <span className="text-[10px] text-slate-400">Voegt extra kolommen &amp; server-lock RPC toe aan Supabase</span>
                  </button>
                </div>
              </div>

              {/* WerkLoyalty Customers SQL Snippet */}
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    🌟 WerkLoyalty Accounts (`loyalty_customers`)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const loyaltySql = `CREATE TABLE IF NOT EXISTS public.loyalty_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  coins NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  orders_count INT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'Brons',
  current_month_spent NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  last_month_spent NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  current_month_key TEXT DEFAULT '',
  months_below_target INT NOT NULL DEFAULT 0,
  vip_subscription_active BOOLEAN NOT NULL DEFAULT FALSE,
  vip_subscription_expires DATE,
  vouchers JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_spin_date TEXT,
  orders_today_count INT NOT NULL DEFAULT 0,
  joined_date TEXT DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.loyalty_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access loyalty_customers" ON public.loyalty_customers;
CREATE POLICY "Public full access loyalty_customers" ON public.loyalty_customers FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.loyalty_customers TO postgres, anon, authenticated, service_role;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_customers; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;`;
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(loyaltySql);
                        } else {
                          const textArea = document.createElement("textarea");
                          textArea.value = loyaltySql;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-999999px";
                          textArea.style.top = "-999999px";
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                        }
                      } catch (e) {
                        console.warn("Fallback copy method used due to clipboard error:", e);
                      }
                      showToast('Loyalty Customers SQL gekopieerd! Plak dit in de Supabase SQL Editor om direct spaaraccounts in Supabase te synchroniseren.', 'success');
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg transition shrink-0"
                  >
                    📋 Kopieer Loyalty SQL
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Voer dit script uit in de Supabase SQL Editor om de <code className="text-amber-300 font-mono">loyalty_customers</code> tabel aan te maken. Dit zorgt ervoor dat nieuw aangemaakte accounts direct in Supabase verschijnen en over alle kassa's en spaarpalen worden gesynchroniseerd.
                </p>
              </div>

              {/* Cash Requests SQL Snippet */}
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    💵 Contant Verzoeken Realtime &amp; RLS
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cashSql = `CREATE TABLE IF NOT EXISTS public.cash_requests (
  id BIGSERIAL PRIMARY KEY,
  req_id TEXT UNIQUE,
  order_no INT DEFAULT 0,
  order_type TEXT DEFAULT 'takeaway',
  identifier TEXT DEFAULT '',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cashier TEXT DEFAULT 'Kassa',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  received NUMERIC(10, 2) DEFAULT 0.00,
  change NUMERIC(10, 2) DEFAULT 0.00,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS req_id TEXT;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS order_no INT DEFAULT 0;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'takeaway';
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS identifier TEXT DEFAULT '';
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS cashier TEXT DEFAULT 'Kassa';
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS received NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS change NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.cash_requests ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

ALTER TABLE public.cash_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access cash_requests" ON public.cash_requests;
CREATE POLICY "Public full access cash_requests" ON public.cash_requests FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.cash_requests TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_requests; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;`;
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(cashSql);
                        } else {
                          const textArea = document.createElement("textarea");
                          textArea.value = cashSql;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-999999px";
                          textArea.style.top = "-999999px";
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                        }
                      } catch (e) {
                        console.warn("Fallback copy method used due to clipboard error:", e);
                      }
                      showToast('Contant Verzoeken SQL gekopieerd! Plak dit in de Supabase SQL Editor om verzoeken direct over kassa-schermen te synchroniseren.', 'success');
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition shrink-0"
                  >
                    Kopieer Contant SQL
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Zorgt ervoor dat contante betaalverzoeken live tussen alle schermen gesynchroniseerd worden met RLS &amp; Realtime.
                </p>
              </div>

              {/* Phone Only SQL Snippet */}
              <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    📱 Alleen Telefoon SMS &amp; Realtime Toevoegen
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const phoneSql = `CREATE TABLE IF NOT EXISTS public.phone_messages (
  id BIGSERIAL PRIMARY KEY,
  contact_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.phone_messages ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE public.phone_messages ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE public.phone_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.phone_messages ADD COLUMN IF NOT EXISTS timestamp TEXT;

CREATE INDEX IF NOT EXISTS idx_phone_messages_contact ON public.phone_messages(contact_id);

ALTER TABLE public.phone_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access phone_messages" ON public.phone_messages;
CREATE POLICY "Public access phone_messages" ON public.phone_messages FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.phone_messages TO postgres, anon, authenticated, service_role;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.phone_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;`;
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(phoneSql);
                        } else {
                          const textArea = document.createElement("textarea");
                          textArea.value = phoneSql;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-999999px";
                          textArea.style.top = "-999999px";
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                        }
                      } catch (e) {
                        console.warn("Fallback copy method used due to clipboard error:", e);
                      }
                      showToast('Telefoon SQL gekopieerd! Plak dit in de Supabase SQL Editor om alleen de telefoon toe te voegen.', 'success');
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition shrink-0"
                  >
                    Kopieer Telefoon SQL
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Voegt uitsluitend de <code className="text-cyan-300">phone_messages</code> tabel en realtime toe aan een bestaande Supabase database zonder iets anders aan te raken.
                </p>
              </div>

              {/* RLS Order Status Fix Snippet */}
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    🛡️ Snelle RLS Fix (Bestelstatussen)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const rlsSql = `ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;\nGRANT ALL ON TABLE public.orders TO anon, authenticated, service_role;\nGRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`;
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(rlsSql);
                        } else {
                          const textArea = document.createElement("textarea");
                          textArea.value = rlsSql;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-999999px";
                          textArea.style.top = "-999999px";
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                        }
                      } catch (e) {
                        console.warn("Fallback copy method used due to clipboard error:", e);
                      }
                      showToast('RLS SQL gekopieerd! Plak dit in de Supabase SQL Editor om updates toe te staan.', 'success');
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg transition shrink-0"
                  >
                    Kopieer RLS Fix
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Als Supabase Row Level Security aan heeft staan zonder update-rechten, weigert de cloud database statuswijzigingen. Voer dit 2-regelig scriptje uit.
                </p>
              </div>

            </div>

            {syncMsg && (
              <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                syncMsg.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {syncMsg.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{syncMsg.text}</span>
              </div>
            )}
          </div>

          {/* Special Laptop Self-Hosting Card */}
          {sqlVariant === 'laptop' && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-extrabold text-sm">
                <Laptop className="w-5 h-5 text-amber-400" />
                <span>💻 Handleiding: Jouw Oude Laptop als Eigen Database Server</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-xs">
                Je kunt een oude laptop uitstekend ombouwen tot een supersnelle, gratis lokale database server voor je restaurant of kassa! Zo hoef je niets te betalen voor Supabase cloud.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/20 space-y-1">
                  <span className="font-bold text-amber-300 block">1. Docker op Oude Laptop</span>
                  <p className="text-slate-400 text-[11px]">
                    Installeer Linux (Ubuntu/Debian) of Windows met <strong>Docker Desktop</strong> op je oude laptop.
                  </p>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/20 space-y-1">
                  <span className="font-bold text-amber-300 block">2. Start Supabase / Postgres Container</span>
                  <p className="text-slate-400 text-[11px]">
                    Kloon Supabase Docker (<code className="text-amber-200">git clone https://github.com/supabase/supabase</code>) en voer <code className="text-amber-200">docker compose up -d</code> uit.
                  </p>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/20 space-y-1">
                  <span className="font-bold text-amber-300 block">3. Voer het SQL Script Uit</span>
                  <p className="text-slate-400 text-[11px]">
                    Open Supabase Studio op je laptop (<code className="text-amber-200">http://localhost:8000</code>) en plak het onderstaande SQL script.
                  </p>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/20 space-y-1">
                  <span className="font-bold text-amber-300 block">4. Vul Laptop IP In Bij Instellingen</span>
                  <p className="text-slate-400 text-[11px]">
                    Zoek het IP-adres van je laptop in je netwerk (bijv. <code className="text-amber-200">http://192.168.1.150:8000</code>) en vul het hieronder in!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Special ZimaOS & Externe Netwerken Card */}
          {sqlVariant === 'zimaos' && (
            <div className="bg-purple-950/40 border border-purple-500/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-purple-300 font-extrabold text-sm">
                <Globe className="w-5 h-5 text-purple-400" />
                <span>⚡ Handleiding: ZimaOS Database &amp; Toegang Vanaf Andere Netwerken</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-xs">
                <strong>Ja, dit kan 100% in ZimaOS!</strong> ZimaOS (op een ZimaBoard, ZimaCube of een oude laptop/PC geflasht met ZimaOS) is uitermate geschikt als jouw eigen privé cloud en database server.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-500/20 space-y-1">
                  <span className="font-bold text-purple-300 block flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    1. Installeer Database in ZimaOS
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    Open ZimaOS dashboard op je browser (<code className="text-purple-200">http://zimaos.local</code>). Ga naar de App Store of klik op <strong>+ Custom App (Docker Compose)</strong> en voeg PostgreSQL of Supabase toe.
                  </p>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-500/20 space-y-1">
                  <span className="font-bold text-purple-300 block flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-purple-400" />
                    2. Voer het SQL Script Uit
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    Open Supabase Studio op je ZimaOS server (<code className="text-purple-200">http://&lt;zimaos-ip&gt;:8000</code>) en plak het onderstaande SQL script voor alle tabellen &amp; RPC functies.
                  </p>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-500/20 space-y-1 col-span-1 md:col-span-2">
                  <span className="font-bold text-purple-300 block flex items-center gap-1.5 text-xs">
                    <Network className="w-4 h-4 text-purple-400" />
                    🌐 3. Hoe verbind je vanaf ANDERE NETWERKEN (4G/5G, thuis of externe filialen)?
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <div className="p-2 bg-slate-900 rounded-lg border border-purple-500/20">
                      <strong className="text-purple-200 block text-[11px]">🔑 Optie A: Tailscale (Aanbevolen)</strong>
                      <p className="text-[10px] text-slate-400">
                        Installeer <strong>Tailscale</strong> direct met 1-klik in de ZimaOS App Store. Installeer de gratis Tailscale app op je kassa/telefoon. Je kunt nu via het Tailscale IP (<code className="text-purple-300">http://100.x.y.z:8000</code>) vanaf <strong>ELK netwerk ter wereld</strong> (4G/5G) veilig verbinden!
                      </p>
                    </div>

                    <div className="p-2 bg-slate-900 rounded-lg border border-purple-500/20">
                      <strong className="text-purple-200 block text-[11px]">🌐 Optie B: Cloudflare Tunnel</strong>
                      <p className="text-[10px] text-slate-400">
                        Draai de Cloudflare Tunnel Docker container op ZimaOS. Hiermee geef je je ZimaOS database gratis een openbaar HTTPS domein (bijv. <code className="text-purple-300">https://db.mijnrestaurant.nl</code>) zonder poorten open te zetten!
                      </p>
                    </div>

                    <div className="p-2 bg-slate-900 rounded-lg border border-purple-500/20">
                      <strong className="text-purple-200 block text-[11px]">🛡️ Optie C: Zima Client Remote ID</strong>
                      <p className="text-[10px] text-slate-400">
                        ZimaOS beschikt ingebouwd over Remote Access via Zima Account/Client ID voor beveiligde verbindingen buitenshuis.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Optional Supabase Credentials Connection */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white flex items-center gap-2">
                  <span>Verbind met jouw Supabase of Oude Laptop Database</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Cloud &amp; Self-Hosted Compatible
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Vul hieronder je Supabase Project URL (of het lokale IP-adres van je laptop, bijv. <code className="text-cyan-300">http://192.168.1.100:8000</code>) &amp; Anon Key in.
                </p>
              </div>
            </div>


            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-bold block mb-1">
                  Project URL (https://xxxx.supabase.co)
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://xyzproject.supabase.co"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-bold block mb-1">
                  Anon / Public API Key
                </label>
                <input
                  type="text"
                  value={anonKey}
                  onChange={e => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>

              {saveSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Supabase instellingen opgeslagen!</span>
                </div>
              )}

              <button
                type="submit"
                className="py-2 px-4 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition"
              >
                Instellingen Opslaan &amp; Verbinden
              </button>
            </form>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
