import React, { useEffect, useMemo, useState } from 'react';
import {
  detectFlasherCapabilities,
  exportCppUf2ForMobileOrDownload,
  flashCppUf2ViaDirectoryPicker,
  generateConfiguredPicoIno
} from '../../services/picoFlasher';
import { showToast } from '../../services/appToast';
import {
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  Info,
  Loader2,
  Share2,
  Smartphone,
  Terminal,
  Wifi
} from 'lucide-react';

interface PicoFlasherPanelProps {
  compact?: boolean;
}

export const PicoFlasherPanel: React.FC<PicoFlasherPanelProps> = ({ compact = false }) => {
  const caps = useMemo(() => detectFlasherCapabilities(), []);

  const [wifiSsid, setWifiSsid] = useState<string>(() => {
    try {
      return localStorage.getItem('wp_pico_wifi_ssid') || '';
    } catch {
      return '';
    }
  });
  const [wifiPass, setWifiPass] = useState<string>(() => {
    try {
      return localStorage.getItem('wp_pico_wifi_pass') || '';
    } catch {
      return '';
    }
  });
  const [showPass, setShowPass] = useState<boolean>(false);
  const [lcdAddr, setLcdAddr] = useState<'auto' | '0x27' | '0x3F'>('auto');
  const [firmwareInfo, setFirmwareInfo] = useState<{ filename: string; sizeKb: number } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem('wp_pico_wifi_ssid', wifiSsid);
      localStorage.setItem('wp_pico_wifi_pass', wifiPass);
    } catch {}
  }, [wifiSsid, wifiPass]);

  useEffect(() => {
    fetch('/api/pico/firmware-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok) {
          setFirmwareInfo({
            filename: data.filename,
            sizeKb: Math.round((data.size || 0) / 1024)
          });
        }
      })
      .catch(() => {});
  }, []);

  const appendLog = (msg: string) => {
    const stamp = new Date().toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLogs((prev) => [`[${stamp}] ${msg}`, ...prev.slice(0, 35)]);
  };

  const wifiConfig = useMemo(
    () => ({
      ssid: wifiSsid,
      password: wifiPass,
      nfcBus: 'i2c' as const,
      lcdAddress: lcdAddr
    }),
    [wifiSsid, wifiPass, lcdAddr]
  );

  const runFlashAction = async (id: string, fn: () => Promise<void>) => {
    setBusyAction(id);
    try {
      await fn();
      showToast('C++ firmware klaar om te draaien op de Pico W!', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Onbekende fout tijdens flashen.';
      appendLog(`❌ ${msg}`);
      showToast(msg, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadConfiguredIno = () => {
    const { code, filename } = generateConfiguredPicoIno(wifiConfig);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    appendLog(`📥 ${filename} (C++ broncode met ingevulde WiFi) gedownload.`);
  };

  const platformLabel =
    caps.platform === 'android'
      ? 'Android Telefoon / Tablet (USB-OTG)'
      : caps.platform === 'ios'
      ? 'iPhone / iPad (USB-C Bestanden)'
      : 'Desktop / Laptop';

  return (
    <div className="space-y-3.5">
      {/* Platform & Firmware Overview */}
      <div className="rounded-2xl border border-cyan-500/35 bg-cyan-950/25 p-3.5 text-xs space-y-2 text-slate-200">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-black flex items-center gap-2 text-xs sm:text-sm text-white">
            {caps.platform === 'desktop' ? (
              <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span>Echte C++ Firmware (.UF2) · {platformLabel}</span>
          </div>
          {firmwareInfo && (
            <span className="text-[11px] font-mono text-cyan-300">
              {firmwareInfo.filename} · {firmwareInfo.sizeKb} KB
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          Geen MicroPython en geen Arduino IDE meer nodig: je flasht in <strong>1 stap</strong> de vooraf gecompileerde{' '}
          <strong>C++ firmware</strong> (PN532 I2C NFC, 16x2 I2C LCD, ghost-vrij keypad &amp; Cloud Keep-Alive) met jouw WiFi direct in het <code>.UF2</code> bestand gebakken.
        </p>

        <div className="text-[11px] text-cyan-300/90 font-semibold">
          {caps.hasDirectoryPicker
            ? 'Direct 1-klik flashen naar RPI-RP2 beschikbaar · of handmatige .UF2 download'
            : caps.platform === 'ios'
            ? 'iPad/iPhone: Gebruik USB-C adapter -> kopieer WerkPay_PicoW_Cpp.uf2 in Bestanden naar schijf RPI-RP2'
            : 'Telefoon/Tablet: Gebruik USB-OTG kabel -> kopieer WerkPay_PicoW_Cpp.uf2 naar schijf RPI-RP2'}
        </div>
      </div>

      {/* WiFi & LCD Settings */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
        <div className="text-xs font-black text-white flex items-center gap-2">
          <Wifi className="w-4 h-4 text-cyan-400" />
          <span>1. WiFi &amp; Scherm Instellingen (worden in C++ .UF2 gebakken)</span>
        </div>
        <div className={`grid gap-2.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">WiFi Naam (SSID)</label>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              placeholder="Bijv. MijnWiFi"
              className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">WiFi Wachtwoord</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={wifiPass}
                onChange={(e) => setWifiPass(e.target.value)}
                placeholder="Wachtwoord..."
                className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">I2C LCD Adres</label>
            <select
              value={lcdAddr}
              onChange={(e) => setLcdAddr(e.target.value as any)}
              className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="auto">Automatisch (0x27 / 0x3F)</option>
              <option value="0x27">Vast: 0x27</option>
              <option value="0x3F">Vast: 0x3F</option>
            </select>
          </div>
        </div>
      </div>

      {/* 1-Step Flash C++ UF2 */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
        <div>
          <div className="text-xs font-black text-white">
            2. Flash C++ Firmware (.UF2) in 1 stap op je Pico W
          </div>
          <ol className="text-[11px] text-slate-400 mt-1.5 space-y-1 list-decimal list-inside leading-relaxed">
            <li>
              Houd de witte <strong>BOOTSEL</strong> knop op de Pico W ingedrukt terwijl je hem met USB
              {caps.isMobileOrTablet ? ' (via USB-OTG / USB-C)' : ''} aansluit.
            </li>
            <li>
              Laat BOOTSEL los zodra de USB-schijf <code className="text-cyan-300 font-bold">RPI-RP2</code> verschijnt.
            </li>
            <li>
              Flash of kopieer <code className="text-emerald-300">WerkPay_PicoW_Cpp.uf2</code> naar{' '}
              <code className="text-cyan-300 font-bold">RPI-RP2</code> — de Pico herstart vanzelf en draait direct C++!
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          {caps.hasDirectoryPicker && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runFlashAction('cpp_uf2_dir', () =>
                  flashCppUf2ViaDirectoryPicker(wifiConfig, appendLog)
                )
              }
              className="flex-1 min-w-[210px] min-h-[46px] py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              {busyAction === 'cpp_uf2_dir' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              <span>Kies RPI-RP2 &amp; Flash C++ .UF2</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runFlashAction('cpp_uf2_export', () =>
                exportCppUf2ForMobileOrDownload(wifiConfig, appendLog, caps.isMobileOrTablet)
              )
            }
            className={`flex-1 min-w-[210px] min-h-[46px] py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition ${
              caps.hasDirectoryPicker
                ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/20'
            } disabled:opacity-50`}
          >
            {busyAction === 'cpp_uf2_export' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : caps.isMobileOrTablet && caps.hasFileShare ? (
              <Share2 className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>
              {caps.isMobileOrTablet
                ? 'Zet C++ .UF2 op RPI-RP2 (Bestanden)'
                : 'Download C++ .UF2 (met WiFi)'}
            </span>
          </button>
        </div>

        {/* Arduino .INO fallback */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400">
            Liever zelf compileren in Arduino IDE v2?
          </span>
          <button
            type="button"
            onClick={handleDownloadConfiguredIno}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1.5"
          >
            <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Download C++ Broncode (.INO)</span>
          </button>
        </div>
      </div>

      {/* Live Flash Console */}
      <div className="bg-black/80 border border-slate-800 rounded-2xl p-3 font-mono text-[11px] text-emerald-300 space-y-1">
        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1.5 mb-1">
          <span className="flex items-center gap-1.5 font-sans font-bold text-[11px]">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>C++ Flasher Log</span>
          </span>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 font-sans"
            >
              Wissen
            </button>
          )}
        </div>
        {logs.length === 0 ? (
          <div className="text-slate-500 flex items-center gap-1.5 py-1 font-sans">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Vul hierboven je WiFi in en klik op Flash C++ .UF2 (zet Pico W eerst in BOOTSEL-modus).</span>
          </div>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {logs.map((line, i) => (
              <div key={i} className="leading-snug">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
