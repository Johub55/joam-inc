import React, { useState, useEffect } from 'react';
import { 
  Tv, 
  Rss, 
  Radio, 
  Play, 
  Pause, 
  RotateCcw, 
  Send, 
  Sparkles, 
  AlertTriangle, 
  Check, 
  Volume2, 
  Clock, 
  Sliders, 
  Plus, 
  Trash2, 
  RefreshCw,
  Eye,
  ShieldCheck,
  Megaphone,
  Lock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { 
  getNewsConfig, 
  saveNewsConfig, 
  getCustomNewsItems, 
  saveCustomNewsItems, 
  NewsTickerConfig, 
  NewsItem, 
  REAL_NOS_FALLBACK_HEADLINES 
} from '../../services/newsService';
import { AudioFX } from '../../services/audio';

export const PickupControlScreen: React.FC = () => {
  const { orders, currentPosUser, canAccess, loginPos } = useApp();

  const [newsConfig, setNewsConfig] = useState<NewsTickerConfig>(getNewsConfig());
  const [customItems, setCustomItems] = useState<NewsItem[]>(getCustomNewsItems());
  const [activeTab, setActiveTab] = useState<'ticker' | 'presets' | 'broadcast' | 'status'>('ticker');

  const [customAlertInput, setCustomAlertInput] = useState<string>(newsConfig.customAlertText);
  const [newHeadlineTitle, setNewHeadlineTitle] = useState<string>('');
  const [newHeadlineCategory, setNewHeadlineCategory] = useState<string>('NOS Binnenland');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  const isAuthorized = canAccess('manager') || canAccess('pickup_control') || currentPosUser?.is_admin || currentPosUser?.username.toLowerCase() === 'joas';

  // Sync state when local events fire
  useEffect(() => {
    const handleUpdate = () => {
      setNewsConfig(getNewsConfig());
      setCustomItems(getCustomNewsItems());
    };
    window.addEventListener('wd_news_config_updated', handleUpdate);
    return () => window.removeEventListener('wd_news_config_updated', handleUpdate);
  }, []);

  if (!isAuthorized) {
    return (
      <div className="p-6 max-w-md mx-auto bg-slate-900 border-2 border-rose-600/60 rounded-3xl text-center shadow-2xl mt-8">
        <div className="w-16 h-16 bg-rose-600/20 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/40">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white uppercase tracking-tight">
          🔒 Manager / Regie Toegang Vereist
        </h2>
        <p className="text-xs text-slate-400 mt-2">
          De TV &amp; Nieuwsbalk Regie Hub is afgeschermd voor bevoegd personeel. Voer je beheerder PIN in.
        </p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const res = await loginPos('Joas', pinInput);
          if (res.success) {
            setPinError('');
            return;
          }
          const res2 = await loginPos('Manager', pinInput);
          if (res2.success) {
            setPinError('');
            return;
          }
          setPinError('Onjuiste beheerder PIN / wachtwoord!');
        }} className="mt-5 space-y-3">
          <input 
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="Voer PIN in (bijv. 1234)..."
            className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-mono text-center text-lg focus:border-rose-500 outline-none"
          />
          {pinError && <p className="text-xs text-rose-400 font-bold">{pinError}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-lg transition uppercase text-xs tracking-wider"
          >
            Ontgrendel TV Regie Hub
          </button>
        </form>
      </div>
    );
  }

  const handleUpdateConfig = (updates: Partial<NewsTickerConfig>) => {
    const updated = { ...newsConfig, ...updates, lastUpdated: Date.now() };
    setNewsConfig(updated);
    saveNewsConfig(updated);
    showTempSuccess('Nieuwsbalk instellingen live bijgewerkt op het TV-scherm!');
  };

  const showTempSuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeadlineTitle.trim()) return;

    const newItem: NewsItem = {
      id: `custom_${Date.now()}`,
      title: newHeadlineTitle.trim(),
      category: newHeadlineCategory,
      pubDate: 'Zojuist',
      source: 'Aangepast Bericht',
      isUrgent: true
    };

    const updated = [newItem, ...customItems];
    setCustomItems(updated);
    saveCustomNewsItems(updated);
    setNewHeadlineTitle('');
    showTempSuccess('Aangepast nieuwsbericht toegevoegd aan de ticker!');
  };

  const handleDeleteCustomItem = (id: string) => {
    const updated = customItems.filter(it => it.id !== id);
    setCustomItems(updated);
    saveCustomNewsItems(updated);
    showTempSuccess('Bericht verwijderd uit de nieuwsfeed.');
  };

  // Get active items currently playing on TV
  const fallbackList = REAL_NOS_FALLBACK_HEADLINES[newsConfig.category] || REAL_NOS_FALLBACK_HEADLINES.general;
  const currentTvHeadlines = [
    ...(newsConfig.isCustomAlertActive ? [{ id: 'alert_cur', title: newsConfig.customAlertText, category: '🚨 SPOEDBERICHT', pubDate: 'Zojuist', source: 'Aangepast Bericht' as const, isUrgent: true }] : []),
    ...customItems,
    ...fallbackList
  ];

  const readyOrders = orders.filter(o => o.status === 'klaar' && o.orderType !== 'delivery');
  const prepOrders = orders.filter(o => (o.status === 'wachten' || o.status === 'bereiden' || o.status === 'inpakken') && o.orderType !== 'delivery');

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-3 sm:p-6 overflow-y-auto custom-scroll space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xl shadow-lg shadow-rose-950/50">
              📺
            </div>
            <div>
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                <span>Afhaalscherm &amp; NOS Nieuwsbalk Beheer</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-600/30 text-rose-300 font-bold border border-rose-500/40">
                  LIVE TV REGIE
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Beheer het nieuws op de TV, stuur spoedmeldingen en bekijk live wat er op het afhaalscherm getoond wordt.
              </p>
            </div>
          </div>
        </div>

        {/* User Rank & Info Badge */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-2.5 shadow-md">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div className="text-left">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Actieve Beheerdersrang:</span>
              <span className="text-xs font-black text-emerald-300">
                {currentPosUser?.name || 'Afhaalscherm Supervisor'} (Manager)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => AudioFX.speakOrder(1099, 'Test Omroep', 'dine_in')}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-lg active:scale-95"
          >
            <Volume2 className="w-4 h-4" />
            <span>Test Omroep op TV</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Live TV Screen Marquee Preview Box */}
      <div className="p-4 bg-slate-900 border-2 border-rose-600/50 rounded-3xl space-y-3 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-black uppercase font-mono tracking-wider text-rose-400">
              LIVE TV SIMULATOR (Wat nu afspeelt op de nieuwsbalk):
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
              Snelheid: {newsConfig.speedSeconds}s loop
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${newsConfig.paused ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {newsConfig.paused ? '⏸️ Gepauzeerd' : '▶️ Actief Binnenhalen'}
            </span>
          </div>
        </div>

        {/* Realistic NOS Red Ticker Replica */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between gap-3 overflow-hidden shadow-inner">
          {/* NOS Brand Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#E3000F] text-white rounded-xl font-black shrink-0 shadow-lg">
            <span className="text-xs font-black tracking-widest font-sans">NOS</span>
            <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-rose-100 uppercase tracking-wider font-mono">
              {newsConfig.category}
            </span>
          </div>

          {/* Scrolling Ticker Text */}
          <div className="flex-1 overflow-hidden mx-2 relative h-6 flex items-center">
            <div className={`whitespace-nowrap flex items-center gap-6 ${newsConfig.paused ? '' : 'animate-marquee'}`}>
              {[...currentTvHeadlines, ...currentTvHeadlines].map((item, idx) => (
                <span key={idx} className="flex items-center gap-2.5 shrink-0 text-xs font-bold">
                  {item.isUrgent ? (
                    <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black rounded-md text-[10px]">
                      🚨 SPOED
                    </span>
                  ) : (
                    <span className="text-rose-500 font-black">●</span>
                  )}
                  <span className={item.isUrgent ? 'text-amber-300 font-black' : 'text-slate-100'}>
                    {item.title}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">({item.pubDate})</span>
                </span>
              ))}
            </div>
          </div>

          <div className="text-amber-400 font-mono font-bold text-xs shrink-0 px-2">
            NOS LIVE
          </div>
        </div>
      </div>

      {/* Main Grid: Control Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1: NOS News Feed & TV Layout Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Rss className="w-5 h-5 text-rose-500" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              1. TV Indeling &amp; Nieuws
            </h2>
          </div>

          {/* NOS Category Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              Selecteer NOS Nieuws Categorie:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'general', label: '🌐 Algemeen', desc: 'NOS Hoofdnieuws' },
                { id: 'binnenland', label: '🇳🇱 Binnenland', desc: 'Nederland Nieuws' },
                { id: 'sport', label: '⚽ Sport', desc: 'NOS Sport Live' },
                { id: 'tech', label: '💡 Tech & Economie', desc: 'Innovatie & Markt' }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleUpdateConfig({ category: cat.id as any })}
                  className={`p-3 rounded-2xl border text-left transition ${
                    newsConfig.category === cat.id
                      ? 'bg-rose-600/20 border-rose-500 text-white shadow-lg shadow-rose-950/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  <div className="font-bold text-xs">{cat.label}</div>
                  <div className="text-[10px] text-slate-500">{cat.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
             <label className="text-xs font-bold text-slate-300 block">TV Indeling & Widgets</label>
             <select 
               value={newsConfig.layout}
               onChange={e => handleUpdateConfig({ layout: e.target.value as any })}
               className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
             >
               <option value="split_50">Split 50/50</option>
               <option value="menu_focus">Menu Focus</option>
               <option value="pickup_focus">Pickup Focus</option>
             </select>

             <div className="grid grid-cols-2 gap-1 pt-1">
               {Object.entries(newsConfig.widgets).map(([key, value]) => (
                 <div key={key} className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                   <span className="text-[9px] text-slate-500 uppercase">{key}</span>
                   <input 
                     type="checkbox" 
                     className="toggle toggle-xs" 
                     checked={value as boolean} 
                     onChange={e => handleUpdateConfig({ widgets: { ...newsConfig.widgets, [key]: e.target.checked } })} 
                   />
                 </div>
               ))}
             </div>
          </div>

          {/* Speed & Pause Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <label className="text-xs font-bold text-slate-300 block">
              Ticker Loop Snelheid:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { speed: 12, label: '⚡ Snel (12s)' },
                { speed: 22, label: '⚖️ Normaal (22s)' },
                { speed: 35, label: '🐢 Rustig (35s)' }
              ].map(sp => (
                <button
                  key={sp.speed}
                  type="button"
                  onClick={() => handleUpdateConfig({ speedSeconds: sp.speed })}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                    newsConfig.speedSeconds === sp.speed
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleUpdateConfig({ paused: !newsConfig.paused })}
              className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition ${
                newsConfig.paused
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
              }`}
            >
              {newsConfig.paused ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>▶️ Hervat Ticker</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>⏸️ Pauzeer Ticker</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Column 2: Emergency Alert & Custom Announcements */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Megaphone className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              2. Spoedbericht &amp; Eetzaal Acties
            </h2>
          </div>

          {/* Emergency Alert Toggle */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Spoedbericht op TV Ticker:</span>
              </span>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ isCustomAlertActive: !newsConfig.isCustomAlertActive })}
                className={`px-3 py-1 rounded-full text-xs font-black transition ${
                  newsConfig.isCustomAlertActive
                    ? 'bg-rose-600 text-white shadow-lg animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {newsConfig.isCustomAlertActive ? '🔴 AAN' : '⚪ UIT'}
              </button>
            </div>

            <textarea
              rows={2}
              value={customAlertInput}
              onChange={e => setCustomAlertInput(e.target.value)}
              placeholder="Bijv: ⚠️ Bestelling #1024 ophalen bij Balie 2!"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-400 outline-none"
            />

            <button
              type="button"
              onClick={() => handleUpdateConfig({ customAlertText: customAlertInput, isCustomAlertActive: true })}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publiceer Spoedbericht op TV</span>
            </button>
          </div>

          {/* Form to Add Custom Headline */}
          <form onSubmit={handleAddCustomItem} className="space-y-2.5 pt-2 border-t border-slate-800">
            <label className="text-xs font-bold text-slate-300 block">
              Voeg Aangepast Nieuwsbericht Toe:
            </label>
            <input
              type="text"
              value={newHeadlineTitle}
              onChange={e => setNewHeadlineTitle(e.target.value)}
              placeholder="Titel nieuwsbericht of actie..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500 outline-none"
            />
            <div className="flex gap-2">
              <select
                value={newHeadlineCategory}
                onChange={e => setNewHeadlineCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none"
              >
                <option value="NOS Binnenland">NOS Binnenland</option>
                <option value="NOS Sport">NOS Sport</option>
                <option value="NOS Economie">NOS Economie</option>
                <option value="Werkdonalds Actie">Werkdonalds Actie</option>
              </select>
              <button
                type="submit"
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Toevoegen</span>
              </button>
            </div>
          </form>
        </div>

        {/* Column 3: Live TV Monitor & Headline List */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Eye className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              3. Actieve Berichtenlijst op TV
            </h2>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scroll pr-1">
            {currentTvHeadlines.map((item, idx) => (
              <div
                key={item.id || idx}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs transition ${
                  item.isUrgent
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] px-2 py-0.5 rounded bg-rose-600/30 text-rose-300 font-bold border border-rose-500/30 font-mono">
                      {item.category}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{item.pubDate}</span>
                  </div>
                  <p className="font-bold text-slate-100 truncate">{item.title}</p>
                </div>

                {item.id.startsWith('custom_') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomItem(item.id)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-600 hover:text-white text-rose-400 transition"
                    title="Verwijder dit bericht uit de TV-ticker"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Quick TV Order Stats */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl grid grid-cols-2 gap-2 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Klaar om Af te Halen:</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{readyOrders.length} orders</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold">In Bereiding:</span>
              <span className="text-lg font-black text-amber-400 font-mono">{prepOrders.length} orders</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
