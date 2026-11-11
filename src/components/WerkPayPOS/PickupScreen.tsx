import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioFX, SpeechVoiceOption, TtsEngineMode, AudioDiagnosticStatus } from '../../services/audio';
import { getStatusMeta, isOrderInProgress, isOrderReady } from '../../services/orderStatus';
import { getSupabaseClient } from '../../services/store';
import { showToast } from '../../services/appToast';
import { 
  getNewsConfig, 
  getCustomNewsItems, 
  REAL_NOS_FALLBACK_HEADLINES, 
  NewsTickerConfig, 
  NewsItem 
} from '../../services/newsService';
import { 
  Tv, 
  Volume2, 
  Maximize2, 
  Minimize2, 
  Clock, 
  Sparkles, 
  BellRing,
  Settings2,
  CheckCircle2,
  X,
  VolumeX,
  Sliders,
  Play,
  Globe,
  Laptop,
  Megaphone,
  Radio,
  Cpu,
  Link,
  Code2,
  RefreshCw,
  Activity,
  AlertTriangle,
  Check,
  Users,
  Utensils,
  Settings
} from 'lucide-react';

interface AutoScrollingColumnProps {
  children: React.ReactNode;
  className?: string;
}

const AutoScrollingColumn: React.FC<AutoScrollingColumnProps> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let animationFrameId: number;
    let position = el.scrollTop;
    let active = true;

    const scroll = () => {
      if (!active || !el) return;

      const halfHeight = el.scrollHeight / 2;
      if (halfHeight <= el.clientHeight) {
        el.scrollTop = 0;
        position = 0;
        animationFrameId = requestAnimationFrame(scroll);
        return;
      }

      // Sync with manual scrolls if the user dragged or focused an item
      if (Math.abs(el.scrollTop - position) > 1.5) {
        position = el.scrollTop;
      }

      position += 0.35; // Continuous smooth scrolling speed

      if (position >= halfHeight) {
        position -= halfHeight;
      }

      el.scrollTop = position;
      animationFrameId = requestAnimationFrame(scroll);
    };

    // Delay start of scrolling slightly
    const delayTimer = setTimeout(() => {
      if (active) {
        scroll();
      }
    }, 1500);

    return () => {
      active = false;
      clearTimeout(delayTimer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div ref={containerRef} className={`${className} overflow-y-auto no-scrollbar`}>
      <div className="flex flex-col space-y-3 pb-3">
        {children}
      </div>
      <div className="flex flex-col space-y-3 pb-3" aria-hidden="true">
        {children}
      </div>
    </div>
  );
};

interface AutoScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

const AutoScrollContainer: React.FC<AutoScrollContainerProps> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: NodeJS.Timeout;
    let interval: NodeJS.Timeout;
    let active = true;

    const startAutoScroll = () => {
      if (!active || !el) return;
      
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        // Content fits, reset scroll and wait
        el.scrollTop = 0;
        timer = setTimeout(startAutoScroll, 2000);
        return;
      }

      let direction = 1; // 1 = down, -1 = up
      let currentScroll = el.scrollTop;

      interval = setInterval(() => {
        if (!active || !el) return;

        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) {
          el.scrollTop = 0;
          return;
        }

        if (direction === 1) {
          currentScroll += 0.5; // slow smooth scroll down
          if (currentScroll >= max) {
            currentScroll = max;
            el.scrollTop = currentScroll;
            // Pause at the bottom
            clearInterval(interval);
            timer = setTimeout(() => {
              direction = -1;
              startAutoScroll();
            }, 3000); // 3 seconds pause at bottom
            return;
          }
        } else {
          currentScroll -= 1.5; // slightly faster scroll up
          if (currentScroll <= 0) {
            currentScroll = 0;
            el.scrollTop = currentScroll;
            // Pause at the top
            clearInterval(interval);
            timer = setTimeout(() => {
              direction = 1;
              startAutoScroll();
            }, 3000); // 3 seconds pause at top
            return;
          }
        }

        el.scrollTop = currentScroll;
      }, 30); // ~33 fps
    };

    // Delay start of scrolling slightly
    timer = setTimeout(startAutoScroll, 2500);

    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [children]); // Re-run when children change (e.g. orders added/removed)

  return (
    <div ref={containerRef} className={`${className} overflow-y-auto no-scrollbar`}>
      {children}
    </div>
  );
};

export const PickupScreen: React.FC = () => {
  const { orders, pickupClosed, orderStopActive, orderStopText, orderStopConfig, setTrackedOrderNo, activeBrand, brandProducts, products, customBranding } = useApp();
  const [isTvMode, setIsTvMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isTvMode) {
        document.body.classList.add('tv-mode-active');
      } else {
        document.body.classList.remove('tv-mode-active');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('tv-mode-active');
      }
    };
  }, [isTvMode]);
  const [tvView, setTvView] = useState<'pickup' | 'menu' | 'split'>('split');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [clockStyle, setClockStyle] = useState<'pixel' | 'neon' | 'classic'>(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('wd_tv_clock_style') || 'pixel' : 'pixel') as any;
  });

  // Active Widgets Toggles (like phone home screen customization)
  const [activeWidgets, setActiveWidgets] = useState<{
    prep: boolean;
    ready: boolean;
    menu: boolean;
    ticker: boolean;
    deal: boolean;
    waitTime: boolean;
    stats: boolean;
  }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wd_tv_widgets');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { prep: true, ready: true, menu: true, ticker: true, deal: true, waitTime: true, stats: true };
  });

  const [layoutRatio, setLayoutRatio] = useState<'split_50' | 'menu_focus' | 'pickup_focus'>(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('wd_tv_layout_ratio') || 'split_50' : 'split_50') as any;
  });

  const [nosCategory, setNosCategory] = useState<'general' | 'sport' | 'tech' | 'binnenland'>('general');

  // Sync with NewsConfig (TV Layout/Widgets)
  useEffect(() => {
    const handleSync = () => {
      const cfg = getNewsConfig();
      if (cfg.widgets) setActiveWidgets(cfg.widgets);
      if (cfg.layout) setLayoutRatio(cfg.layout);
      setNosCategory(cfg.category);
    };

    handleSync();
    window.addEventListener('wd_news_config_updated', handleSync);
    return () => window.removeEventListener('wd_news_config_updated', handleSync);
  }, []);
  const [showNewsModal, setShowNewsModal] = useState<boolean>(false);
  const [newsArticles, setNewsArticles] = useState<Array<{ title: string; link: string; pubDate?: string; description?: string }>>([
    { title: 'Kabinet presenteert nieuwe plannen voor verduurzaming van de horeca', link: 'https://nos.nl' },
    { title: 'Zonnige lente-dag op komst met temperaturen tot 20 graden in heel Nederland', link: 'https://nos.nl' },
    { title: 'Nederlandse atleten behalen goud op de Europese kampioenschappen', link: 'https://nos.nl' },
    { title: 'Nieuwe technologische doorbraak in AI en automatisering aangekondigd', link: 'https://nos.nl' }
  ]);
  const [newsConfigState, setNewsConfigState] = useState<NewsTickerConfig>(getNewsConfig());
  const [customNewsItems, setCustomNewsItems] = useState<NewsItem[]>(getCustomNewsItems());

  useEffect(() => {
    const handleSync = () => {
      const cfg = getNewsConfig();
      setNewsConfigState(cfg);
      setCustomNewsItems(getCustomNewsItems());
      setNosCategory(cfg.category);
    };

    handleSync();

    window.addEventListener('wd_news_config_updated', handleSync);
    window.addEventListener('storage', handleSync);

    let ch: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        ch = new BroadcastChannel('wd_unified_sync_channel');
        ch.onmessage = (msg) => {
          if (msg.data?.type === 'SYNC_NEWS_CONFIG') {
            handleSync();
          }
        };
      }
    } catch {}

    return () => {
      window.removeEventListener('wd_news_config_updated', handleSync);
      window.removeEventListener('storage', handleSync);
      if (ch) ch.close();
    };
  }, []);

  const [nosHeadlines, setNosHeadlines] = useState<string[]>([
    "🌤️ WEERBERICHT: Zonnig & droog in NL (19°C) · W wind 3 Bft",
    'Kabinet presenteert verduurzamingspakket voor Nederlandse horeca & MKB',
    'Lente-weer zet door met aanhoudend zonnige perioden en 20 graden in heel Nederland',
    'Consumentenvertrouwen stijgt verder door stabilisering van koopkracht',
    'Nederlandse atleten behalen goud en zilver op de Europese kampioenschappen'
  ]);

  useEffect(() => {
    let isMounted = true;

    const rssMap = {
      general: 'https://feeds.nos.nl/nosnieuwsgeneral',
      sport: 'https://feeds.nos.nl/nossportgeneral',
      tech: 'https://feeds.nos.nl/nosnieuwseconomie',
      binnenland: 'https://feeds.nos.nl/nosnieuwsbinnenland',
    };

    const fetchLiveNews = async () => {
      // Gebruik exclusief de fallback-lijst om 422/500-fouten te voorkomen
      const fallbackList = REAL_NOS_FALLBACK_HEADLINES[nosCategory] || REAL_NOS_FALLBACK_HEADLINES.general;
      const weatherItem = "🌤️ WEERBERICHT: Zonnig & droog in NL (19°C) · Wind W 3 Bft";

      // Combine custom alerts + custom items
      const customAlertList = newsConfigState.isCustomAlertActive && newsConfigState.customAlertText.trim()
        ? [`🚨 ${newsConfigState.customAlertText.trim()}`]
        : [];
      const customHeadlineList = customNewsItems.map(it => `📣 [${it.category}] ${it.title}`);

      if (isMounted) {
        const fallbackTitles = fallbackList.map(f => `${f.title} (${f.pubDate})`);
        setNewsArticles(fallbackList as any);
        setNosHeadlines([...customAlertList, ...customHeadlineList, weatherItem, ...fallbackTitles]);
      }
    };

    fetchLiveNews();
    const interval = setInterval(fetchLiveNews, 120000); // 2 min refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [nosCategory, newsConfigState.isCustomAlertActive, newsConfigState.customAlertText, customNewsItems]);

  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [savedPresets, setSavedPresets] = useState<Array<{ id: string; name: string; clockStyle: any; tvView: any; autoRotate: boolean; widgets: any; layoutRatio?: any }>>([
    {
      id: 'arcade_pixel',
      name: '👾 Arcade Pixel TV',
      clockStyle: 'pixel',
      tvView: 'split',
      autoRotate: false,
      layoutRatio: 'split_50',
      widgets: { prep: true, ready: true, menu: true, ticker: true, deal: true, waitTime: true, stats: true }
    },
    {
      id: 'cyber_neon',
      name: '⚡ Cyberpunk Fastfood',
      clockStyle: 'neon',
      tvView: 'split',
      autoRotate: true,
      layoutRatio: 'menu_focus',
      widgets: { prep: true, ready: true, menu: true, ticker: true, deal: true, waitTime: true, stats: false }
    },
    {
      id: 'express_pickup',
      name: '📢 Express Afhaalbalie',
      clockStyle: 'pixel',
      tvView: 'pickup',
      autoRotate: false,
      layoutRatio: 'pickup_focus',
      widgets: { prep: true, ready: true, menu: false, ticker: true, deal: false, waitTime: true, stats: true }
    },
    {
      id: 'menu_stand',
      name: '🍔 Digital Menukaart Stand',
      clockStyle: 'classic',
      tvView: 'menu',
      autoRotate: false,
      layoutRatio: 'split_50',
      widgets: { prep: false, ready: false, menu: true, ticker: true, deal: true, waitTime: false, stats: false }
    }
  ]);
  const [showTvSetupModal, setShowTvSetupModal] = useState<boolean>(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(
    typeof window !== 'undefined' ? localStorage.getItem('wd_tts_voice') || '' : ''
  );
  const [ttsMode, setTtsMode] = useState<TtsEngineMode>(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('wd_tts_mode') || 'auto' : 'auto') as TtsEngineMode;
  });
  const [customTtsUrl, setCustomTtsUrl] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('wd_custom_tts_url') || '' : '';
  });
  const [customTemplate, setCustomTemplate] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('wd_tts_custom_template') || 'Bestelling {orderNo} voor {target} is gereed om af te halen!' : 'Bestelling {orderNo} voor {target} is gereed om af te halen!';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(AudioFX.isEnabled);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(() => AudioFX.getIsUnlocked());
  const [activeAnnouncement, setActiveAnnouncement] = useState<{ orderNo: number | string; text: string; id: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<AudioDiagnosticStatus>(() => AudioFX.getDiagnostics());

  const isKoekploeg = activeBrand === 'koekploeg';
  const brandTitle = customBranding.useCustomBranding ? customBranding.storeName : (isKoekploeg ? 'De Koekploeg' : 'Werkdonalds');
  const brandEmoji = customBranding.useCustomBranding ? customBranding.logoEmoji : (isKoekploeg ? '🧇' : '🍔');
  const brandTagline = customBranding.useCustomBranding ? customBranding.tagline : (isKoekploeg ? 'Vers Bereid • Snelle Service' : 'Vers Bereid • Snelle Kassa & Keuken');
  const brandGradient = customBranding.useCustomBranding ? customBranding.headerGradient : (isKoekploeg ? 'from-amber-600 to-amber-400' : 'from-blue-700 to-blue-500');

  // Real-time clock for fastfood TV screen
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch custom presets from Supabase on mount
  useEffect(() => {
    const fetchSupabasePresets = async () => {
      try {
        const client = getSupabaseClient();
        if (!client) return;
        const { data } = await client.from('tv_presets').select('*');
        if (data && data.length > 0) {
          const formatted = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            clockStyle: row.clock_style || 'pixel',
            tvView: row.view_mode || 'split',
            autoRotate: Boolean(row.auto_rotate),
            widgets: typeof row.widgets === 'string' ? JSON.parse(row.widgets) : row.widgets || { prep: true, ready: true, menu: true, ticker: true }
          }));
          setSavedPresets(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newOnes = formatted.filter((f: any) => !existingIds.has(f.id));
            return [...prev, ...newOnes];
          });
        }
      } catch {
        // Graceful fallback if table does not exist yet
      }
    };
    fetchSupabasePresets();
  }, []);

  // Automatic rotation timer: ONLY cycles between 'pickup' (Afhaallijst) and 'menu' (Menukaart) if enabled AND NOT in split mode!
  useEffect(() => {
    if (!isTvMode || !autoRotate) return;
    if (tvView === 'split') return; // Do NOT override split mode!

    // Toggle between pickup (15s) and menu (25s)
    const delay = tvView === 'pickup' ? 15000 : 25000;

    const timer = setTimeout(() => {
      setTvView((current) => (current === 'pickup' ? 'menu' : 'pickup'));
    }, delay);

    return () => clearTimeout(timer);
  }, [isTvMode, autoRotate, tvView]);

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

  // Listen for live spoken announcements to show on-screen visual banner
  useEffect(() => {
    const unsub = AudioFX.subscribeAnnouncement((announcement) => {
      setActiveAnnouncement(announcement);
      setIsAudioUnlocked(true);
      if (announcement) {
        const timer = setTimeout(() => {
          setActiveAnnouncement(prev => prev?.id === announcement.id ? null : prev);
        }, 9000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, []);

  // Synchroniseer afsluiten van volledig scherm (Esc / F11) met React-state van de TV-modus
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (!isCurrentlyFullscreen && isTvMode) {
        setIsTvMode(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTvMode) {
        if (e.key === 'Escape') {
          setIsTvMode(false);
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTvMode]);

  // Load available speech synthesis voices (with Linux reload detection)
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

  // CRITICAL REQUIREMENT:
  // "en als het een bezorgen is kan je het niet omroepen en hoeft het niet op het scherm snap je ik wil een verbetering voor het afhaalscherm"
  // Filter out all delivery orders!
  const pickupOrders = orders.filter(o => 
    o.orderType !== 'delivery' && 
    !o.identifier?.toLowerCase().includes('bezorg')
  );

  const waitingOrders = pickupOrders.filter(o => o.status === 'new' || o.status === 'wachten').slice(0, 15);
  const preparingOrders = pickupOrders.filter(o => o.status !== 'new' && o.status !== 'wachten' && isOrderInProgress(o.status) && o.status !== 'inpakken').slice(0, 15);
  const packingOrders = pickupOrders.filter(o => o.status === 'inpakken').slice(0, 15);
  const prepOrders = pickupOrders.filter(o => isOrderInProgress(o.status)).slice(0, 30);
  const readyOrders = pickupOrders.filter(o => isOrderReady(o.status)).slice(0, 30);

  const handleToggleTvMode = () => {
    setShowTvSetupModal(true);
  };

  const handleSelectClockStyle = (style: 'pixel' | 'neon' | 'classic') => {
    setClockStyle(style);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_tv_clock_style', style);
    }
  };

  const handleApplyPreset = (preset: {
    id: string;
    name: string;
    clockStyle: 'pixel' | 'neon' | 'classic';
    tvView: 'split' | 'pickup' | 'menu';
    autoRotate: boolean;
    layoutRatio?: 'split_50' | 'menu_focus' | 'pickup_focus';
    widgets: { prep: boolean; ready: boolean; menu: boolean; ticker: boolean; deal: boolean; waitTime: boolean; stats: boolean };
  }) => {
    setClockStyle(preset.clockStyle);
    setTvView(preset.tvView);
    setAutoRotate(preset.autoRotate);
    setActiveWidgets({
      prep: preset.widgets.prep ?? true,
      ready: preset.widgets.ready ?? true,
      menu: preset.widgets.menu ?? true,
      ticker: preset.widgets.ticker ?? true,
      deal: preset.widgets.deal ?? true,
      waitTime: preset.widgets.waitTime ?? true,
      stats: preset.widgets.stats ?? true
    });
    if (preset.layoutRatio) {
      setLayoutRatio(preset.layoutRatio);
      if (typeof window !== 'undefined') {
        localStorage.setItem('wd_tv_layout_ratio', preset.layoutRatio);
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_tv_clock_style', preset.clockStyle);
      localStorage.setItem('wd_tv_widgets', JSON.stringify(preset.widgets));
    }
  };

  const handleToggleWidget = (key: 'prep' | 'ready' | 'menu' | 'ticker' | 'deal' | 'waitTime' | 'stats') => {
    setActiveWidgets(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== 'undefined') {
        localStorage.setItem('wd_tv_widgets', JSON.stringify(next));
      }
      return next;
    });
  };

  const handleSaveCustomPresetToSupabase = async () => {
    const name = presetNameInput.trim() || `Mijn Custom ${clockStyle.toUpperCase()} TV`;
    const newPreset = {
      id: `custom_${Date.now()}`,
      name,
      clockStyle,
      tvView,
      autoRotate,
      widgets: activeWidgets
    };

    setSavedPresets(prev => [newPreset, ...prev]);
    setPresetNameInput('');

    if (typeof window !== 'undefined') {
      localStorage.setItem(`wd_preset_${newPreset.id}`, JSON.stringify(newPreset));
    }

    try {
      const client = getSupabaseClient();
      if (client) {
        await client.from('tv_presets').upsert([{
          id: newPreset.id,
          name: newPreset.name,
          clock_style: newPreset.clockStyle,
          view_mode: newPreset.tvView,
          auto_rotate: newPreset.autoRotate,
          widgets: newPreset.widgets
        }]);
      }
    } catch {
      // Graceful fallback
    }

    showToast(`🚀 TV Preset "${newPreset.name}" opgeslagen! Synchroon met Supabase & lokaal.`, 'success');
  };

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

  const handleSelectTtsMode = (mode: TtsEngineMode) => {
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

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    AudioFX.setEnabled(next);
    if (next) {
      AudioFX.unlock();
      setIsAudioUnlocked(true);
    }
  };

  const handleUnlockAndTest = (orderNum: number = 1002, targetName: string = 'Tafel 4') => {
    AudioFX.unlock();
    setIsAudioUnlocked(true);
    AudioFX.speakOrder(orderNum, targetName, 'dine_in');
  };

  // =========================================================================
  // DEDICATED FULLSCREEN FASTFOOD TV MODE BOARD
  // =========================================================================
  if (isTvMode) {
    const isStopOrClosed = orderStopActive || pickupClosed;

    // 1. TV BLOCKED / CLOSED SCREEN
    if (isStopOrClosed) {
      return (
        <div 
          id="werkdonalds-tv-blocked-root"
          className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-4 sm:p-5 lg:p-6 select-none overflow-hidden animate-in fade-in duration-300"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.12),transparent_70%)] pointer-events-none" />
          
          {/* Main content centered inside a flex-grow area */}
          <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto text-center space-y-8">
            {/* Blinking alarm warning light */}
            <div className="mx-auto w-20 h-20 rounded-full bg-rose-500/10 border-4 border-rose-500 text-rose-500 flex items-center justify-center text-3xl shadow-2xl animate-pulse ring-8 ring-rose-500/20">
              {orderStopConfig?.icon || '⚠️'}
            </div>

            <div className="space-y-4">
              <span className="px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs sm:text-sm font-black tracking-widest uppercase inline-block">
                {orderStopActive ? '⚠️ Tijdelijke Bestelstop Actief' : '🔴 Afhaalbalie Gesloten'}
              </span>
              
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight uppercase bg-gradient-to-r from-white via-slate-300 to-slate-500 bg-clip-text text-transparent">
                {orderStopActive ? (orderStopConfig?.title || "Tijdelijk Geen Bestellingen") : "Momenteel Gesloten"}
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-slate-300 font-medium leading-relaxed max-w-2xl mx-auto">
                {orderStopActive 
                  ? (orderStopText || "Beste gast, wegens extreme drukte in onze keuken hebben we tijdelijk een bestelstop ingelast. We bereiden momenteel de lopende bestellingen voor. Excuses voor de vertraging!")
                  : "Beste gast, onze afhaalbalie en keuken zijn op dit moment gesloten. We verwelkomen je graag snel weer!"
                }
              </p>
            </div>

            {/* Crew message with brand name JoFiam */}
            <div className="pt-6 border-t border-slate-900 flex flex-col items-center justify-center gap-2.5">
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">
                Met vriendelijke groet,
              </p>
              <div className="px-5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 text-sm font-black tracking-wider uppercase shadow-lg">
                {brandEmoji} De Keukenploeg van {brandTitle}
              </div>
            </div>
          </div>

          {/* Quick exit button for admin/staff */}
          <button
            onClick={() => setIsTvMode(false)}
            className="absolute bottom-24 right-8 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-xs font-black transition z-30"
          >
            Sluit TV Modus (Esc)
          </button>

          {/* TV Bottom Marquee Bar is STILL active and running on the blocked screen! */}
          {activeWidgets.ticker && (
            <footer 
              onClick={() => setShowNewsModal(true)}
              title="Klik om alle NOS nieuwsberichten en details te bekijken"
              className="mt-3 bg-slate-950 border-2 border-slate-800 hover:border-rose-600/80 p-2 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold shrink-0 overflow-hidden shadow-2xl cursor-pointer transition group z-20"
            >
              {/* Authentic NOS Red Emblem */}
              <div className="flex items-center gap-2 px-3 py-1 bg-[#E3000F] text-white rounded-xl font-black shrink-0 shadow-lg group-hover:bg-rose-600 transition">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span className="text-xs font-black tracking-widest font-sans">NOS</span>
                <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-rose-100 font-mono tracking-wider uppercase">
                  {nosCategory}
                </span>
              </div>

              <div className="flex-1 overflow-hidden mx-4 relative h-6 flex items-center">
                {(() => {
                  const totalChars = nosHeadlines.join(' ').length;
                  const baseSpeed = newsConfigState.speedSeconds || 22;
                  const headlineDuration = Math.max(18, Math.round((totalChars / 9) * (baseSpeed / 22)));

                  const renderHeadlineSet = (suffix: string) => (
                    <div className="flex items-center gap-8 pr-8 shrink-0">
                      {nosHeadlines.map((headline, idx) => {
                        const isWeather = headline.includes('WEERBERICHT');
                        const isAlert = headline.startsWith('🚨');
                        return (
                          <span key={`${suffix}_${idx}`} className="flex items-center gap-2.5 shrink-0">
                            {isAlert ? (
                              <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black rounded text-[10px] uppercase">
                                SPOED
                              </span>
                            ) : (
                              <span className="text-rose-500 font-black text-xs">●</span>
                            )}
                            <span className={`transition-colors font-bold ${
                              isAlert
                                ? 'text-amber-300 font-black'
                                : isWeather 
                                ? 'text-sky-300 font-black' 
                                : clockStyle === 'pixel' 
                                ? 'text-emerald-300 font-mono' 
                                : 'text-slate-100 group-hover:text-white'
                            }`}>
                              {headline}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  );

                  return (
                    <div 
                      className={`whitespace-nowrap flex items-center ${newsConfigState.paused ? '' : 'animate-marquee'}`}
                      style={{ animationDuration: `${headlineDuration}s` }}
                    >
                      {renderHeadlineSet('setA')}
                      {renderHeadlineSet('setB')}
                    </div>
                  );
                })()}
              </div>

              <div className="text-amber-400 font-mono font-black shrink-0 px-2 text-xs">
                NOS LIVE • {timeStr}
              </div>
            </footer>
          )}
        </div>
      );
    }

    // 2. NORMAL ACTIVE TV SCREEN WITH SLIDESHOW
    return (
      <div 
        id="werkdonalds-tv-mode-root"
        onClick={() => {
          if (!isAudioUnlocked) {
            AudioFX.unlock();
            setIsAudioUnlocked(true);
          }
        }}
        className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-4 sm:p-5 lg:p-6 select-none overflow-hidden"
      >
        {/* Futuristic TV Header with Centered Giant Neon Clock */}
        <header className="grid grid-cols-12 items-center gap-4 pb-3.5 mb-4 border-b-2 border-slate-800/80 shrink-0">
          
          {/* Left: Brand Identifier */}
          <div className="col-span-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center text-2xl shadow-xl font-black shrink-0 ring-2 ring-amber-400/40">
              {brandEmoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase truncate">
                  {brandTitle}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black tracking-wider uppercase flex items-center gap-1 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live TV
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                {tvView === 'split' ? "Vers bereid & Afhaalstatus" : tvView === 'pickup' ? "Afhaalnummers" : "Live Menukaart"}
              </p>
            </div>
          </div>

          {/* Center Stage: Ultra-Cool Giant Pixel LED Matrix, Neon Digital Clock, OR Emergency Alert (when active) */}
          <div className="col-span-6 flex justify-center">
            {newsConfigState.isCustomAlertActive && newsConfigState.customAlertText.trim() ? (
              /* SPOEDBERICHT VERVANGT TIJDELIJK DE KLOK MET VOLLEDIGE LOPENDE TEKST WEERGAVE */
              <div className="w-full max-w-3xl px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600 border-2 border-amber-300 shadow-[0_0_40px_rgba(244,63,94,0.85)] flex items-center justify-between gap-3 animate-pulse overflow-hidden">
                <div className="px-2.5 py-1 bg-slate-950 text-amber-300 font-black text-xs sm:text-sm rounded-lg uppercase tracking-wider font-mono border border-amber-400 shrink-0 shadow-md z-10">
                  🚨 SPOEDBERICHT
                </div>
                
                <div className="flex-1 overflow-hidden relative h-7 flex items-center mx-2 min-w-0">
                  {newsConfigState.customAlertText.length > 32 ? (
                    <div 
                      className="whitespace-nowrap flex items-center animate-marquee"
                      style={{ animationDuration: `${Math.max(14, Math.round(newsConfigState.customAlertText.length * 0.28))}s` }}
                    >
                      <span className="font-black text-slate-950 text-base sm:text-lg lg:text-xl tracking-tight uppercase pr-16 flex items-center gap-4 shrink-0">
                        <span>{newsConfigState.customAlertText}</span>
                        <span className="text-amber-300 bg-slate-950/80 px-2 py-0.5 rounded text-xs font-mono">🚨 SPOED</span>
                      </span>
                      <span className="font-black text-slate-950 text-base sm:text-lg lg:text-xl tracking-tight uppercase pr-16 flex items-center gap-4 shrink-0">
                        <span>{newsConfigState.customAlertText}</span>
                        <span className="text-amber-300 bg-slate-950/80 px-2 py-0.5 rounded text-xs font-mono">🚨 SPOED</span>
                      </span>
                    </div>
                  ) : (
                    <span className="font-black text-slate-950 text-base sm:text-lg lg:text-xl tracking-tight uppercase w-full text-center">
                      {newsConfigState.customAlertText}
                    </span>
                  )}
                </div>

                <div className="text-slate-950 font-mono font-black text-xs shrink-0 bg-white/40 backdrop-blur px-2.5 py-1 rounded-lg border border-white/60 shadow z-10">
                  TV BERICHT
                </div>
              </div>
            ) : clockStyle === 'pixel' ? (
              /* RETRO PIXEL LED MATRIX CLOCK BOARD */
              <div className="px-8 py-2.5 rounded-2xl bg-slate-950 border-4 border-slate-800 shadow-[0_0_35px_rgba(34,197,94,0.25)] flex flex-col items-center backdrop-blur-md relative overflow-hidden ring-2 ring-emerald-500/40">
                <div 
                  className="absolute inset-0 opacity-25 pointer-events-none" 
                  style={{
                    backgroundImage: `radial-gradient(circle, #22c55e 1.2px, transparent 1.2px)`,
                    backgroundSize: '5px 5px'
                  }}
                />

                <div className="flex items-center justify-center relative z-10">
                  <span className="font-mono font-black text-3xl sm:text-4xl lg:text-5xl text-emerald-400 tracking-[0.18em] drop-shadow-[0_0_18px_rgba(34,197,94,0.95)] uppercase">
                    {timeStr || '12:00:00'}
                  </span>
                </div>

                <div className="flex items-center justify-center w-full gap-2 text-[10px] font-mono font-black text-emerald-300/90 uppercase tracking-widest mt-1 relative z-10 border-t border-emerald-900/60 pt-0.5">
                  <span>{dateStr || 'VANDAAG'}</span>
                </div>
              </div>
            ) : clockStyle === 'neon' ? (
              /* CYBERPUNK NEON CLOCK */
              <div className="px-6 py-2.5 rounded-2xl bg-slate-900/90 border-2 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.25)] flex flex-col items-center backdrop-blur-md relative overflow-hidden ring-1 ring-amber-400/20">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-amber-500/10 pointer-events-none" />
                <div className="flex items-center gap-2.5 relative z-10">
                  <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_#f59e0b]" />
                  <span className="font-mono font-black text-3xl sm:text-4xl lg:text-5xl text-amber-300 tracking-widest drop-shadow-[0_0_16px_rgba(251,191,36,0.7)]">
                    {timeStr || '12:00:00'}
                  </span>
                </div>
                <span className="text-[11px] font-black text-amber-200/90 uppercase tracking-widest mt-0.5 relative z-10">
                  {dateStr || 'VANDAAG'}
                </span>
              </div>
            ) : (
              /* MINIMALIST CLASSIC CLOCK */
              <div className="px-6 py-2 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl flex flex-col items-center">
                <span className="font-mono font-black text-2xl sm:text-3xl lg:text-4xl text-white tracking-wider">
                  {timeStr || '12:00:00'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  {dateStr || 'VANDAAG'}
                </span>
              </div>
            )}
          </div>

          {/* Right: Action Controls & Auto-Rotate Badge */}
          <div className="col-span-3 flex items-center justify-end gap-2.5">
            {/* Auto-rotate status badge if active */}
            {autoRotate && (
              <span className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider shadow-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Auto-Wissel (Menu ⇄ Afhaal)
              </span>
            )}

            {/* Exit TV mode button */}
            <button
              onClick={() => {
                setIsTvMode(false);
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
              }}
              className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-2xl transition border border-slate-800 flex items-center gap-1.5 font-bold text-xs"
              title="Sluit TV Volledig Scherm"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Sluit TV</span>
            </button>
          </div>
        </header>

        {/* Live Spoken Announcement Overlay Banner on TV with Visual Sound Wave Equalizer */}
        {activeAnnouncement && (
          <div className="mb-4 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-emerald-500/30 border-4 border-emerald-400 shadow-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-6 duration-300 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-400 text-slate-950 flex items-center justify-center font-black animate-bounce shadow-xl shrink-0">
                <Volume2 className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-emerald-300 flex items-center gap-2">
                  <span className="flex items-center gap-1 h-4">
                    <span className="w-1.5 bg-emerald-400 h-2 animate-pulse rounded-full" />
                    <span className="w-1.5 bg-emerald-400 h-4 animate-pulse rounded-full delay-75" />
                    <span className="w-1.5 bg-emerald-400 h-2.5 animate-pulse rounded-full delay-150" />
                    <span className="w-1.5 bg-emerald-400 h-5 animate-pulse rounded-full delay-100" />
                  </span>
                  🔊 LUIDSPREKER OMROEP BEZIG · BESTELLING #{activeAnnouncement.orderNo}
                </span>
                <p className="text-xl sm:text-3xl font-black text-white mt-0.5 tracking-tight">
                  "{activeAnnouncement.text}"
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveAnnouncement(null)}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900/60"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* TV SLIDE VIEWS BODY */}
        <div className="flex-1 overflow-hidden relative">

          {/* VIEW S: SPLIT-SCREEN (AFHAAL + MENUKAART COMBINATIE) */}
          <div 
            className={`absolute inset-0 w-full h-full transition-all duration-500 transform ${
              tvView === 'split' 
                ? 'opacity-100 scale-100 pointer-events-auto z-10' 
                : 'opacity-0 scale-95 pointer-events-none z-0'
            }`}
          >
            <div className="h-full grid grid-cols-12 gap-5 overflow-hidden">
              
              {/* LEFT SIDE: LIVE AFHAALBESTELLINGEN */}
              {(activeWidgets.prep || activeWidgets.ready) && (
                <div className={`${
                  activeWidgets.menu 
                    ? (layoutRatio === 'menu_focus' ? 'col-span-4' : layoutRatio === 'pickup_focus' ? 'col-span-8' : 'col-span-5') 
                    : 'col-span-12'
                } flex flex-col gap-3.5 h-full overflow-hidden`}>

                  {/* WACHT TIJD ESTIMATOR WIDGET */}
                  {activeWidgets.waitTime && (
                    <div className={`p-2.5 rounded-2xl border flex items-center justify-between shrink-0 ${
                      clockStyle === 'pixel' 
                        ? 'bg-slate-950 border-emerald-500/60 text-emerald-300 font-mono' 
                        : clockStyle === 'neon' 
                        ? 'bg-slate-900 border-amber-500/50 text-amber-300 font-mono' 
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg animate-pulse">⏱️</span>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Geschatte Bereidingstijd</p>
                          <p className="text-xs font-black">
                            {preparingOrders.length === 0 ? 'Direct klaar (~2-3 min)' : `~${Math.max(3, preparingOrders.length * 2)} tot ${Math.max(5, preparingOrders.length * 3)} min wachttijd`}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        clockStyle === 'pixel' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-amber-400'
                      }`}>
                        {preparingOrders.length} in wachtrij
                      </span>
                    </div>
                  )}

                  {/* BEREIDEN KEUKEN */}
                  {activeWidgets.prep && (
                    <div className="flex flex-col gap-3 flex-1 overflow-hidden">
                      {/* SUB-COLUMN: WORDT BEREID */}
                      <div className={`rounded-3xl p-4 shadow-xl flex flex-col flex-1 overflow-hidden transition ${
                        clockStyle === 'pixel'
                          ? 'bg-slate-950/90 border-2 border-emerald-500/60 shadow-[0_0_20px_rgba(34,197,94,0.15)] font-mono'
                          : clockStyle === 'neon'
                          ? 'bg-slate-900/90 border-2 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-900/90 border-2 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full animate-ping ${clockStyle === 'pixel' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            <h3 className={`text-lg font-black uppercase tracking-tight ${clockStyle === 'pixel' ? 'text-emerald-400 font-mono tracking-wider' : clockStyle === 'neon' ? 'text-amber-400 font-mono' : 'text-amber-400'}`}>
                              {clockStyle === 'pixel' ? '👾 IN BEREIDING' : '⏳ Wordt Bereid'} ({preparingOrders.length})
                            </h3>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                          {preparingOrders.length === 0 ? (
                            <p className={`text-xs font-bold py-6 text-center italic ${clockStyle === 'pixel' ? 'text-emerald-600 font-mono' : 'text-slate-600'}`}>
                              Geen bestellingen in bereiding
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {preparingOrders.map(o => (
                                <div key={o.no} className={`p-2.5 rounded-xl border transition-all duration-300 transform hover:scale-[1.03] animate-order-pop ${clockStyle === 'pixel' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 font-mono' : 'bg-slate-950 border-amber-500/30 text-white'}`}>
                                  <span className={`font-mono font-black text-lg ${clockStyle === 'pixel' ? 'text-emerald-300' : 'text-white'}`}>#{o.no}</span>
                                  <p className={`text-[10px] font-bold truncate ${clockStyle === 'pixel' ? 'text-emerald-400/80 font-mono' : 'text-slate-400'}`}>voor {o.identifier || 'Afhaal'}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* SUB-COLUMN: WORDT INGEPAKT */}
                      <div className={`rounded-3xl p-4 shadow-xl flex flex-col flex-1 overflow-hidden transition ${
                        clockStyle === 'pixel'
                          ? 'bg-slate-950/90 border-2 border-emerald-500/60 shadow-[0_0_20px_rgba(34,197,94,0.15)] font-mono'
                          : clockStyle === 'neon'
                          ? 'bg-slate-900/90 border-2 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                          : 'bg-slate-900/90 border-2 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                            <h3 className={`text-lg font-black uppercase tracking-tight ${clockStyle === 'pixel' ? 'text-blue-400 font-mono tracking-wider' : 'text-blue-400'}`}>
                              📦 Wordt Ingepakt ({packingOrders.length})
                            </h3>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                          {packingOrders.length === 0 ? (
                            <p className={`text-xs font-bold py-6 text-center italic ${clockStyle === 'pixel' ? 'text-emerald-600 font-mono' : 'text-slate-600'}`}>
                              Geen bestellingen die worden ingepakt
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {packingOrders.map(o => (
                                <div key={o.no} className={`p-2.5 rounded-xl border transition-all duration-300 transform hover:scale-[1.03] animate-order-pop ${clockStyle === 'pixel' ? 'bg-blue-950/40 border-blue-500/30 text-blue-300 font-mono' : 'bg-slate-950 border-blue-500/30 text-white'}`}>
                                  <span className={`font-mono font-black text-lg ${clockStyle === 'pixel' ? 'text-blue-300' : 'text-white'}`}>#{o.no}</span>
                                  <p className={`text-[10px] font-bold truncate ${clockStyle === 'pixel' ? 'text-blue-400/80 font-mono' : 'text-slate-400'}`}>voor {o.identifier || 'Afhaal'}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GEREED VOOR AFHAAL */}
                  {activeWidgets.ready && (
                    <div className={`rounded-3xl p-4 shadow-2xl flex flex-col flex-1 overflow-hidden transition ${
                      clockStyle === 'pixel'
                        ? 'bg-slate-950/90 border-4 border-emerald-500 shadow-[0_0_25px_rgba(34,197,94,0.3)] ring-4 ring-emerald-500/20 font-mono'
                        : clockStyle === 'neon'
                        ? 'bg-slate-900/90 border-4 border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.3)] ring-4 ring-amber-500/20'
                        : 'bg-slate-900/90 border-4 border-emerald-500 ring-4 ring-emerald-500/20'
                    }`}>
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 mb-2">
                        <div className="flex items-center gap-2">
                          <BellRing className={`w-5 h-5 animate-bounce ${clockStyle === 'pixel' ? 'text-emerald-400' : 'text-amber-400'}`} />
                          <h3 className={`text-lg font-black uppercase tracking-tight ${clockStyle === 'pixel' ? 'text-emerald-300 font-mono tracking-widest' : 'text-emerald-400'}`}>
                            {clockStyle === 'pixel' ? '★ KLAAR OM AF TE HALEN' : '🔔 Klaar om Af te Halen'} ({readyOrders.length})
                          </h3>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto no-scrollbar">
                        {readyOrders.length === 0 ? (
                          <div className={`h-full flex flex-col items-center justify-center font-bold text-xs ${clockStyle === 'pixel' ? 'text-emerald-600 font-mono' : 'text-slate-600'}`}>
                            <span>✨ Geen bestellingen klaar</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {readyOrders.map(o => (
                              <div 
                                key={o.no} 
                                className={`p-3 rounded-xl border flex flex-col justify-between animate-ready-glow ${
                                  activeAnnouncement?.orderNo === o.no 
                                    ? 'bg-emerald-900 border-2 border-amber-400 scale-[1.02]' 
                                    : clockStyle === 'pixel'
                                    ? 'bg-emerald-950/80 border-emerald-400/60 font-mono'
                                    : 'bg-slate-950 border-emerald-500/40'
                                  }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`font-mono font-black text-2xl ${clockStyle === 'pixel' ? 'text-emerald-300' : 'text-emerald-400'}`}>#{o.no}</span>
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                                </div>
                                <p className={`text-xs font-bold truncate ${clockStyle === 'pixel' ? 'text-emerald-200 font-mono' : 'text-white'}`}>voor {o.identifier || 'Klant'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RIGHT SIDE: LIVE DIGITAL MENU BOARD */}
              {activeWidgets.menu && (
                <div className={`${
                  (activeWidgets.prep || activeWidgets.ready) 
                    ? (layoutRatio === 'menu_focus' ? 'col-span-8' : layoutRatio === 'pickup_focus' ? 'col-span-4' : 'col-span-7') 
                    : 'col-span-12'
                } rounded-3xl p-4 shadow-2xl flex flex-col h-full overflow-hidden transition ${
                  clockStyle === 'pixel'
                    ? 'bg-slate-950/95 border-2 border-emerald-500/50 font-mono'
                    : clockStyle === 'neon'
                    ? 'bg-slate-900/95 border-2 border-amber-500/40'
                    : 'bg-slate-900/95 border-2 border-slate-800'
                }`}>
                
                {/* PROMO DEAL BANNER WIDGET */}
                {activeWidgets.deal && (
                  <div className={`mb-3 p-2.5 rounded-2xl border flex items-center justify-between shrink-0 shadow-lg ${
                    clockStyle === 'pixel'
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 font-mono'
                      : clockStyle === 'neon'
                      ? 'bg-amber-950/80 border-amber-400 text-amber-300'
                      : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl animate-bounce">🔥</span>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider block opacity-90">DAGDEAL / PROMO van de DAG</span>
                        <span className="text-xs font-black block">🍔 Werkdonalds Super Deal Menu + Vers Gekoelde Drank</span>
                      </div>
                    </div>
                    <span className="bg-amber-400 text-slate-950 font-mono font-black text-xs px-2.5 py-1 rounded-xl shadow">
                      Slechts €8,95
                    </span>
                  </div>
                )}

                <div className="pb-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍔</span>
                    <div>
                      <h3 className={`text-lg font-black uppercase tracking-tight ${
                        clockStyle === 'pixel' ? 'text-emerald-400 font-mono tracking-widest' : 'text-amber-400'
                      }`}>
                        {clockStyle === 'pixel' ? '📖 PIXEL MENUKAART' : '📖 LIVE DIGITAL MENUKAART'}
                      </h3>
                      <p className={`text-[10px] font-medium ${clockStyle === 'pixel' ? 'text-emerald-500 font-mono' : 'text-slate-400'}`}>
                        Overzicht van onze verse gerechten &amp; prijzen
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                    clockStyle === 'pixel' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    Afhaal &amp; Restaurant
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
                  {/* Category Column 1: Burgers & Snacks */}
                  <div className={`rounded-2xl p-3 border flex flex-col overflow-hidden ${
                    clockStyle === 'pixel' ? 'bg-slate-950 border-emerald-900/80 font-mono' : 'bg-slate-950/60 border-slate-800'
                  }`}>
                    <h4 className={`text-xs font-black uppercase tracking-wider pb-1.5 border-b border-slate-800 mb-2 flex items-center justify-between ${
                      clockStyle === 'pixel' ? 'text-emerald-400 font-mono' : 'text-amber-400'
                    }`}>
                      <span>🍔 Burgers &amp; Snacks</span>
                    </h4>
                    <AutoScrollingColumn className="flex-1 space-y-2.5">
                      {products.filter(p => p.id < 200 && (p.cat.includes('Burger') || p.cat.includes('Snack') || p.cat.includes('Meal'))).map(p => (
                        <div key={p.id} className={`flex items-center justify-between border-b border-slate-900/80 pb-1.5 gap-2 ${!p.inStock ? 'opacity-50' : ''}`}>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${
                              !p.inStock ? 'line-through text-slate-400' : clockStyle === 'pixel' ? 'text-emerald-200 font-mono uppercase' : 'text-white'
                            }`}>
                              {p.emoji || '🍔'} {p.name}
                            </p>
                            {!p.inStock ? (
                              <span className="text-[9px] font-black text-rose-400 bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800 inline-block mt-0.5">
                                TIJDELIJK UITVERKOCHT
                              </span>
                            ) : (
                              <span className={`text-[9px] font-medium ${clockStyle === 'pixel' ? 'text-emerald-600 font-mono' : 'text-slate-500'}`}>Vers bereid</span>
                            )}
                          </div>
                          <span className={`font-mono text-xs font-black shrink-0 ${clockStyle === 'pixel' ? 'text-emerald-400' : 'text-amber-300'}`}>
                            €{(p.onSale && p.salePrice > 0 ? p.salePrice : p.price).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </AutoScrollingColumn>
                  </div>

                  {/* Category Column 2: Frites, Dranken & Koekploeg */}
                  <div className={`rounded-2xl p-3 border flex flex-col overflow-hidden ${
                    clockStyle === 'pixel' ? 'bg-slate-950 border-emerald-900/80 font-mono' : 'bg-slate-950/60 border-slate-800'
                  }`}>
                    <h4 className={`text-xs font-black uppercase tracking-wider pb-1.5 border-b border-slate-800 mb-2 flex items-center justify-between ${
                      clockStyle === 'pixel' ? 'text-emerald-400 font-mono' : 'text-amber-400'
                    }`}>
                      <span>🥤 Frites &amp; Dranken</span>
                    </h4>
                    <AutoScrollingColumn className="flex-1 space-y-2.5">
                      {products.filter(p => p.id >= 200 || p.cat.includes('Friet') || p.cat.includes('Drank') || p.cat.includes('Dessert')).map(p => (
                        <div key={p.id} className={`flex items-center justify-between border-b border-slate-900/80 pb-1.5 gap-2 ${!p.inStock ? 'opacity-50' : ''}`}>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${
                              !p.inStock ? 'line-through text-slate-400' : clockStyle === 'pixel' ? 'text-emerald-200 font-mono uppercase' : 'text-white'
                            }`}>
                              {p.emoji || '🥤'} {p.name}
                            </p>
                            {!p.inStock ? (
                              <span className="text-[9px] font-black text-rose-400 bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800 inline-block mt-0.5">
                                TIJDELIJK UITVERKOCHT
                              </span>
                            ) : (
                              <span className={`text-[9px] font-medium ${clockStyle === 'pixel' ? 'text-emerald-600 font-mono' : 'text-slate-500'}`}>Vers gekoeld</span>
                            )}
                          </div>
                          <span className={`font-mono text-xs font-black shrink-0 ${clockStyle === 'pixel' ? 'text-emerald-400' : 'text-amber-300'}`}>
                            €{(p.onSale && p.salePrice > 0 ? p.salePrice : p.price).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </AutoScrollingColumn>
                  </div>
                </div>
              </div>
              )}

            </div>
          </div>

          {/* VIEW A: LIVE AFHAAL LIJST (ORDERS) */}
          <div 
            className={`absolute inset-0 w-full h-full transition-all duration-500 transform ${
              tvView === 'pickup' 
                ? 'opacity-100 scale-100 pointer-events-auto z-10' 
                : 'opacity-0 scale-95 pointer-events-none z-0'
            }`}
          >
            <div className="h-full grid grid-cols-2 gap-6 overflow-hidden">
              {/* COLUMN 1: WACHTEN & WORDT BEREID */}
              <section className="flex flex-col bg-slate-900/80 border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b-2 border-slate-800 shrink-0 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
                      <Clock className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-amber-400 uppercase tracking-tight flex items-center gap-3">
                        <span>⏳ Bereiden</span>
                        <span className="text-sm px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black border border-amber-500/40">
                          {prepOrders.length}
                        </span>
                      </h2>
                      <span className="text-xs sm:text-sm text-slate-400">Onze keukenploeg maakt uw gerechten vers</span>
                    </div>
                  </div>
                </div>

                {/* IN DE WACHTRIJ LIST */}
                <div className="mb-4 pb-4 border-b border-slate-800 shrink-0">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
                    📥 IN DE WACHTRIJ ({waitingOrders.length})
                  </h3>
                  {waitingOrders.length === 0 ? (
                    <p className="py-2 px-3 rounded-xl bg-slate-950/30 text-slate-500 text-xs font-bold border border-dashed border-slate-800/85">
                      Geen bestellingen in de wachtrij
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-[75px] overflow-y-auto">
                      {waitingOrders.map(o => (
                        <div 
                          key={o.no} 
                          className="px-3.5 py-1 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1 font-mono font-black text-base text-slate-300 shadow-sm"
                        >
                          <span className="text-slate-500 text-xs">#</span>
                          <span>{o.no}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* WORDT BEREID & WORDT INGEPAKT DETAILS */}
                <AutoScrollContainer className="flex-1 pr-1 space-y-6">
                  {/* WORDT BEREID */}
                  <div>
                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      🍳 BEREIDEN IN DE KEUKEN ({preparingOrders.length})
                    </h3>

                    {preparingOrders.length === 0 ? (
                      <p className="py-3 px-4 rounded-xl bg-slate-950/40 text-slate-500 text-xs font-bold border border-dashed border-slate-800">
                        Geen bestellingen in actieve bereiding
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {preparingOrders.map(o => {
                          const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');
                          return (
                             <div
                              key={o.no}
                              className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 text-left shadow-lg flex flex-col justify-between transition-all duration-300 transform hover:scale-[1.03] animate-order-pop"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-black text-xl text-amber-300 tracking-tight">
                                    #{o.no}
                                  </span>
                                  <span className="text-sm">
                                    {o.orderType === 'dine_in' ? '🍽️' : '🛍️'}
                                  </span>
                                </div>
                                <div className="mt-1 font-bold text-[11px] text-slate-300 truncate">
                                  voor <span className="text-amber-200">{displayName}</span>
                                </div>
                              </div>
                              <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-amber-400/95 font-black">
                                <span>Bereiden...</span>
                                <span className="font-mono text-slate-500">{o.time}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* WORDT INGEPAKT */}
                  <div>
                    <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                      📦 INPAKKEN / TRAYEN ({packingOrders.length})
                    </h3>

                    {packingOrders.length === 0 ? (
                      <p className="py-3 px-4 rounded-xl bg-slate-950/40 text-slate-500 text-xs font-bold border border-dashed border-slate-800">
                        Geen bestellingen die worden ingepakt
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {packingOrders.map(o => {
                          const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');
                          return (
                             <div
                              key={o.no}
                              className="p-3.5 rounded-2xl bg-slate-950 border border-blue-500/30 text-left shadow-lg flex flex-col justify-between transition-all duration-300 transform hover:scale-[1.03] animate-order-pop"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-black text-xl text-blue-300 tracking-tight">
                                    #{o.no}
                                  </span>
                                  <span className="text-sm">
                                    {o.orderType === 'dine_in' ? '🍽️' : '🛍️'}
                                  </span>
                                </div>
                                <div className="mt-1 font-bold text-[11px] text-slate-300 truncate">
                                  voor <span className="text-blue-200">{displayName}</span>
                                </div>
                              </div>
                              <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-blue-400/95 font-black">
                                <span>Inpakken...</span>
                                <span className="font-mono text-slate-500">{o.time}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </AutoScrollContainer>
              </section>

              {/* COLUMN 2: GEREED OM AF TE HALEN */}
              <section className="flex flex-col bg-slate-900 border-4 border-emerald-500 rounded-3xl p-5 shadow-2xl overflow-hidden ring-4 ring-emerald-500/20">
                <div className="flex items-center justify-between pb-4 border-b-2 border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner">
                      <BellRing className="w-7 h-7 animate-bounce" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-emerald-400 uppercase tracking-tight flex items-center gap-3">
                        <span>🔔 Ophalen bij balie</span>
                        <span className="text-sm px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-black border border-emerald-500/40">
                          {readyOrders.length}
                        </span>
                      </h2>
                      <span className="text-xs sm:text-sm text-slate-400">Kom direct naar de afhaalbalie</span>
                    </div>
                  </div>
                </div>

                <AutoScrollContainer className="flex-1 pt-4">
                  {readyOrders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 font-bold text-lg">
                      <span className="text-5xl mb-2">✨</span>
                      <span>Geen bestellingen gereed</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {readyOrders.map(o => {
                        const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');
                        const isCurrentAnnounced = activeAnnouncement?.orderNo === o.no;

                        return (
                          <div
                            key={o.no}
                            className={`p-4 rounded-2xl text-left shadow-2xl flex flex-col justify-between transition-all animate-ready-glow ${
                              isCurrentAnnounced 
                                ? 'bg-gradient-to-br from-emerald-900 to-amber-950 border-4 border-amber-400 scale-[1.03] ring-4 ring-amber-400/50' 
                                : 'bg-gradient-to-br from-emerald-950 to-slate-950 border-2 border-emerald-400'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-black text-3xl sm:text-4xl lg:text-5xl text-emerald-300 tracking-tight">
                                  #{o.no}
                                </span>
                                <span className="w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
                              </div>

                              <div className="mt-2 font-black text-base text-white truncate">
                                voor <span className="text-emerald-300 font-black">{displayName}</span>
                              </div>

                              <p className="text-xs font-bold text-emerald-400 mt-0.5">
                                ✓ Gereed voor afhaal!
                              </p>
                            </div>

                            <div className="mt-3.5 pt-2 border-t border-emerald-500/30 flex items-center justify-between text-xs font-bold text-emerald-300">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Balie</span>
                              </span>
                              <span className="font-mono text-emerald-400/80">{o.time}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AutoScrollContainer>
              </section>
            </div>
          </div>

          {/* VIEW B: DIGITAL MENUKAART / MENU BOARD */}
          <div 
            className={`absolute inset-0 w-full h-full transition-all duration-500 transform ${
              tvView === 'menu' 
                ? 'opacity-100 scale-100 pointer-events-auto z-10' 
                : 'opacity-0 scale-95 pointer-events-none z-0'
            }`}
          >
            {(() => {
            const allInStock = products.filter(p => p.inStock);

            const col1Items = allInStock.filter(p => p.id < 200 && (p.cat.includes('Burger') || p.cat.includes('Meal') || p.cat.includes('Voordeel')));
            const col2Items = allInStock.filter(p => p.id < 200 && (p.cat.includes('Snack') || p.cat.includes('Friet') || p.cat.includes('Saus') || p.cat.includes('Dip')));
            const col3Items = allInStock.filter(p => p.id < 200 && (p.cat.includes('Drank') || p.cat.includes('Dessert') || p.cat.includes('IJs') || p.cat.includes('Koffie')));
            const col4Items = allInStock.filter(p => p.id >= 200);

            const columns = [
              {
                brand: "🍔 WERKDONALDS",
                title: "Burgers & Wraps",
                icon: "🍔",
                items: col1Items,
                brandColor: "border-red-500/30 text-red-400 bg-red-950/20"
              },
              {
                brand: "🍟 WERKDONALDS",
                title: "Snacks, Frites & Dips",
                icon: "🍟",
                items: col2Items,
                brandColor: "border-amber-500/30 text-amber-400 bg-amber-950/20"
              },
              {
                brand: "🥤 WERKDONALDS",
                title: "Dranken & Desserts",
                icon: "🍦",
                items: col3Items,
                brandColor: "border-sky-500/30 text-sky-400 bg-sky-950/20"
              },
              {
                brand: "🧇 KOEKPLOEG",
                title: "Koeken & Stroopwafels",
                icon: "🧇",
                items: col4Items,
                brandColor: "border-amber-400/30 text-amber-300 bg-amber-950/30"
              }
            ];

            return (
              <div className="h-full flex flex-col bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                <style>{`
                  .no-scrollbar::-webkit-scrollbar {
                    display: none;
                  }
                  .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                  }
                `}</style>

                <div className="pb-3 border-b border-slate-800 flex items-center justify-between shrink-0 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      📖
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-tight">
                        📖 GEZAMENLIJKE MENUKAART
                      </h2>
                      <p className="text-xs text-slate-400">Geniet van onze WerkDonalds &amp; Koekploeg specialiteiten</p>
                    </div>
                  </div>
                  <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700 font-bold">
                    🔄 Automatisch scrollende menukaart
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 overflow-hidden">
                  {columns.map((col, idx) => (
                    <div key={idx} className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800/80 flex flex-col overflow-hidden">
                      <div className="pb-2 border-b border-slate-900 shrink-0 space-y-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider inline-block ${col.brandColor}`}>
                          {col.brand}
                        </span>
                        <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <span>{col.icon}</span>
                          <span className="truncate">{col.title}</span>
                          <span className="text-slate-500 text-xs font-medium">({col.items.length})</span>
                        </h3>
                      </div>

                      <AutoScrollingColumn className="flex-1 space-y-3 pt-3.5 pr-1.5">
                        {col.items.length === 0 ? (
                          <p className="text-slate-600 text-xs font-bold py-4 text-center">Tijdelijk uitverkocht</p>
                        ) : (
                          col.items.map(p => (
                            <div key={p.id} className="flex items-center justify-between border-b border-slate-900/40 pb-2 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xl shrink-0">{p.emoji || col.icon}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-white truncate">{p.name}</p>
                                  <p className="text-[10px] text-slate-500 font-medium">Vers bereid</p>
                                </div>
                              </div>
                              <div className="text-right font-mono text-xs font-black text-amber-300 shrink-0">
                                {p.onSale && p.salePrice > 0 ? (
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-slate-500 line-through">€{p.price.toFixed(2)}</span>
                                    <span className="text-emerald-400">€{p.salePrice.toFixed(2)}</span>
                                  </div>
                                ) : (
                                  <span>€{p.price.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </AutoScrollingColumn>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          </div>

        </div>

        {/* TV Bottom Marquee Bar */}
        {activeWidgets.ticker && (
          <footer 
            onClick={() => setShowNewsModal(true)}
            title="Klik om alle NOS nieuwsberichten en details te bekijken"
            className="mt-3 bg-slate-950 border-2 border-slate-800 hover:border-rose-600/80 p-2 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold shrink-0 overflow-hidden shadow-2xl cursor-pointer transition group"
          >
            {/* Authentic NOS Red Emblem */}
            <div className="flex items-center gap-2 px-3 py-1 bg-[#E3000F] text-white rounded-xl font-black shrink-0 shadow-lg group-hover:bg-rose-600 transition">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span className="text-xs font-black tracking-widest font-sans">NOS</span>
              <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-rose-100 font-mono tracking-wider uppercase">
                {nosCategory}
              </span>
            </div>

            <div className="flex-1 overflow-hidden mx-4 relative h-6 flex items-center">
              {(() => {
                const totalChars = nosHeadlines.join(' ').length;
                const baseSpeed = newsConfigState.speedSeconds || 22;
                // Compute duration based on length to guarantee a comfortable constant reading speed (~10-12 chars/sec)
                const headlineDuration = Math.max(18, Math.round((totalChars / 9) * (baseSpeed / 22)));

                const renderHeadlineSet = (suffix: string) => (
                  <div className="flex items-center gap-8 pr-8 shrink-0">
                    {nosHeadlines.map((headline, idx) => {
                      const isWeather = headline.includes('WEERBERICHT');
                      const isAlert = headline.startsWith('🚨');
                      return (
                        <span key={`${suffix}_${idx}`} className="flex items-center gap-2.5 shrink-0">
                          {isAlert ? (
                            <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black rounded text-[10px] uppercase">
                              SPOED
                            </span>
                          ) : (
                            <span className="text-rose-500 font-black text-xs">●</span>
                          )}
                          <span className={`transition-colors font-bold ${
                            isAlert
                              ? 'text-amber-300 font-black'
                              : isWeather 
                              ? 'text-sky-300 font-black' 
                              : clockStyle === 'pixel' 
                              ? 'text-emerald-300 font-mono' 
                              : 'text-slate-100 group-hover:text-white'
                          }`}>
                            {headline}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                );

                return (
                  <div 
                    className={`whitespace-nowrap flex items-center ${newsConfigState.paused ? '' : 'animate-marquee'}`}
                    style={{ animationDuration: `${headlineDuration}s` }}
                  >
                    {renderHeadlineSet('setA')}
                    {renderHeadlineSet('setB')}
                  </div>
                );
              })()}
            </div>

            <div className="text-amber-400 font-mono font-black shrink-0 px-2 text-xs">
              NOS LIVE • {timeStr}
            </div>
          </footer>
        )}
      </div>
    );
  }

  // =========================================================================
  // STANDARD VIEW (WITH TOOLBAR & SETTINGS)
  // =========================================================================
  return (
    <div 
      id="werkdonalds-pickup-root"
      onClick={() => {
        if (!isAudioUnlocked) {
          AudioFX.unlock();
          setIsAudioUnlocked(true);
        }
      }}
      className="flex-1 flex flex-col overflow-hidden select-none relative h-[calc(100vh-108px)] bg-slate-950 p-3 sm:p-5"
    >
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Tv className={`w-6 h-6 ${isKoekploeg ? 'text-amber-400' : 'text-blue-400'}`} />
            <span>{brandTitle} Afhaalscherm (Klantenscherm &amp; TV)</span>
          </h1>
          <p className="text-xs text-slate-400">
            Live omroep en afhaalscherm · Bezorgingen worden automatisch gefilterd en niet omgeroepen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Unlock / Status Button */}
          <button
            onClick={() => handleUnlockAndTest(1002, 'Tafel 4')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-sm ${
              isAudioUnlocked 
                ? 'bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border-emerald-800/80'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 animate-pulse font-black'
            }`}
            title="Klik om audio en spraaksynthese direct te ontgrendelen en te testen"
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <span>{isAudioUnlocked ? '🔊 Geluid Actief' : '⚡ Klik: Activeer Geluid'}</span>
          </button>

          {/* Test Voice Button */}
          <button
            onClick={() => handleUnlockAndTest(1001, 'Jan')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Test TTS omroep direct"
          >
            <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Test Omroep</span>
          </button>

          {/* Fullscreen TV Mode */}
          <button
            onClick={handleToggleTvMode}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black shadow-lg transition active:scale-95 ${
              isKoekploeg
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/20'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            <span>Start TV Modus</span>
          </button>
        </div>
      </div>

      {/* Live Visual Spoken Announcement Banner */}
      {activeAnnouncement && (
        <div className="my-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-blue-500/20 border-2 border-emerald-400/80 text-white shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black animate-bounce shadow-lg">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Omroep Luidspreker
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                  Bestelling #{activeAnnouncement.orderNo}
                </span>
              </div>
              <p className="text-sm sm:text-base font-black text-white mt-0.5">
                "{activeAnnouncement.text}"
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleUnlockAndTest(Number(activeAnnouncement.orderNo))}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Herhaal</span>
            </button>
            <button
              onClick={() => setActiveAnnouncement(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content: 2-Column Fastfood Board */}
      {pickupClosed ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 text-4xl shadow-2xl">
            🔴
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white">AFHAALBALIE MOMENTEEL GESLOTEN</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-md">
            De keuken en afhaalbalie zijn op dit moment gesloten. Tot ziens bij {brandTitle}!
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 pt-3 overflow-hidden">
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 overflow-hidden">
            
            {/* COLUMN 1: WORDT BEREID */}
            <div className="flex flex-col bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-amber-400 flex items-center gap-2">
                      <span>⏳ Wordt bereid</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black border border-amber-500/30">
                        {prepOrders.length}
                      </span>
                    </h2>
                    <span className="text-xs text-slate-400">Onze keuken bereidt je bestelling vers</span>
                  </div>
                </div>
              </div>

              <AutoScrollContainer className="flex-1 pt-4 space-y-6">
                {/* SUBSECTION 1: BEREIDEN */}
                <div>
                  <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                    🍳 Wordt Bereid ({preparingOrders.length})
                  </h3>
                  {preparingOrders.length === 0 ? (
                    <p className="py-2.5 px-3.5 rounded-xl bg-slate-950/40 text-slate-500 text-xs font-bold border border-dashed border-slate-800">
                      Geen bestellingen in bereiding
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {preparingOrders.map(o => {
                        const meta = getStatusMeta(o.status);
                        const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');

                        return (
                          <div
                            key={o.no}
                            onClick={() => setTrackedOrderNo(o.no)}
                            className="p-3.5 rounded-2xl bg-slate-950 border-2 border-dashed border-amber-500/40 text-left shadow-inner flex flex-col justify-between hover:border-amber-400 transition cursor-pointer group"
                            title="Klik om status te bekijken"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-black text-2xl sm:text-3xl text-amber-300 group-hover:scale-105 transition-transform">
                                  #{o.no}
                                </span>
                                <span className="text-sm">
                                  {o.orderType === 'dine_in' ? '🍽️' : '🛍️'}
                                </span>
                              </div>

                              <div className="mt-1 font-bold text-xs text-slate-200 truncate" title={displayName}>
                                voor {displayName}
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-400/90 flex items-center gap-1 truncate">
                                  <span>{meta.emoji}</span>
                                  <span className="truncate">{meta.shortLabel}</span>
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {o.time}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SUBSECTION 2: INPAKKEN */}
                <div>
                  <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    📦 Wordt Ingepakt ({packingOrders.length})
                  </h3>
                  {packingOrders.length === 0 ? (
                    <p className="py-2.5 px-3.5 rounded-xl bg-slate-950/40 text-slate-500 text-xs font-bold border border-dashed border-slate-800">
                      Geen bestellingen die worden ingepakt
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {packingOrders.map(o => {
                        const meta = getStatusMeta(o.status);
                        const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');

                        return (
                          <div
                            key={o.no}
                            onClick={() => setTrackedOrderNo(o.no)}
                            className="p-3.5 rounded-2xl bg-slate-950 border-2 border-dashed border-blue-500/40 text-left shadow-inner flex flex-col justify-between hover:border-blue-400 transition cursor-pointer group"
                            title="Klik om status te bekijken"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-black text-2xl sm:text-3xl text-blue-300 group-hover:scale-105 transition-transform">
                                  #{o.no}
                                </span>
                                <span className="text-sm">
                                  {o.orderType === 'dine_in' ? '🍽️' : '🛍️'}
                                </span>
                              </div>

                              <div className="mt-1 font-bold text-xs text-slate-200 truncate" title={displayName}>
                                voor {displayName}
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-blue-400/90 flex items-center gap-1 truncate">
                                  <span>{meta.emoji}</span>
                                  <span className="truncate">{meta.shortLabel}</span>
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {o.time}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </AutoScrollContainer>
            </div>

            {/* COLUMN 2: GEREED OM AF TE HALEN */}
            <div className="flex flex-col bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-4 sm:p-6 shadow-2xl overflow-hidden ring-1 ring-emerald-500/30">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner">
                    <BellRing className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-emerald-400 flex items-center gap-2">
                      <span>🔔 Gereed om af te halen</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-black border border-emerald-500/30">
                        {readyOrders.length}
                      </span>
                    </h2>
                    <span className="text-xs text-slate-400">Kom nu naar de balie met je nummer</span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Afhalen bij balie</span>
                </div>
              </div>

              <AutoScrollContainer className="flex-1 pt-4">
                {readyOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 font-bold text-sm">
                    <span className="text-3xl mb-1">✨</span>
                    <span>Nog geen bestellingen gereed</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {readyOrders.map(o => {
                      const displayName = o.identifier || (o.orderType === 'dine_in' ? 'Tafel' : 'Afhaal');

                      return (
                        <div
                          key={o.no}
                          onClick={() => setTrackedOrderNo(o.no)}
                          className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-slate-950 border-2 border-emerald-400 text-left shadow-lg shadow-emerald-500/15 flex flex-col justify-between hover:scale-[1.02] transition cursor-pointer group animate-in fade-in"
                          title="Klik om live status pop-up te bekijken"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-black text-3xl sm:text-4xl text-emerald-300 group-hover:text-emerald-200 tracking-tight">
                                #{o.no}
                              </span>
                              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                            </div>

                            <div className="mt-2 font-black text-sm text-white truncate" title={displayName}>
                              voor <span className="text-emerald-300">{displayName}</span>
                            </div>
                            
                            <p className="text-[11px] text-emerald-400/90 font-bold mt-0.5">
                              ✓ Is gereed om af te halen
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 font-bold">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Meld je bij de balie</span>
                            </span>
                            <span className="text-[10px] text-emerald-400/80 font-mono">
                              {o.time}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AutoScrollContainer>
            </div>

          </div>

          {/* Bottom Fastfood Ticker Banner */}
          {activeWidgets.ticker && (
            <div className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between text-xs transition ${
              clockStyle === 'pixel' 
                ? 'bg-slate-950 border-emerald-500/60 text-emerald-300 font-mono shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                : clockStyle === 'neon'
                ? 'bg-slate-900/90 border-amber-500/50 text-amber-300 font-sans shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full animate-pulse ${clockStyle === 'pixel' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="font-bold text-white">{brandTitle} Live Afhaal Service</span>
                <span className="hidden md:inline opacity-80">| Bestel via Kassa of Kiosk | Eet smakelijk!</span>
              </div>

              <div className="font-mono font-bold">
                {timeStr}
              </div>
            </div>
          )}

        </div>
      )}

      {/* TV SETUP POPUP MODAL */}
      {showTvSetupModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-white space-y-6 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl font-black shrink-0">
                  📺
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">TV Studio &amp; Home Layout Builder</h2>
                  <p className="text-xs text-slate-400">Kies een preset of stel je eigen TV scherm &amp; thema samen</p>
                </div>
              </div>
              <button
                onClick={() => setShowTvSetupModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Presets Gallery */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                  1. Kies een TV Layout Preset
                </label>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  ☁️ Supabase Synchroon
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {savedPresets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="p-3 rounded-2xl border-2 border-slate-800 bg-slate-950/80 hover:border-amber-500/60 hover:bg-slate-800/80 transition text-left flex flex-col justify-between group"
                  >
                    <div>
                      <p className="font-black text-xs text-white group-hover:text-amber-300">{preset.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {preset.clockStyle === 'pixel' ? '👾 Pixel LED' : preset.clockStyle === 'neon' ? '⚡ Cyber Neon' : '🏛️ Klassiek'} · {preset.tvView}
                      </p>
                    </div>
                    <span className="text-[10px] text-amber-400 font-bold mt-2 underline">Toepassen ➔</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Clock & Theme Style */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                2. Kies Klok &amp; Widget Thema
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectClockStyle('pixel')}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    clockStyle === 'pixel'
                      ? 'bg-emerald-950 border-emerald-400 text-emerald-300 font-black shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl block">👾</span>
                  <span className="text-xs font-bold block mt-1">Pixel Matrix</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectClockStyle('neon')}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    clockStyle === 'neon'
                      ? 'bg-amber-950 border-amber-400 text-amber-300 font-black shadow-lg shadow-amber-500/20'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl block">⚡</span>
                  <span className="text-xs font-bold block mt-1">Cyber Neon</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectClockStyle('classic')}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    clockStyle === 'classic'
                      ? 'bg-slate-800 border-slate-400 text-white font-black shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl block">🏛️</span>
                  <span className="text-xs font-bold block mt-1">Klassiek</span>
                </button>
              </div>
            </div>

            {/* Section 3: TV Scherm Modus & Indeling */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                3. Kies Scherm Weergave Modus
              </label>

              {/* View Mode Selector: Split, Pickup Full, Menu Full */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTvView('split');
                    setAutoRotate(false);
                    if (typeof window !== 'undefined') localStorage.setItem('wd_tv_view', 'split');
                  }}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    tvView === 'split' && !autoRotate
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-black shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xl block">⚡</span>
                  <span className="text-xs font-bold block mt-1">Splitscreen (Beide)</span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Afhaal + Menukaart</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTvView('pickup');
                    if (typeof window !== 'undefined') localStorage.setItem('wd_tv_view', 'pickup');
                  }}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    tvView === 'pickup' && !autoRotate
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-black shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xl block">🛍️</span>
                  <span className="text-xs font-bold block mt-1">Afhaallijst</span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Volledig Scherm</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTvView('menu');
                    if (typeof window !== 'undefined') localStorage.setItem('wd_tv_view', 'menu');
                  }}
                  className={`p-2.5 rounded-2xl border-2 text-center transition ${
                    tvView === 'menu' && !autoRotate
                      ? 'bg-blue-500/20 border-blue-400 text-blue-300 font-black shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xl block">🍔</span>
                  <span className="text-xs font-bold block mt-1">Menukaart</span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Volledig Scherm</span>
                </button>
              </div>

              {/* Auto-Rotate Toggle */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-white block">🔄 Auto-Wisselen Schermen</span>
                  <span className="text-[10px] text-slate-400 block">Wisselt automatisch om de 15s tussen Afhaallijst &amp; Menukaart</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoRotate;
                    setAutoRotate(next);
                    if (next && tvView === 'split') {
                      setTvView('pickup');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                    autoRotate ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {autoRotate ? 'AAN ✓' : 'UIT ✗'}
                </button>
              </div>

              {/* Layout Ratio Selector for Splitscreen */}
              {tvView === 'split' && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-300 block">Splitscreen Verhouding (Ratio):</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutRatio('split_50');
                        if (typeof window !== 'undefined') localStorage.setItem('wd_tv_layout_ratio', 'split_50');
                      }}
                      className={`p-2 rounded-xl border text-center transition ${
                        layoutRatio === 'split_50' ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[11px] block font-mono font-black">50 / 50</span>
                      <span className="text-[10px] block opacity-80">Gelijkmatig</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLayoutRatio('menu_focus');
                        if (typeof window !== 'undefined') localStorage.setItem('wd_tv_layout_ratio', 'menu_focus');
                      }}
                      className={`p-2 rounded-xl border text-center transition ${
                        layoutRatio === 'menu_focus' ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[11px] block font-mono font-black">30 / 70</span>
                      <span className="text-[10px] block opacity-80">Menu Focus</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLayoutRatio('pickup_focus');
                        if (typeof window !== 'undefined') localStorage.setItem('wd_tv_layout_ratio', 'pickup_focus');
                      }}
                      className={`p-2 rounded-xl border text-center transition ${
                        layoutRatio === 'pickup_focus' ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[11px] block font-mono font-black">70 / 30</span>
                      <span className="text-[10px] block opacity-80">Afhaal Focus</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Widgets Toggles Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleWidget('prep')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.prep ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">⏳ Wordt Bereid</span>
                  {activeWidgets.prep ? <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleWidget('ready')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.ready ? 'bg-emerald-500/20 border-emerald-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">🔔 Klaar om Af te Halen</span>
                  {activeWidgets.ready ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleWidget('menu')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.menu ? 'bg-blue-500/20 border-blue-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">🍔 Live Menukaart</span>
                  {activeWidgets.menu ? <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleWidget('deal')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.deal ? 'bg-rose-500/20 border-rose-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">🔥 Promo Deal Banner</span>
                  {activeWidgets.deal ? <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleWidget('waitTime')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.waitTime ? 'bg-cyan-500/20 border-cyan-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">⏱️ Wachttijd Estimator</span>
                  {activeWidgets.waitTime ? <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleWidget('ticker')}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    activeWidgets.ticker ? 'bg-purple-500/20 border-purple-400 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="text-xs font-bold">💬 Onderste Ticker</span>
                  {activeWidgets.ticker ? <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                </button>
              </div>
            </div>

            {/* Section 4: Opslaan in Supabase */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                4. Opslaan als Preset in Supabase
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={e => setPresetNameInput(e.target.value)}
                  placeholder="Bijv. Vrijdag Drukte TV"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-bold"
                />
                <button
                  type="button"
                  onClick={handleSaveCustomPresetToSupabase}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-black text-xs transition flex items-center gap-1.5 shrink-0"
                >
                  <span>💾 Opslaan in Supabase</span>
                </button>
              </div>
            </div>

            {/* Start Action Button */}
            <button
              type="button"
              onClick={() => {
                setShowTvSetupModal(false);
                setIsTvMode(true);
                AudioFX.unlock();
                setIsAudioUnlocked(true);
                const elem = document.getElementById('werkdonalds-tv-mode-root') || document.documentElement;
                if (elem && elem.requestFullscreen) {
                  elem.requestFullscreen().catch(() => {});
                }
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-sm sm:text-base uppercase tracking-wider shadow-xl shadow-amber-500/20 transition active:scale-98 flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-5 h-5" />
              <span>🚀 Start TV Scherm in Volledig Scherm</span>
            </button>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* NOS LIVE NIEUWS OVERZICHT MODAL */}
      {/* ========================================================================= */}
      {showNewsModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl p-6 max-w-3xl w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-400 flex items-center justify-center font-black text-xl shadow">
                  🔴
                </div>
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <span>NOS LIVE NIEUWS OVERZICHT</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                      Realtime RSS
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">Laatste nieuwsartikelen &amp; weerbericht in Nederland</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowNewsModal(false)}
                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Selector Tabs */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setNosCategory('general')}
                className={`py-2 px-3 rounded-xl border text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  nosCategory === 'general' ? 'bg-rose-600 border-rose-500 text-white shadow' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>📰 Algemeen</span>
              </button>

              <button
                type="button"
                onClick={() => setNosCategory('sport')}
                className={`py-2 px-3 rounded-xl border text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  nosCategory === 'sport' ? 'bg-amber-600 border-amber-500 text-white shadow' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>⚽ Sport</span>
              </button>

              <button
                type="button"
                onClick={() => setNosCategory('tech')}
                className={`py-2 px-3 rounded-xl border text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  nosCategory === 'tech' ? 'bg-sky-600 border-sky-500 text-white shadow' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>💻 Economie &amp; Tech</span>
              </button>

              <button
                type="button"
                onClick={() => setNosCategory('binnenland')}
                className={`py-2 px-3 rounded-xl border text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  nosCategory === 'binnenland' ? 'bg-emerald-600 border-emerald-500 text-white shadow' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>🇳🇱 Binnenland</span>
              </button>
            </div>

            {/* Weather Banner */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-sky-950 to-slate-950 border border-sky-500/40 text-sky-300 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl animate-bounce">🌤️</span>
                <div>
                  <span className="font-black block uppercase text-[10px] opacity-80">ACTUEEL WEER NEDERLAND</span>
                  <span className="font-bold">18°C · Half bewolkt &amp; droog · Wind W 3 Bft</span>
                </div>
              </div>
              <span className="bg-sky-900/60 border border-sky-400/40 px-2.5 py-1 rounded-xl text-[10px] font-mono font-black">
                KNMI Live
              </span>
            </div>

            {/* Articles List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {newsArticles.length === 0 ? (
                <div className="text-center py-8 text-slate-500 font-bold text-xs">
                  Aan het laden van live nieuwsberichten...
                </div>
              ) : (
                newsArticles.map((art, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-rose-500/50 transition group flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-black text-white group-hover:text-rose-300 transition">
                        {art.title}
                      </h3>
                      {art.pubDate && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                          {new Date(art.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {art.description && (
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {art.description}
                      </p>
                    )}

                    <div className="pt-1 flex items-center justify-between text-[11px]">
                      <span className="text-rose-400 font-bold">NOS Live Nieuws</span>
                      <a
                        href={art.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                      >
                        <span>Lees artikel op NOS.nl</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Close Modal Footer */}
            <div className="pt-2 border-t border-slate-800 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewsModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
              >
                Sluiten
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
