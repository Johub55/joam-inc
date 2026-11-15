import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioFX } from '../../services/audio';
import { Order, OrderStatus, OrderItemStage } from '../../types';
import { 
  getStatusMeta, 
  isOrderInProgress, 
  isOrderReady, 
  KITCHEN_STATUS_LIST, 
  parseKitchenNotes 
} from '../../services/orderStatus';
import { 
  ChefHat, 
  Clock, 
  Check, 
  Flame, 
  Package, 
  Maximize, 
  Volume2, 
  VolumeX, 
  Trash2, 
  BellRing,
  Sparkles,
  Eye,
  Zap,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  X,
  Activity,
  Globe,
  Laptop,
  Radio,
  Link,
  Play,
  SlidersHorizontal,
  Megaphone,
  ShieldCheck
} from 'lucide-react';

export const STAGE_CONFIG: Record<OrderItemStage, {
  label: string;
  shortLabel: string;
  emoji: string;
  activeBtn: string;
  idleBtn: string;
  barColor: string;
  progressPercent: number;
}> = {
  wachten: {
    label: 'In Wachtrij',
    shortLabel: 'Wachten',
    emoji: '⏳',
    activeBtn: 'bg-slate-700 text-slate-100 border-slate-500 font-black shadow-sm ring-1 ring-slate-400/30',
    idleBtn: 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850',
    barColor: 'bg-slate-600',
    progressPercent: 25
  },
  bereiden: {
    label: 'In Bereiding',
    shortLabel: 'Bereiden',
    emoji: '🔥',
    activeBtn: 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm ring-1 ring-amber-400/40',
    idleBtn: 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-amber-300 hover:bg-slate-850',
    barColor: 'bg-amber-400',
    progressPercent: 50
  },
  inpakken: {
    label: 'Inpakken',
    shortLabel: 'Inpakken',
    emoji: '📦',
    activeBtn: 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-sm ring-1 ring-cyan-400/40',
    idleBtn: 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-cyan-300 hover:bg-slate-850',
    barColor: 'bg-cyan-400',
    progressPercent: 75
  },
  klaar: {
    label: 'Gereed',
    shortLabel: 'Klaar',
    emoji: '✅',
    activeBtn: 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-sm ring-1 ring-emerald-400/40',
    idleBtn: 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-emerald-300 hover:bg-slate-850',
    barColor: 'bg-emerald-400',
    progressPercent: 100
  }
};

type StationType = 'all' | 'grill' | 'fryer' | 'drinks' | 'dessert';

const STATIONS: { id: StationType; label: string; emoji: string }[] = [
  { id: 'all', label: 'Alle Stations', emoji: '🧑‍🍳' },
  { id: 'grill', label: 'Grill & Burgers', emoji: '🍔' },
  { id: 'fryer', label: 'Frituur & Snacks', emoji: '🍟' },
  { id: 'drinks', label: 'Dranken & Shakes', emoji: '🥤' },
  { id: 'dessert', label: 'IJs & Desserts', emoji: '🍦' }
];

function isItemMatchingStation(itemName: string, station: StationType): boolean {
  if (station === 'all') return true;
  const n = itemName.toLowerCase();
  if (station === 'grill') {
    return n.includes('burger') || n.includes('mac') || n.includes('whopper') || n.includes('broodje') || n.includes('wrap');
  }
  if (station === 'fryer') {
    return n.includes('friet') || n.includes('nugget') || n.includes('kip') || n.includes('crispy') || n.includes('tender') || n.includes('snack') || n.includes('bitterbal');
  }
  if (station === 'drinks') {
    return n.includes('cola') || n.includes('fanta') || n.includes('sprite') || n.includes('drank') || n.includes('shake') || n.includes('koffie') || n.includes('thee') || n.includes('water');
  }
  if (station === 'dessert') {
    return n.includes('ijs') || n.includes('sundae') || n.includes('flurry') || n.includes('donut') || n.includes('koek') || n.includes('dessert');
  }
  return true;
}

export function getEstimatedPrepTime(order: Order): number {
  let totalSecs = 0;
  order.items.forEach(it => {
    const name = it.name.toLowerCase();
    const qty = it.qty || 1;
    let baseTime = 60; // standaard 60 seconden
    if (name.includes('burger') || name.includes('mac') || name.includes('whopper') || name.includes('broodje') || name.includes('wrap')) {
      baseTime = 120; // Burgers take longer (2 min)
    } else if (name.includes('friet') || name.includes('nugget') || name.includes('kip') || name.includes('crispy') || name.includes('tender') || name.includes('snack') || name.includes('bitterbal')) {
      baseTime = 90; // Fried snacks take 1.5 min
    } else if (name.includes('cola') || name.includes('fanta') || name.includes('sprite') || name.includes('drank') || name.includes('shake') || name.includes('koffie') || name.includes('thee') || name.includes('water')) {
      baseTime = 35; // Drinks/shakes are fast (35 sec)
    } else if (name.includes('ijs') || name.includes('sundae') || name.includes('flurry') || name.includes('donut') || name.includes('koek') || name.includes('dessert')) {
      baseTime = 45; // Desserts take 45 sec
    }
    totalSecs += baseTime * qty;
  });
  return Math.min(Math.max(totalSecs, 45), 600); // Tussen 45 seconden en 10 minuten
}

export interface RecipeDetails {
  title: string;
  category: string;
  steps: string[];
  allergens: string[];
  tempNote: string;
  prepTimeSec: number;
}

export function getRecipeDetails(itemName: string): RecipeDetails {
  const n = itemName.toLowerCase();
  
  if (n.includes('burger') || n.includes('mac') || n.includes('pounder') || n.includes('tasty') || n.includes('cheeseburger') || n.includes('hamburger') || n.includes('kroket') || n.includes('rib')) {
    return {
      title: itemName,
      category: '🍔 Burger & Wrap Station',
      steps: [
        '1. Rooster de onder- en bovenkant van het broodje (15 sec in de toaster).',
        '2. Breng de kenmerkende saus aan op de onderste en bovenste bun.',
        '3. Leg gesneden uitjes, augurk en verse ijsbergsla op de saus.',
        '4. Bak de 100% rundvlees patties/burgerschijf op de grill (kerntemp > 75°C).',
        '5. Smelt een plakje cheddarkaas op het warme vlees.',
        '6. Sluit het broodje en verpak strak in de juiste wikkel.'
      ],
      allergens: ['🌾 Gluten (Tarwe)', '🥛 Lactose (Melk/Kaas)', '🥚 Ei (Saus)', '🌱 Soja', '🌰 Sesam (Broodje)'],
      tempNote: 'Kerntemperatuur vlees: minimaal 75°C. Maximaal 10 min in warmhoudstation.',
      prepTimeSec: 120
    };
  }
  
  if (n.includes('chicken') || n.includes('nugget') || n.includes('tender') || n.includes('wings') || n.includes('wrap') || n.includes('kip')) {
    return {
      title: itemName,
      category: '🍗 Kip & Snack Station',
      steps: [
        '1. Frituur het kapproduct direct vanuit de diepvries op 175°C (3.5 - 4 min).',
        '2. Laat het product 15 seconden uitlekken boven de frituurpan.',
        '3. Voor Wraps: Verwarm de tortilla, voeg honog-mosterd/sauzen, sla en warme kip toe en rol strak op.',
        '4. Voor Nuggets/Tenders: Schep het exacte aantal in de kartonnen snackbox.',
        '5. Voeg de gewenste dipsaus (BBQ, Zoetzuur, Mayonaise) toe aan de bestelzak.'
      ],
      allergens: ['🌾 Gluten (Krokant korstje)', '🌱 Soja', '🥚 Ei (Sauzen)', '🌾 Mosterd (Honey-Mustard)'],
      tempNote: 'Frituur op exact 175°C. Schud het frituurmandje na 30 seconden.',
      prepTimeSec: 180
    };
  }

  if (n.includes('friet') || n.includes('twister') || n.includes('aardappel')) {
    return {
      title: itemName,
      category: '🍟 Frituur & Sides Station',
      steps: [
        '1. Vul het frituurmandje tot max. 500g verse frites.',
        '2. Frituur 3 minuten op 175°C tot goudgeel en knapperig.',
        '3. Schud af boven de bak, giet in de zoutpan en strooi gelijkmatig zout.',
        '4. Schep direct met de frites-schep in de juiste portiezak (Klein/Medium/Groot).',
        '5. Voor Loaded Friet: Toef cheddar, baconbits en bieslook toevoegen.'
      ],
      allergens: ['🌱 Soja (Frituurolie)', '🥛 Lactose (Alleen bij Loaded Cheese/Truffel)'],
      tempNote: 'Direct warm serveren. Friet verliest knapperigheid na 5 minuten.',
      prepTimeSec: 180
    };
  }

  if (n.includes('ijs') || n.includes('sundae') || n.includes('flurry') || n.includes('shake')) {
    return {
      title: itemName,
      category: '🍦 IJs & Shake Station',
      steps: [
        '1. Neem een schone beker of ijsbakje.',
        '2. Tap vers zacht ijs of melkshake uit de gekoelde machine.',
        '3. Voor Flurry: Voeg de gewenste crunch/topping toe (Oreo, Stroopwafel, M&M).',
        '4. Mix de topping 5 seconden door met de mixer op de standaard.',
        '5. Serveer direct met een lepel/rietje.'
      ],
      allergens: ['🥛 Lactose (Verse Zuivel)', '🌾 Gluten (Crunches/Cookies)', '🌰 Noten/Pinda sporen'],
      tempNote: 'Bewaartemperatuur ijsmachine: -4°C tot -8°C.',
      prepTimeSec: 45
    };
  }

  return {
    title: itemName,
    category: '🧑‍🍳 Algemene Bereiding',
    steps: [
      '1. Controleer de bon op speciale wensen of sausaanpassingen.',
      '2. Bereid het item volgens de standaard kwaliteitsnormen.',
      '3. Plaats in de juiste verpakking en controleer op allergenen.',
      '4. Zet de status op "Inpakken" of "Gereed".'
    ],
    allergens: ['Bekijk verpakking voor specifieke allergenen'],
    tempNote: 'Hygiënisch verpakken en vers serveren.',
    prepTimeSec: 60
  };
}

export const KitchenScreen: React.FC = () => {
  const { 
    orders, 
    updateOrderStatus, 
    updateOrderItemStage,
    toggleOrderPrio,
    setAllOrderItemsDone, 
    deleteOrder, 
    setTrackedOrderNo,
    managerOverride
  } = useApp();

  const [now, setNow] = useState<number>(Date.now());
  const [filterTab, setFilterTab] = useState<'all' | 'prep' | 'packing' | 'done'>('all');
  const [stationFilter, setStationFilter] = useState<StationType>('all');
  const [soundOn, setSoundOn] = useState<boolean>(AudioFX.isEnabled);

  // Recipe & Allergen Quick-View Modal State
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<{ name: string; note?: string } | null>(null);

  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const [showPackingGuideModal, setShowPackingGuideModal] = useState<boolean>(false);
  const [activeOrderPacking, setActiveOrderPacking] = useState<Order | null>(null);
  const [activeOrderPackingChecklist, setActiveOrderPackingChecklist] = useState<Record<number, boolean>>({});
  const [packingChecklist, setPackingChecklist] = useState<Record<string, boolean>>({
    warm_bottom: false,
    cold_separated: false,
    sauces_napkins: false,
    receipt_sticker: false
  });
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(
    typeof window !== 'undefined' ? localStorage.getItem('wd_tts_voice') || '' : ''
  );
  const [ttsMode, setTtsMode] = useState<any>(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('wd_tts_mode') || 'auto' : 'auto');
  });
  const [customTtsUrl, setCustomTtsUrl] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('wd_custom_tts_url') || '' : '';
  });
  const [customTemplate, setCustomTemplate] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('wd_tts_custom_template') || 'Bestelling {orderNo} voor {target} is gereed om af te halen!' : 'Bestelling {orderNo} voor {target} is gereed om af te halen!';
  });
  const [directText, setDirectText] = useState<string>('');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(() => AudioFX.getIsUnlocked());
  const [diagnostics, setDiagnostics] = useState<any>(() => AudioFX.getDiagnostics());

  // Load available speech synthesis voices
  useEffect(() => {
    const refreshVoices = () => {
      const v = AudioFX.getAvailableVoices();
      setAvailableVoices(v);
    };

    refreshVoices();
    const t = setTimeout(refreshVoices, 500);
    const t2 = setTimeout(refreshVoices, 1500);

    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [showVoiceSettings]);

  // Subscribe to live audio diagnostics
  useEffect(() => {
    const unsub = AudioFX.subscribeDiagnostics((diag) => {
      setDiagnostics(diag);
      if (diag.isUnlocked) {
        setIsAudioUnlocked(true);
      }
    });
    return unsub;
  }, []);

  const handleSelectVoice = (uri: string) => {
    setSelectedVoiceURI(uri);
    if (typeof window !== 'undefined') {
      if (uri) {
        localStorage.setItem('wd_tts_voice', uri);
      } else {
        localStorage.removeItem('wd_tts_voice');
      }
    }
  };

  const handleSelectTtsMode = (mode: any) => {
    setTtsMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_tts_mode', mode);
    }
  };

  const handleSaveCustomUrl = (url: string) => {
    setCustomTtsUrl(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_custom_tts_url', url);
    }
  };

  const handleSaveCustomTemplate = (template: string) => {
    setCustomTemplate(template);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_tts_custom_template', template);
    }
  };

  // Update timers every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Orders that are currently on the kitchen screen: exclude finished/afgehaald/cancelled orders!
  const isFinished = (s: string) => s === 'afgehaald' || s === 'archived' || s === 'cancelled' || s === 'geannuleerd';

  const activeOrders = orders.filter(o => !isFinished(o.status) && (isOrderInProgress(o.status) || isOrderReady(o.status)));
  const prepOrders = orders.filter(o => !isFinished(o.status) && isOrderInProgress(o.status) && o.status !== 'inpakken');
  const packingOrders = orders.filter(o => !isFinished(o.status) && (o.status === 'inpakken' || (o.status !== 'klaar' && o.status !== 'done' && o.items.some(it => it.stage === 'inpakken'))));
  const readyOrders = orders.filter(o => !isFinished(o.status) && isOrderReady(o.status));

  const prepCount = prepOrders.length;
  const packingCount = packingOrders.length;
  const readyCount = readyOrders.length;

  // Filter based on active tab
  let tabFilteredOrders = filterTab === 'prep' 
    ? prepOrders 
    : filterTab === 'packing'
    ? packingOrders
    : filterTab === 'done' 
    ? readyOrders 
    : activeOrders;

  // Station filtering: keep tickets that contain items matching the station
  if (stationFilter !== 'all') {
    tabFilteredOrders = tabFilteredOrders.filter(o => 
      o.items.some(it => isItemMatchingStation(it.name, stationFilter))
    );
  }

  // Sort orders: Priority / Spoed orders float to the top, then FIFO by timestamp
  const displayedOrders = [...tabFilteredOrders].sort((a, b) => {
    if (a.isPrio && !b.isPrio) return -1;
    if (!a.isPrio && b.isPrio) return 1;
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  // Berekening gemiddelde bereidingstijd van afgeronde/gereedgemelde bestellingen in de actieve sessie
  const readyOrCompletedOrders = orders.filter(
    o => isOrderReady(o.status) || o.status === 'afgehaald' || o.status === 'done' || o.status === 'ready'
  );
  const completedWithTime = readyOrCompletedOrders.filter(
    o => o.updatedAt && o.timestamp && o.updatedAt > o.timestamp
  );
  const avgPrepTimeSecs = completedWithTime.length > 0
    ? completedWithTime.reduce((sum, o) => sum + ((o.updatedAt! - o.timestamp) / 1000), 0) / completedWithTime.length
    : 0;
  const formattedAvgPrepTime = avgPrepTimeSecs > 0
    ? `${Math.floor(avgPrepTimeSecs / 60)}m ${Math.round(avgPrepTimeSecs % 60)}s`
    : 'Geen data';

  let busyLevel = '🟢 Rustig (~3 min)';
  let busyColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (prepCount >= 7) {
    busyLevel = '🔴 Piekdrukte (~12 min)';
    busyColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse';
  } else if (prepCount >= 3) {
    busyLevel = '🟡 Gemiddeld (~6 min)';
    busyColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleSound = () => {
    const nextState = !soundOn;
    setSoundOn(nextState);
    AudioFX.setEnabled(nextState);
    if (nextState) {
      AudioFX.bell();
    }
  };

  const handleTestSound = () => {
    AudioFX.speakOrder(1001);
  };

  const handleClearAllDone = () => {
    if (readyCount === 0) return;
    readyOrders.forEach(o => {
      deleteOrder(o.no);
    });
  };

  const handleSetItemStage = (orderNo: number, itemIndex: number, stage: OrderItemStage) => {
    updateOrderItemStage(orderNo, itemIndex, stage);
    if (stage === 'klaar' && soundOn) {
      AudioFX.bell();
    }
  };

  const handleSetAllTicketStage = (order: Order, stage: OrderItemStage) => {
    order.items.forEach((_, idx) => {
      updateOrderItemStage(order.no, idx, stage);
    });
    if (stage === 'klaar') {
      setAllOrderItemsDone(order.no, true);
      if (soundOn) {
        AudioFX.bell();
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-hidden bg-slate-950 p-3 sm:p-5 space-y-3">
      
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>Keukenscherm (Live KDS)</span>
              {managerOverride && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 border border-emerald-500/30 animate-pulse font-black shadow-lg">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>OVERRIDE</span>
                </span>
              )}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                {prepCount} in bereiding
              </span>
              {readyCount > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  {readyCount} gereed op scherm
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Chefs bepalen per product hoever de bereiding is: wachten, bereiden, inpakken of klaar.
            </p>
          </div>
        </div>

        {/* Right side controls: Sound, Clean up, Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={`text-xs px-3 py-1.5 rounded-xl font-bold border ${busyColor}`}>
            {busyLevel}
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            title={soundOn ? 'Geluid uitschakelen' : 'Geluid inschakelen'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              soundOn 
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundOn ? 'Geluid: Aan' : 'Geluid: Uit'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestSound}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95"
            title="Test bel en omroepstem"
          >
            <BellRing className="w-4 h-4 text-amber-400" />
            <span>Test Omroep</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPackingGuideModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition active:scale-95 shadow"
            title="Open visuele inpak-handleiding & kwaliteits-checklist"
          >
            <Package className="w-4 h-4 text-cyan-400" />
            <span>📦 Visuele Inpakgids</span>
          </button>

          <button
            type="button"
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              showVoiceSettings 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Custom TTS &amp; Audio</span>
          </button>

          {readyCount > 0 && (
            <button
              type="button"
              onClick={handleClearAllDone}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition active:scale-95"
              title="Alle gereedgemelde bestellingen van scherm halen"
            >
              <Trash2 className="w-4 h-4" />
              <span>Verwijder gereed ({readyCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Maximize className="w-4 h-4" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>

      {/* Voice & Custom TTS Settings Panel */}
      {showVoiceSettings && (
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 shadow-2xl animate-in fade-in max-h-[82vh] overflow-y-auto custom-scroll">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Natuurlijke Stemmen &amp; Custom TTS Instellingen
                </h3>
                <p className="text-xs text-slate-400">
                  Kies een zuivere menselijke Nederlandse stem of koppel een eigen TTS endpoint.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowVoiceSettings(false)}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Real-time Diagnostics Bar */}
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-mono">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-slate-400">AudioContext:</span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  diagnostics.ctxState === 'running' 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {diagnostics.ctxState}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Status:</span>
                <span className="text-slate-200 font-medium">{diagnostics.lastMessage}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  AudioFX.unlock();
                  AudioFX.bell();
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] border border-slate-700 flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-amber-400" />
                <span>Test Bel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  AudioFX.unlock();
                  AudioFX.playSpeech('Bestelling 1002 voor Tafel 4 is gereed om af te halen!');
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 shadow"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>Test Spraak</span>
              </button>
            </div>
          </div>

          {/* Eenmalige Omroep (Direct Spraak) */}
          <div className="p-4 sm:p-5 bg-amber-500/5 rounded-2xl border border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Eenmalige Omroep (Direct Spreken)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Typ hier een willekeurige tekst om direct om te roepen door de speakers. Dit overschrijft geen templates.
                </p>
              </div>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (directText.trim()) {
                  AudioFX.unlock();
                  AudioFX.playSpeech(directText.trim());
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                placeholder="Bijv: Gasten voor tafel 4, uw bestelling staat klaar bij de counter!"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400 text-xs"
              />
              <button
                type="submit"
                disabled={!directText.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-xs flex items-center gap-1.5 shadow transition shrink-0 cursor-pointer"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Roep Nu Om</span>
              </button>
            </form>

            {/* Quick Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-[10px] text-slate-400 self-center mr-1">Snelle keuzes:</span>
              {[
                'Bestelling staat klaar bij de counter!',
                'Even geduld alstublieft, we zijn ermee bezig.',
                'Welkom bij Werkdonalds, u kunt bestellen via de kiosk of app.',
                'Eet smakelijk en een fijne dag gewenst!',
                'Beste gasten, we gaan over 10 minuten sluiten.'
              ].map((text) => (
                <button
                  type="button"
                  key={text}
                  onClick={() => {
                    setDirectText(text);
                    AudioFX.unlock();
                    AudioFX.playSpeech(text);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 transition hover:border-amber-500/30 font-medium"
                >
                  "{text.split(',')[0].split('.')[0]}"
                </button>
              ))}
              {directText && (
                <button
                  type="button"
                  onClick={() => setDirectText('')}
                  className="px-2 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-800 text-[10px] text-rose-400 transition"
                >
                  Wis tekst
                </button>
              )}
            </div>
          </div>

          {/* Engine Selection Cards */}
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-2">
              Kies Spraakengine:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              
              {/* Option 1: Server Ruben */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('server_ruben')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'server_ruben'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-blue-400">
                    <Globe className="w-4 h-4" />
                    <span>Ruben (Natuurlijke Man - Aanbevolen)</span>
                  </span>
                  {ttsMode === 'server_ruben' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Duidelijke, menselijke studio mannenstem via onze directe backend proxy (/api/tts). Werkt gegarandeerd in Opera &amp; Linux.
                </p>
              </button>

              {/* Option 2: Server Lotte */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('server_lotte')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'server_lotte'
                    ? 'bg-purple-600/20 border-purple-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-purple-400">
                    <Globe className="w-4 h-4" />
                    <span>Lotte (Natuurlijke Vrouw)</span>
                  </span>
                  {ttsMode === 'server_lotte' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Vriendelijke, heldere studio vrouwenstem via onze backend proxy.
                </p>
              </button>

              {/* Option 3: Google Natural Dutch Audio */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('google_nl')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'google_nl'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-emerald-400">
                    <Radio className="w-4 h-4" />
                    <span>Google Natural Dutch</span>
                  </span>
                  {ttsMode === 'google_nl' && <Check className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Bekende Google Stem audio-stream met vloeiende Nederlandse uitspraak.
                </p>
              </button>

              {/* Option 4: Custom URL API */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('custom_url')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'custom_url'
                    ? 'bg-amber-600/20 border-amber-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-amber-400">
                    <Link className="w-4 h-4" />
                    <span>Custom TTS API URL</span>
                  </span>
                  {ttsMode === 'custom_url' && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Koppel een eigen TTS endpoint of externe spraakserver (VoiceRSS, ElevenLabs of lokaal).
                </p>
              </button>

              {/* Option 5: Native Speech */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('native')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'native'
                    ? 'bg-cyan-600/20 border-cyan-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-cyan-400">
                    <Laptop className="w-4 h-4" />
                    <span>Browser Systeemstem</span>
                  </span>
                  {ttsMode === 'native' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Lokale stemmen van het besturingssysteem (SAPI5, speech-dispatcher).
                </p>
              </button>

              {/* Option 6: Auto Mode */}
              <button
                type="button"
                onClick={() => handleSelectTtsMode('auto')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  ttsMode === 'auto'
                    ? 'bg-rose-600/20 border-rose-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs flex items-center gap-1.5 text-rose-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Automatisch (Aanbevolen)</span>
                  </span>
                  {ttsMode === 'auto' && <Check className="w-4 h-4 text-rose-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Kiest automatisch de beste stem (Ruben &rarr; Lotte &rarr; Google &rarr; Browser).
                </p>
              </button>

            </div>
          </div>

          {/* Custom TTS URL Input */}
          {ttsMode === 'custom_url' && (
            <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Link className="w-4 h-4" />
                  <span>Aangepaste TTS URL Template:</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Tokens: {'{text}'}, {'{orderNo}'}, {'{target}'}
                </span>
              </div>
              <input
                type="text"
                value={customTtsUrl}
                onChange={(e) => handleSaveCustomUrl(e.target.value)}
                placeholder="https://api.streamelements.com/kappa/v2/speech?voice=Ruben&text={text}"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>
          )}

          {/* Custom Omroep Tekst Template */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="space-y-2">
              <label className="text-slate-300 font-bold block mb-1">
                Aangepaste Omroepzin Template:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTemplate}
                  onChange={(e) => handleSaveCustomTemplate(e.target.value)}
                  placeholder="Bestelling {orderNo} voor {target} is gereed om af te halen!"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    AudioFX.unlock();
                    AudioFX.speakOrder(1005, 'Tafel 7', 'dine_in');
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow transition shrink-0 cursor-pointer animate-pulse"
                  title="Speel de aangepaste omroepzin nu af als test"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Speel Af</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                💡 Gebruik <code>{'{orderNo}'}</code> voor het nummer en <code>{'{target}'}</code> voor tafel of klantnaam (bijv: <em>"Bestelling {'{orderNo}'} voor {'{target}'} is klaar!"</em>).
              </p>
            </div>

            {ttsMode === 'native' && (
              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Kies Lokale Systeemstem:
                </label>
                <select
                  value={selectedVoiceURI}
                  onChange={e => handleSelectVoice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400 text-xs"
                >
                  <option value="">-- Automatische Nederlandse Stem --</option>
                  {availableVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}) {v.isDutch ? '🇳🇱/🇧🇪' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Filter Tabs Bar + Station Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-2 ${
              filterTab === 'all'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800'
            }`}
          >
            <span>Alle bestellingen</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              filterTab === 'all' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
            }`}>
              {activeOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('prep')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-2 ${
              filterTab === 'prep'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800'
            }`}
          >
            <span>🍳 In Bereiding</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              filterTab === 'prep' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-amber-400'
            }`}>
              {prepCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('packing')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-2 ${
              filterTab === 'packing'
                ? 'bg-blue-500 text-slate-950 shadow font-black'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800'
            }`}
          >
            <span>📦 Inpakken / Trayen</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              filterTab === 'packing' ? 'bg-slate-950 text-blue-400' : 'bg-slate-800 text-blue-400'
            }`}>
              {packingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('done')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-2 ${
              filterTab === 'done'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800'
            }`}
          >
            <span>🔔 Gereed op Scherm</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              filterTab === 'done' ? 'bg-slate-950 text-emerald-400' : 'bg-slate-800 text-emerald-400'
            }`}>
              {readyCount}
            </span>
          </button>
        </div>

        {/* Station Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-500 px-1.5 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <span className="hidden sm:inline">Station:</span>
          </div>
          {STATIONS.map(st => (
            <button
              key={st.id}
              type="button"
              onClick={() => setStationFilter(st.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                stationFilter === st.id
                  ? 'bg-amber-400 text-slate-950 shadow font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{st.emoji}</span>
              <span className="hidden md:inline">{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {displayedOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mb-3">
              🍳
            </div>
            <h3 className="font-bold text-base text-slate-300">
              {filterTab === 'prep' 
                ? 'Geen bestellingen in de keuken' 
                : filterTab === 'done' 
                ? 'Geen gereedstaande bestellingen op het scherm' 
                : 'Geen actieve bestellingen in de keuken'}
            </h3>
            <p className="text-xs mt-1 text-slate-500 max-w-sm">
              Nieuwe bestellingen van de kassa of kiosk verschijnen direct realtime met interactieve productfasen en timers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pb-4">
            {displayedOrders.map(order => {
              const elapsedMins = Math.floor((now - (order.timestamp || now)) / 60000);
              const isReady = isOrderReady(order.status);
              const currentMeta = getStatusMeta(order.status);

              const targetPrepSecs = getEstimatedPrepTime(order);
              const elapsedSecs = Math.floor((now - (order.timestamp || now)) / 1000);
              const isOvertime = !isReady && elapsedSecs > targetPrepSecs;
              const ratio = elapsedSecs / targetPrepSecs;

              const formatSecs = (secs: number) => {
                const m = Math.floor(secs / 60);
                const s = Math.round(secs % 60);
                return `${m}m ${s}s`;
              };

              const totalItems = order.items.reduce((s, it) => s + it.qty, 0);
              const doneItems = order.items.filter(it => it.done || it.stage === 'klaar').reduce((s, it) => s + it.qty, 0);
              const inPrepItems = order.items.filter(it => it.stage === 'bereiden').reduce((s, it) => s + it.qty, 0);
              const inPackItems = order.items.filter(it => it.stage === 'inpakken').reduce((s, it) => s + it.qty, 0);
              const waitingItems = order.items.filter(it => !it.stage || it.stage === 'wachten').reduce((s, it) => s + it.qty, 0);
              const allDone = totalItems > 0 && doneItems === totalItems;

              let timerBadge = 'bg-slate-800 text-slate-300 border-slate-700';
              if (!isReady) {
                if (isOvertime) timerBadge = 'bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse font-black';
                else if (ratio > 0.8) timerBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/45 font-bold';
                else timerBadge = 'bg-slate-800 text-slate-300 border-slate-700';
              } else {
                timerBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
              }

              return (
                <div
                  key={order.no}
                  className={`flex flex-col justify-between rounded-2xl p-3.5 border transition-all shadow-xl relative ${
                    order.isPrio
                      ? 'bg-slate-900 border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/40'
                      : isReady 
                      ? 'bg-slate-900/95 border-emerald-500/60 ring-1 ring-emerald-500/30' 
                      : allDone
                      ? 'bg-slate-900 border-amber-400 ring-2 ring-amber-400/40'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div>
                    {/* Priority Banner if marked SPOED */}
                    {order.isPrio && (
                      <div className="mb-2 px-3 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-black flex items-center justify-between animate-pulse">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                          <span>⚡ SPOED BESTELLING (VOORRANG)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleOrderPrio(order.no)}
                          className="text-[10px] underline text-rose-400 hover:text-white"
                        >
                          Herstel
                        </button>
                      </div>
                    )}

                    {/* Ready Banner if finished */}
                    {isReady && (
                      <div className={`mb-2.5 px-3 py-1.5 rounded-xl border text-xs font-black flex items-center justify-between ${
                        order.orderType === 'delivery'
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                          : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      }`}>
                        <span className="flex items-center gap-1.5">
                          <span>{order.orderType === 'delivery' ? '🛵' : '🔔'}</span>
                          <span>{order.orderType === 'delivery' ? 'GEREED VOOR BEZORGER' : 'GEREED VOOR AFHAAL'}</span>
                        </span>
                        <span className={`text-[10px] font-normal ${order.orderType === 'delivery' ? 'text-blue-400' : 'text-emerald-400'}`}>
                          {order.orderType === 'delivery' ? 'Niet omroepen' : 'Klant omgeroepen'}
                        </span>
                      </div>
                    )}

                    {/* Header with Order No, Table/Identifier & Elapsed time */}
                    <div className="flex items-start justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-2xl font-mono ${
                            order.isPrio ? 'text-rose-400' : isReady ? (order.orderType === 'delivery' ? 'text-blue-400' : 'text-emerald-400') : 'text-amber-400'
                          }`}>
                            #{order.no}
                          </span>
                          <span className="text-xs font-bold text-slate-400">· {order.time}</span>
                          
                          {/* SPOED / PRIO Button */}
                          {!isReady && (
                            <button
                              type="button"
                              onClick={() => toggleOrderPrio(order.no)}
                              title={order.isPrio ? 'Spoed uitschakelen' : 'Markeer als spoed (bovenaan scherm)'}
                              className={`p-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition ${
                                order.isPrio
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-700'
                              }`}
                            >
                              <Zap className="w-3 h-3" />
                              <span>{order.isPrio ? 'SPOED' : '+ Prio'}</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
                          <span>{order.orderType === 'dine_in' ? '🍽️' : order.orderType === 'delivery' ? '🛵' : '🛍️'}</span>
                          <span className="truncate max-w-[180px]">
                            {order.identifier || (order.orderType === 'dine_in' ? 'Tafel' : order.orderType === 'delivery' ? 'Bezorgen' : 'Afhaal')}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${timerBadge}`}>
                          <Clock className="w-3 h-3" />
                          <span>{isReady ? `Klaar (${elapsedMins}m)` : `${elapsedMins}m`}</span>
                        </span>

                        {/* Customer popup tracker view */}
                        <button
                          type="button"
                          onClick={() => setTrackedOrderNo(order.no)}
                          className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center gap-0.5"
                          title="Open live status pop-up zoals klant hem ziet"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Klantweergave</span>
                        </button>
                      </div>
                    </div>

                    {/* Status Selector Bar (Chefs can pick ANY overall status) */}
                    <div className="mb-3 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Bestelling Status:</span>
                        <span className="text-amber-400 font-bold lowercase">{currentMeta.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {KITCHEN_STATUS_LIST.slice(0, 6).map(st => {
                          const isActive = order.status === st.id || 
                            (st.id === 'wachten' && order.status === 'new') || 
                            (st.id === 'klaar' && order.status === 'done');

                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => updateOrderStatus(order.no, st.id)}
                              className={`px-1.5 py-1 rounded-lg text-[10px] font-bold truncate flex items-center justify-center gap-1 border transition ${
                                isActive
                                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm font-black'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                              title={st.description}
                            >
                              <span>{st.emoji}</span>
                              <span className="truncate">{st.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Progress Summary & Batch Controls */}
                    <div className="mb-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-300 flex items-center gap-1">
                          <span>Producten:</span>
                          <strong className={allDone ? 'text-emerald-400 font-black' : 'text-amber-400'}>
                            {doneItems}/{totalItems} gereed
                          </strong>
                        </span>

                        {/* Summary breakdown mini pills */}
                        <div className="flex items-center gap-1 text-[10px]">
                          {waitingItems > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono" title="In wachtrij">
                              ⏳ {waitingItems}
                            </span>
                          )}
                          {inPrepItems > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold" title="In bereiding">
                              🔥 {inPrepItems}
                            </span>
                          )}
                          {inPackItems > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold" title="Inpakken">
                              📦 {inPackItems}
                            </span>
                          )}
                          {doneItems > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold" title="Klaar">
                              ✅ {doneItems}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Batch action buttons for all items at once */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/60">
                        <span className="text-[9px] uppercase font-bold text-slate-500">Alles zetten op:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetAllTicketStage(order, 'bereiden')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-amber-500/20 text-amber-300 hover:border-amber-500/40 border border-slate-700 transition"
                            title="Zet alle producten in bereiding"
                          >
                            🔥 Bereiden
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllTicketStage(order, 'inpakken')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-cyan-500/20 text-cyan-300 hover:border-cyan-500/40 border border-slate-700 transition"
                            title="Zet alle producten op inpakken"
                          >
                            📦 Inpakken
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllTicketStage(order, 'klaar')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-emerald-500/20 text-emerald-300 hover:border-emerald-500/40 border border-slate-700 font-bold transition"
                            title="Zet alle producten op klaar"
                          >
                            ✅ Alles klaar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Items Checklist With 4-Stage Selectors */}
                    <div className="space-y-2 py-1">
                      {order.items.map((it, i) => {
                        const currentStage: OrderItemStage = it.stage || (it.done ? 'klaar' : 'wachten');
                        const stageInfo = STAGE_CONFIG[currentStage];
                        const noteParts = parseKitchenNotes(it.itemNote);
                        const isMatchStation = isItemMatchingStation(it.name, stationFilter);

                        return (
                          <div 
                            key={i} 
                            className={`p-2.5 rounded-xl border transition-all ${
                              currentStage === 'klaar' 
                                ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-300' 
                                : currentStage === 'inpakken'
                                ? 'bg-cyan-950/20 border-cyan-500/30 text-slate-100'
                                : currentStage === 'bereiden'
                                ? 'bg-amber-950/20 border-amber-500/35 text-slate-100'
                                : 'bg-slate-950 border-slate-800 text-slate-100'
                            } ${!isMatchStation && stationFilter !== 'all' ? 'opacity-40' : ''}`}
                          >
                            {/* Product Title and Quantity */}
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-amber-400 font-black text-sm leading-tight">
                                  {it.qty}×
                                </span>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-xs font-bold leading-snug ${
                                      currentStage === 'klaar' ? 'line-through text-slate-400' : 'text-white'
                                    }`}>
                                      {it.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRecipeItem({ name: it.name, note: it.itemNote })}
                                      className="px-1.5 py-0.2 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[9px] font-bold flex items-center gap-1 transition"
                                      title="Bekijk recept, bouwvolgorde en allergenen"
                                    >
                                      <span>ℹ️ Recept</span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Active Stage Indicator Badge */}
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border shrink-0 flex items-center gap-1 ${
                                currentStage === 'klaar'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : currentStage === 'inpakken'
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                  : currentStage === 'bereiden'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}>
                                <span>{stageInfo.emoji}</span>
                                <span>{stageInfo.shortLabel.toUpperCase()}</span>
                              </span>
                            </div>

                            {/* Ultra-Clear Badges for Sauces, Omissions & Additions */}
                            {noteParts.length > 0 && (
                              <div className="mb-2 pl-5 flex flex-wrap gap-1">
                                {noteParts.map((part, pIdx) => {
                                  let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
                                  let icon = '📝';

                                  if (part.type === 'sauce') {
                                    badgeStyle = 'bg-amber-400/25 text-amber-200 border-amber-400/50 font-black ring-1 ring-amber-400/20';
                                    icon = '🥫';
                                  } else if (part.type === 'omission') {
                                    badgeStyle = 'bg-rose-500/25 text-rose-200 border-rose-500/50 font-black ring-1 ring-rose-500/20';
                                    icon = '🚫';
                                  } else if (part.type === 'addition') {
                                    badgeStyle = 'bg-emerald-500/25 text-emerald-200 border-emerald-500/50 font-black';
                                    icon = '➕';
                                  } else if (part.type === 'drink') {
                                    badgeStyle = 'bg-blue-500/25 text-blue-200 border-blue-500/50 font-bold';
                                    icon = '🥤';
                                  }

                                  return (
                                    <span
                                      key={pIdx}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 leading-tight ${badgeStyle}`}
                                    >
                                      <span>{icon}</span>
                                      <span>{part.text}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {/* 4-Stage Quick Switch Buttons per product */}
                            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-800/80">
                              {(['wachten', 'bereiden', 'inpakken', 'klaar'] as OrderItemStage[]).map(stageKey => {
                                const isCurrent = currentStage === stageKey;
                                const conf = STAGE_CONFIG[stageKey];

                                return (
                                  <button
                                    key={stageKey}
                                    type="button"
                                    onClick={() => handleSetItemStage(order.no, i, stageKey)}
                                    className={`py-1 px-1 rounded-lg text-[10px] font-bold text-center border transition active:scale-95 flex items-center justify-center gap-0.5 ${
                                      isCurrent ? conf.activeBtn : conf.idleBtn
                                    }`}
                                  >
                                    <span>{conf.emoji}</span>
                                    <span className="truncate">{conf.shortLabel}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Mini Progress Bar under each product */}
                            <div className="w-full h-1 bg-slate-900 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 rounded-full ${stageInfo.barColor}`}
                                style={{ width: `${stageInfo.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="pt-2.5 mt-2.5 border-t border-slate-800 space-y-2">
                    {!isReady ? (
                      <div className="space-y-2">
                        {/* Per-Order Packing Process Launcher Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveOrderPacking(order);
                            const initialChecks: Record<number, boolean> = {};
                            order.items.forEach((it, idx) => {
                              if (it.done || it.stage === 'klaar') {
                                initialChecks[idx] = true;
                              }
                            });
                            setActiveOrderPackingChecklist(initialChecks);
                          }}
                          className={`w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 border ${
                            order.status === 'inpakken' || inPackItems > 0
                              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 border-cyan-300 shadow-lg shadow-cyan-950/40 animate-pulse'
                              : 'bg-slate-800 hover:bg-slate-750 text-cyan-300 border-cyan-500/30'
                          }`}
                        >
                          <Package className="w-4 h-4 text-cyan-400" />
                          <span>📦 Start Inpakproces #{order.no}</span>
                        </button>

                        {allDone && (
                          <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-1.5 rounded-lg text-center font-bold flex items-center justify-center gap-1 animate-pulse">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Alle producten gereed! Klik op Klaar voor omroep.</span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              updateOrderStatus(order.no, 'klaar');
                            }}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 ${
                              order.orderType === 'delivery'
                                ? 'bg-blue-500 hover:bg-blue-400 text-white'
                                : allDone 
                                ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 animate-pulse ring-2 ring-emerald-400/50' 
                                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span>
                              {order.orderType === 'delivery' ? 'Klaar voor Bezorger' : 'Klaar! (Bel & Omroep)'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              deleteOrder(order.no);
                            }}
                            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-bold transition border border-slate-700 hover:border-rose-500 flex items-center gap-1.5 active:scale-95"
                            title="Bestelling direct van keukenscherm verwijderen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          {/* Repeat Announcement button */}
                          {order.orderType === 'delivery' ? (
                            <div className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30 flex items-center justify-center gap-1.5">
                              <span>🛵 Bezorging (Geen omroep)</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                AudioFX.speakOrder(order.no, order.identifier, order.orderType);
                              }}
                              className="flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-center gap-1.5 transition active:scale-95"
                              title="Speel omroep opnieuw af"
                            >
                              <BellRing className="w-3.5 h-3.5" />
                              <span>📢 Herhaal Omroep</span>
                            </button>
                          )}

                          {/* Explicit Remove from Screen button */}
                          <button
                            type="button"
                            onClick={() => {
                              deleteOrder(order.no);
                            }}
                            className="flex-1 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-300 border border-slate-700 hover:border-rose-500 flex items-center justify-center gap-1.5 transition active:scale-95"
                            title="Verwijder deze bestelling definitief van het keukenscherm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Verwijder</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recipe & Allergen Quick-View Modal */}
      {selectedRecipeItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs uppercase font-mono font-bold text-amber-400">
                  {getRecipeDetails(selectedRecipeItem.name).category}
                </div>
                <h2 className="text-xl font-black text-white mt-0.5">
                  {selectedRecipeItem.name}
                </h2>
                {selectedRecipeItem.note && (
                  <div className="text-xs text-rose-300 font-medium mt-1 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/30 inline-block">
                    📝 Opmerking: {selectedRecipeItem.note}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecipeItem(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Assembly Steps */}
            <div>
              <h3 className="text-xs uppercase font-mono font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                <span>👩‍🍳</span>
                <span>Bouwvolgorde & Bereidingsstappen:</span>
              </h3>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs text-slate-200 font-medium">
                {getRecipeDetails(selectedRecipeItem.name).steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-slate-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Allergens & Temperatures */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>⚠️</span> Allergenen
                </h4>
                <div className="flex flex-wrap gap-1">
                  {getRecipeDetails(selectedRecipeItem.name).allergens.map((alg, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                      {alg}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>🌡️</span> Kwaliteit & Temp
                </h4>
                <p className="text-[11px] text-slate-300 leading-snug">
                  {getRecipeDetails(selectedRecipeItem.name).tempNote}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRecipeItem(null)}
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition shadow-lg"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Packing Guide & Quality Checklist Modal */}
      {showPackingGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xl">
                  📦
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>Visuele Inpak-Handleiding &amp; Tray Gids</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                      Standard Operating Procedure
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Instructies voor keukenteam &amp; inpakmedewerkers om bestellingen snel en foutloos in te pakken.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPackingGuideModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Bag Size & Tray Selector */}
            <div>
              <h3 className="text-xs uppercase font-mono font-bold text-cyan-400 mb-2.5 flex items-center gap-1.5">
                <span>🛍️</span>
                <span>1. Keuze Zakformaat &amp; Presentatie:</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-white">🛍️ Zak S (Small)</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 font-mono px-1.5 py-0.5 rounded">1-2 items</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Voor losse burgers, snacks of 1 middel friet. Altijd <strong>2 servetten</strong> toevoegen.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-white">🛍️ Zak M (Medium)</span>
                    <span className="text-[9px] bg-cyan-500/20 text-cyan-300 font-mono px-1.5 py-0.5 rounded">3-4 items</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Standaard zak voor 1 compleet menu + snack. Sauzen en frituursnoepgoed onderin leggen.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-white">🛍️ Zak L (Large)</span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.5 rounded">5+ items</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Familiebestellingen &amp; groepsdeals. Max 6 items per zak om pletten van burgers te voorkomen.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Temperature Separation & Stacking Diagram */}
            <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-xs uppercase font-mono font-bold text-amber-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span>🔥</span>
                  <span>2. Temperatuur Scheiding (Warm vs Koud)</span>
                </span>
                <span className="text-[10px] text-amber-300 font-normal">Belangrijk voor kwaliteit</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1">
                  <div className="font-bold text-rose-300 flex items-center gap-1">
                    <span>🔥 ONDERIN ZAK (WARM)</span>
                  </div>
                  <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-0.5">
                    <li>Friet rechtop zetten (voorkomt muf worden)</li>
                    <li>Burgers en warme wraps plat onderop</li>
                    <li>Warm frituursnoepgoed direct naast de friet</li>
                  </ul>
                </div>

                <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-1">
                  <div className="font-bold text-cyan-300 flex items-center gap-1">
                    <span>❄️ BEKERHOUDER (KOUD)</span>
                  </div>
                  <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-0.5">
                    <li>Milkshakes, McFlurry's &amp; frisdrank in draagkarton</li>
                    <li><strong>NOOIT</strong> koud ijs in dezelfde zak als warme burgers!</li>
                    <li>Altijd deksel controleren op stevige sluiting</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 3: Interactive Packing Quality Checklist */}
            <div>
              <h3 className="text-xs uppercase font-mono font-bold text-emerald-400 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span>✅</span>
                  <span>3. Snelle Inpak Kwaliteitscheck:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPackingChecklist({
                    warm_bottom: false,
                    cold_separated: false,
                    sauces_napkins: false,
                    receipt_sticker: false
                  })}
                  className="text-[10px] text-slate-400 hover:text-white underline font-normal"
                >
                  Reset vinkjes
                </button>
              </h3>

              <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                {[
                  { key: 'warm_bottom', label: '🔥 Warm eten onderin (Friet rechtop, burgers plat)', icon: '🍟' },
                  { key: 'cold_separated', label: '🥤 Koude dranken & ijs in aparte bekerhouder', icon: '❄️' },
                  { key: 'sauces_napkins', label: '🧂 Sauzen, rietjes & 2 servetten per menu bijgesloten', icon: '🧻' },
                  { key: 'receipt_sticker', label: '🏷️ Zak 2x dichtgevouwen & bestelbon-sticker op de zak', icon: '📌' }
                ].map(item => (
                  <label
                    key={item.key}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                      packingChecklist[item.key]
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!packingChecklist[item.key]}
                      onChange={e => setPackingChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-0"
                    />
                    <span className="text-sm">{item.icon}</span>
                    <span className="text-xs">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-between items-center border-t border-slate-800">
              <span className="text-[11px] text-slate-400 italic">
                Werkdonalds Kwaliteitstandaard v2.4
              </span>
              <button
                type="button"
                onClick={() => setShowPackingGuideModal(false)}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition shadow-lg"
              >
                Begrepen &amp; Sluiten ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-Order Packing Process Interactive Modal */}
      {activeOrderPacking && (() => {
        const ord = activeOrderPacking;
        const totalItemsCount = ord.items.reduce((sum, it) => sum + it.qty, 0);
        const checkedCount = ord.items.filter((_, idx) => !!activeOrderPackingChecklist[idx]).reduce((sum, it) => sum + it.qty, 0);
        const isAllChecked = checkedCount === totalItemsCount;

        // Categorize order items
        const warmItems: Array<{ item: any; index: number }> = [];
        const coldItems: Array<{ item: any; index: number }> = [];
        const sauceItems: Array<{ item: any; index: number }> = [];

        ord.items.forEach((it, idx) => {
          const lower = it.name.toLowerCase();
          if (
            lower.includes('cola') || lower.includes('fanta') || lower.includes('cassis') || 
            lower.includes('sprite') || lower.includes('7up') || lower.includes('water') || 
            lower.includes('shake') || lower.includes('flurry') || lower.includes('sundae') || 
            lower.includes('ijs') || lower.includes('drank') || lower.includes('sap') || lower.includes('bier')
          ) {
            coldItems.push({ item: it, index: idx });
          } else if (
            lower.includes('saus') || lower.includes('mayo') || lower.includes('ketchup') || 
            lower.includes('chili') || lower.includes('frites') || lower.includes('mustard') || lower.includes('dip')
          ) {
            sauceItems.push({ item: it, index: idx });
          } else {
            warmItems.push({ item: it, index: idx });
          }
        });

        // Recommended bag size
        let recommendedBag = '🛍️ Zak Small (1-2 items)';
        if (totalItemsCount >= 5) recommendedBag = '🛍️ Zak Large (5+ items) + Max 6 items per zak';
        else if (totalItemsCount >= 3) recommendedBag = '🛍️ Zak Medium (3-4 items)';

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-cyan-500/50 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scroll">
              
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-cyan-400 font-mono">#{ord.no}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30 uppercase">
                      📦 INPAKPROCES &amp; TRAY CHECK
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300 mt-1">
                    <span>{ord.orderType === 'dine_in' ? '🍽️ Eetzaal' : ord.orderType === 'delivery' ? '🛵 Bezorging' : '🛍️ Meenemen'}</span>
                    <span>·</span>
                    <span className="text-amber-300">{ord.identifier || 'Klant'}</span>
                    <span>·</span>
                    <span className="text-slate-400 font-mono">{ord.time}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveOrderPacking(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Automatic Packaging Recommendation */}
              <div className="p-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="text-cyan-300 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-cyan-400" />
                    <span>Aanbevolen Verpakking voor Bestelling #{ord.no}:</span>
                  </span>
                  <span className="text-slate-400 font-mono font-bold">{totalItemsCount} items totaal</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Zak Advies:</span>
                    <span className="font-bold text-white text-xs">{recommendedBag}</span>
                  </div>

                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Koude Dranken:</span>
                    <span className="font-bold text-sky-300 text-xs">
                      {coldItems.length > 0 
                        ? `🥤 ${coldItems.reduce((s, c) => s + c.item.qty, 0)} koud(e) item(s) in draagkarton` 
                        : 'Geen koude dranken in deze order'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive Item Checklist Split by Category */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-black text-slate-300">
                  <span>Vink producten af tijdens het inpakken:</span>
                  <span className={`font-mono px-2 py-0.5 rounded-full ${
                    isAllChecked ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-amber-300'
                  }`}>
                    {checkedCount} / {totalItemsCount} In gepakt ({Math.round((checkedCount / totalItemsCount) * 100)}%)
                  </span>
                </div>

                {/* Live Progress Bar */}
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.round((checkedCount / totalItemsCount) * 100)}%` }}
                  />
                </div>

                {/* 🔥 Warme items */}
                {warmItems.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                      <span>🔥 Warme Producten (Onderin Zak)</span>
                    </span>
                    {warmItems.map(({ item, index }) => (
                      <label
                        key={index}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                          activeOrderPackingChecklist[index]
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 font-bold'
                            : 'bg-slate-950 border-slate-800 text-white hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={!!activeOrderPackingChecklist[index]}
                            onChange={e => {
                              setActiveOrderPackingChecklist(prev => ({ ...prev, [index]: e.target.checked }));
                            }}
                            className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <div>
                            <span className="font-mono font-black text-amber-400 mr-1.5">{item.qty}x</span>
                            <span className="text-xs font-bold">{item.name}</span>
                            {item.itemNote && (
                              <div className="text-[10px] text-amber-300/90 italic pl-1">📝 {item.itemNote}</div>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                          Warm
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* ❄️ Koude items */}
                {coldItems.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                      <span>❄️ Koude Dranken &amp; Desserts (In Bekerhouder)</span>
                    </span>
                    {coldItems.map(({ item, index }) => (
                      <label
                        key={index}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                          activeOrderPackingChecklist[index]
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 font-bold'
                            : 'bg-slate-950 border-slate-800 text-white hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={!!activeOrderPackingChecklist[index]}
                            onChange={e => {
                              setActiveOrderPackingChecklist(prev => ({ ...prev, [index]: e.target.checked }));
                            }}
                            className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <div>
                            <span className="font-mono font-black text-cyan-400 mr-1.5">{item.qty}x</span>
                            <span className="text-xs font-bold">{item.name}</span>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                          Koud / Bekerhouder
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 🧂 Sauzen & Extra's */}
                {sauceItems.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>🧂 Sauzen &amp; Extra's</span>
                    </span>
                    {sauceItems.map(({ item, index }) => (
                      <label
                        key={index}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                          activeOrderPackingChecklist[index]
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 font-bold'
                            : 'bg-slate-950 border-slate-800 text-white hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={!!activeOrderPackingChecklist[index]}
                            onChange={e => {
                              setActiveOrderPackingChecklist(prev => ({ ...prev, [index]: e.target.checked }));
                            }}
                            className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <div>
                            <span className="font-mono font-black text-amber-400 mr-1.5">{item.qty}x</span>
                            <span className="text-xs font-bold">{item.name}</span>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                          Saus
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Final Complete Action Button */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    // Mark all items checked
                    const allCheckedMap: Record<number, boolean> = {};
                    ord.items.forEach((_, idx) => { allCheckedMap[idx] = true; });
                    setActiveOrderPackingChecklist(allCheckedMap);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  Vink Alles Aan
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateOrderStatus(ord.no, 'klaar');
                    setActiveOrderPacking(null);
                  }}
                  className={`flex-1 py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl transition active:scale-95 ${
                    isAllChecked
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 ring-2 ring-emerald-400/50 animate-pulse'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    ✓ Inpakken Voltooid — Markeer #{ord.no} als Klaar &amp; Omroepen
                  </span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
