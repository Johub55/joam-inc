import React, { useState } from 'react';
import { 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  Github, 
  Database, 
  CreditCard, 
  Utensils, 
  X, 
  Sparkles,
  HelpCircle,
  FileCode
} from 'lucide-react';
import { UNIFIED_SUPABASE_SQL } from '../services/sqlScripts';

interface GitHubExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubExportModal: React.FC<GitHubExportModalProps> = ({ isOpen, onClose }) => {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (content: string, fileName: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = content;
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
    setCopiedFile(fileName);
    setTimeout(() => setCopiedFile(null), 2500);
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      // Fallback
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <span>GitHub Bestanden &amp; Losse HTML Export</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                  Klaar voor GitHub
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Beide programma's zijn nu beschikbaar als 100% losse, zelfstandige HTML-bestanden + SQL voor Supabase.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          
          {/* Quick Confirmation Box */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-emerald-300">
                Ja, ik begrijp je precies en het staat voor je klaar!
              </h4>
              <p className="text-slate-300 mt-1 leading-relaxed">
                Je hebt gevraagd om: 
                <strong> 1) Beide programma's los</strong>, 
                <strong> 2) Gewoon alleen een HTML bestand per app voor GitHub</strong> (geen ingewikkelde build tools of npm install nodig), en 
                <strong> 3) Een SQL bestand voor beide servers</strong>.
                Hieronder download je direct de 3 bestanden:
              </p>
            </div>
          </div>

          {/* 3 Downloadable Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* CARD 1: Werkdonalds POS */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Alleen 1 HTML
                  </span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Werkdonalds POS</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Kassasysteem, Keukenscherm (KDS), Afhaal TV met omroep stem, en voorraadbeheer in 1 bestand.
                  </p>
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-amber-300 border border-slate-800 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  <span>werkpay.html</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-2">
                <button
                  onClick={() => handleDownload('/werkpay.html', 'werkpay.html')}
                  className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download werkpay.html</span>
                </button>

                <div className="flex gap-2">
                  <a
                    href="/werkpay.html"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-center text-[11px] font-medium transition flex items-center justify-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Live</span>
                  </a>
                  <button
                    onClick={async () => {
                      const res = await fetch('/werkpay.html');
                      const text = await res.text();
                      handleCopy(text, 'werkpay');
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition flex items-center justify-center gap-1"
                  >
                    {copiedFile === 'werkpay' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Gekopieerd!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Kopieer Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 2: WerkPay Bank */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/40 transition shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Alleen 1 HTML
                  </span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">WerkPay Bank</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Digitale bankpas met 16-cijferige UID, pincode, live saldo, overboeken en transactieoverzicht.
                  </p>
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-cyan-300 border border-slate-800 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  <span>werkpay.html</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-2">
                <button
                  onClick={() => handleDownload('/werkpay.html', 'werkpay.html')}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download werkpay.html</span>
                </button>

                <div className="flex gap-2">
                  <a
                    href="/werkpay.html"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-center text-[11px] font-medium transition flex items-center justify-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Live</span>
                  </a>
                  <button
                    onClick={async () => {
                      const res = await fetch('/werkpay.html');
                      const text = await res.text();
                      handleCopy(text, 'werkpay');
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition flex items-center justify-center gap-1"
                  >
                    {copiedFile === 'werkpay' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Gekopieerd!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Kopieer Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 3: Database SQL */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/40 transition shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Database className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Supabase / SQL
                  </span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Database SQL Schema</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Alle tabellen voor beide servers, de RPC functies, realtime sync en demo accounts.
                  </p>
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-emerald-300 border border-slate-800 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  <span>database.sql</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-2">
                <button
                  onClick={() => handleDownload('/database.sql', 'database.sql')}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download database.sql</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(UNIFIED_SUPABASE_SQL, 'database')}
                    className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition flex items-center justify-center gap-1"
                  >
                    {copiedFile === 'database' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">SQL Gekopieerd!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Kopieer SQL Query</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Step by Step Guide for GitHub & GitHub Pages */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Github className="w-4 h-4 text-indigo-400" />
              <span>Hoe zet je dit in GitHub en activeer je GitHub Pages?</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] leading-relaxed text-slate-300">
              <div className="space-y-2 bg-slate-900/50 p-3.5 rounded-xl border border-slate-800/60">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>🍔</span> Optie A: Twee aparte GitHub Repositories (Aanbevolen)
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                  <li>Maak op GitHub een repository aan, bijv. <strong>werkpay</strong>.</li>
                  <li>Upload <code className="text-amber-300">werkpay.html</code> en noem het bestand <code className="text-amber-300 font-bold">index.html</code>.</li>
                  <li>Ga in de repository naar <strong>Settings → Pages</strong>, kies branch <strong>main</strong> en klik <strong>Save</strong>. Je Werkdonalds app is nu direct gratis online!</li>
                  <li>Herhaal ditzelfde voor een 2e repository <strong>werkpay</strong> met <code className="text-cyan-300">werkpay.html</code> (als <code className="text-cyan-300 font-bold">index.html</code>).</li>
                </ol>
              </div>

              <div className="space-y-2 bg-slate-900/50 p-3.5 rounded-xl border border-slate-800/60">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>🗄️</span> Supabase Database Koppeling
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                  <li>Ga naar <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-emerald-400 underline">supabase.com</a> en open je project.</li>
                  <li>Klik in het menu op <strong>SQL Editor</strong> en plak de inhoud van <code className="text-emerald-300">database.sql</code>.</li>
                  <li>Klik op de groene knop <strong>RUN</strong>. Alle tabellen, RPC betaalfuncties en realtime sync worden direct klaargezet.</li>
                  <li>Klik in beide HTML-apps op het tandwieltje (⚙️) en vul je Supabase Project URL &amp; Anon Key in. Beide apps werken nu live samen!</li>
                </ol>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Beide bestanden bevatten Tailwind CSS CDN en Supabase JS — geen installatie nodig.
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
