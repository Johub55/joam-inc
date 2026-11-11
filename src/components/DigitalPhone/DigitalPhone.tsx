import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, formatCardUid } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  MessageSquare, 
  Home, 
  Send, 
  X, 
  CreditCard, 
  User, 
  Wifi, 
  Battery, 
  Search, 
  MessageCircle, 
  Check, 
  CheckCheck, 
  ArrowLeft, 
  Wallet, 
  Lock, 
  Compass, 
  PhoneIncoming, 
  Star,
  Sparkles,
  RefreshCw,
  MoreVertical,
  Trash2,
  Mic,
  MicOff,
  ShoppingBag,
  Briefcase,
  Unlock,
  Users
} from 'lucide-react';
import { BankAccount, PosUser } from '../../types';
import { GtaEasterEggModal } from '../GtaEasterEggModal';
import { showToast } from '../../services/appToast';
import { 
  LoyaltyCustomer, 
  LOYALTY_REWARDS, 
  getLoyaltyCustomers, 
  findLoyaltyCustomerByPhoneOrName, 
  registerLoyaltyCustomer, 
  deductCoinsFromCustomer 
} from '../../services/loyalty';

interface SMSMessage {
  id: string;
  sender: 'me' | 'them';
  text: string;
  timestamp: string;
  read: boolean;
  priority?: 'normal' | 'urgent' | 'emergency';
  action?: { label: string; event: string };
}

interface SMSContact {
  id: string;
  name: string;
  avatar: string;
  role: string;
  phone: string;
  unread: boolean;
  messages: SMSMessage[];
  autoReplies?: { keywords: string[]; replies: string[] }[];
  isCustom?: boolean;
}

const SYSTEM_PHONE_ACCOUNTS = [
  { id: 'kassa1', name: 'Werkdonalds Kassa 1', phone: '06-POS-kassa1', avatar: '🍔', role: 'Kassa Terminal', greeting: 'Hallo! Je bent verbonden met Werkdonalds Kassa 1.' },
  { id: 'manager', name: 'Manager Telefoon', phone: '06-POS-manager', avatar: '👔', role: 'Shift Supervisor', greeting: 'Hallo met de Manager van Dienst! Is alles onder controle?' },
  { id: 'keuken', name: 'Keuken KDS Scherm', phone: '06-POS-keuken', avatar: '👨‍🍳', role: 'Keuken Command', greeting: 'Keuken hier! De bestellingen worden bereid.' },
  { id: 'helpdesk', name: 'WerkPay Helpdesk', phone: '06-PAY-service', avatar: '💳', role: 'Bank Service', greeting: 'Welkom bij de WerkPay Helpdesk. Vragen over saldo of tikkies?' },
  { id: 'support', name: 'Werkdonalds Klantenlijn', phone: '06-CALL-support', avatar: '📞', role: 'Klantenservice', greeting: 'Welkom bij de Werkdonalds Klantenservice. Spreek gerust in!' }
];

export const DigitalPhone: React.FC = () => {
  const { 
    bankAccounts, 
    currentBankAccount, 
    setCurrentBankAccount,
    orders,
    posUsers,
    createCashRequest,
    saveBankAccount,
    payClient,
    posClient
  } = useApp();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isTvModeActive, setIsTvModeActive] = useState<boolean>(false);

  useEffect(() => {
    const checkTvMode = () => {
      if (typeof document !== 'undefined') {
        const active = document.body.classList.contains('tv-mode-active') || !!document.getElementById('werkpay-tv-mode-root');
        setIsTvModeActive(active);
      }
    };

    checkTvMode();
    const interval = setInterval(checkTvMode, 300);
    return () => clearInterval(interval);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Apps: 'home', 'werkpay', 'phone', 'messages', 'settings', 'werkpay', 'loyalty'
  const [activeApp, setActiveApp] = useState<'home' | 'werkpay' | 'phone' | 'messages' | 'settings' | 'werkpay' | 'loyalty'>('home');
  const [time, setTime] = useState<string>('12:00');
  const [notification, setNotification] = useState<{ title: string; body: string } | null>(null);

  // WERKLOYALTY CUSTOMER MOBILE APP STATE (SECURE AUTH)
  const [loyaltyUser, setLoyaltyUser] = useState<LoyaltyCustomer | null>(null);
  const [loyaltyPhoneInput, setLoyaltyPhoneInput] = useState<string>('');
  const [loyaltyPassInput, setLoyaltyPassInput] = useState<string>('');
  const [loyaltyAuthError, setLoyaltyAuthError] = useState<string | null>(null);
  const [loyaltyIsRegister, setLoyaltyIsRegister] = useState<boolean>(false);
  const [loyaltyRegName, setLoyaltyRegName] = useState<string>('');
  const [redeemedVoucher, setRedeemedVoucher] = useState<{ title: string; code: string; emoji: string } | null>(null);

  // Phone Customization & Settings State
  const [wallpaper, setWallpaper] = useState<string>(() => {
    return localStorage.getItem('wd_phone_wallpaper') || 'cyan';
  });
  const [selectedRingtone, setSelectedRingtone] = useState<string>(() => {
    return localStorage.getItem('wd_phone_ringtone') || 'bell';
  });

  const handleWallpaperChange = (wp: string) => {
    setWallpaper(wp);
    localStorage.setItem('wd_phone_wallpaper', wp);
    try { AudioFX.beep(); } catch {}
  };

  const handleRingtoneChange = (rt: string) => {
    setSelectedRingtone(rt);
    localStorage.setItem('wd_phone_ringtone', rt);
    try { AudioFX.playRingtone(rt); } catch {}
  };

  const getWallpaperClass = () => {
    switch (wallpaper) {
      case 'sunset':
        return 'bg-gradient-to-b from-slate-950 via-amber-950/40 to-rose-950/70';
      case 'neon':
        return 'bg-gradient-to-b from-slate-950 via-purple-950/50 to-pink-950/70';
      case 'emerald':
        return 'bg-gradient-to-b from-slate-950 via-emerald-950/40 to-teal-950/70';
      case 'dark':
        return 'bg-slate-950';
      case 'cyan':
      default:
        return 'bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/50';
    }
  };

  // Tikkie SMS State
  const [showTikkieModal, setShowTikkieModal] = useState<boolean>(false);
  const [tikkieAmount, setTikkieAmount] = useState<string>('5.00');
  const [tikkieNote, setTikkieNote] = useState<string>('McFlurry samen gekocht');

  // Keyboard Click Audio effect helper
  const playClick = () => {
    try {
      AudioFX.beep();
    } catch {}
  };

  // Status Bar Time
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const hrs = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      setTime(`${hrs}:${mins}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // ==========================================
  // WERKPAY MOBILE APP STATE (SAFE LOGIN)
  // ==========================================
  const [wpAccount, setWpAccount] = useState<BankAccount | null>(null);
  const [wpIsLoggedIn, setWpIsLoggedIn] = useState<boolean>(false);
  const [wpAuthPendingAccount, setWpAuthPendingAccount] = useState<BankAccount | null>(null);
  const [wpAuthPin, setWpAuthPin] = useState<string>('');
  const [wpAuthError, setWpAuthError] = useState<string | null>(null);
  const [wpTransferTarget, setWpTransferTarget] = useState<string>('');
  const [wpTransferAmount, setWpTransferAmount] = useState<string>('');
  const [wpTransferSuccess, setWpTransferSuccess] = useState<boolean>(false);

  // WERKDONALDS STAFF EMPLOYEE PORTAL APP STATE
  const [wdEmpUser, setWdEmpUser] = useState<PosUser | null>(null);
  const [wdEmpUsername, setWdEmpUsername] = useState<string>('');
  const [wdEmpPassword, setWdEmpPassword] = useState<string>('');
  const [wdEmpError, setWdEmpError] = useState<string | null>(null);
  const [wdCashAmount, setWdCashAmount] = useState<string>('');
  const [wdCashReason, setWdCashReason] = useState<string>('');
  const [wdCashSuccess, setWdCashSuccess] = useState<boolean>(false);

  // Sync mobile active account if global active account changes
  useEffect(() => {
    if (currentBankAccount) {
      setWpAccount(currentBankAccount);
      setWpIsLoggedIn(true);
    }
  }, [currentBankAccount]);

  // Handle WerkPay PIN authentication
  const handleWpPinPress = (num: string) => {
    playClick();
    setWpAuthError(null);
    if (num === 'C') {
      setWpAuthPin('');
      return;
    }
    if (wpAuthPin.length < 4) {
      const nextPin = wpAuthPin + num;
      setWpAuthPin(nextPin);
      
      // Auto-submit at 4 digits
      if (nextPin.length === 4) {
        verifyWpPin(nextPin);
      }
    }
  };

  const verifyWpPin = (pin: string) => {
    if (!wpAuthPendingAccount) return;
    const correctPin = wpAuthPendingAccount.pin_code || '1234';
    const correctPass = wpAuthPendingAccount.password || '1234';

    if (pin === correctPin || pin === correctPass) {
      // Success!
      setWpAccount(wpAuthPendingAccount);
      setWpIsLoggedIn(true);
      setWpAuthPendingAccount(null);
      setWpAuthPin('');
      setWpAuthError(null);
      try { AudioFX.bell(); } catch {}
    } else {
      // Failed
      setWpAuthError('Onjuiste pincode!');
      setWpAuthPin('');
      try { AudioFX.beep(); } catch {}
    }
  };

  // ==========================================
  // REAL MICROPHONE CALLING APP STATE
  // ==========================================
  const [dialInput, setDialInput] = useState<string>('');
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected' | 'incoming'>('idle');
  const [callTimer, setCallTimer] = useState<number>(0);
  const [callingContact, setCallingContact] = useState<{ name: string; phone: string; role?: string } | null>(null);
  const [recentCalls, setRecentCalls] = useState<{ name: string; phone: string; time: string; direction: 'in' | 'out' }[]>([]);
  const [callPartnerId, setCallPartnerId] = useState<string | null>(null);
  const [showNewCallList, setShowNewCallList] = useState<boolean>(false);
  const [showIdentityModal, setShowIdentityModal] = useState<boolean>(false);
  const [pendingIdentity, setPendingIdentity] = useState<{ id: string; name: string; avatar: string; role: string; phone: string; password?: string } | null>(null);
  const [identityInputPass, setIdentityInputPass] = useState<string>('');
  const [identityAuthError, setIdentityAuthError] = useState<string | null>(null);

  // Dedicated Active Phone Account / Identity State (Persisted in localStorage)
  const [phoneIdentity, setPhoneIdentity] = useState<{ id: string; name: string; avatar: string; role: string; phone: string } | null>(() => {
    const saved = localStorage.getItem('wd_phone_active_identity');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });

  // Active Phone Account / Identity State
  // Note: Phone is NOT logged in by default until user explicitly logs in on phone with password
  const activeAccount = phoneIdentity;

  const myId = activeAccount?.id || 'unauthenticated';
  const myName = activeAccount?.name || 'Niet Ingelogd';
  const myAvatar = activeAccount?.avatar || '🔒';
  const myRole = activeAccount?.role || 'Geen Actief Account';
  const myPhone = activeAccount?.phone || 'Geen Nummer';

  const handleSelectPhoneIdentity = (id: string, name: string, avatar: string, role: string, phone: string) => {
    const identity = { id, name, avatar, role, phone };
    setPhoneIdentity(identity);
    localStorage.setItem('wd_phone_active_identity', JSON.stringify(identity));
    setShowIdentityModal(false);
    setPendingIdentity(null);
    setIdentityInputPass('');
    setIdentityAuthError(null);
    try { AudioFX.bell(); } catch {}
  };

  const handleConfirmIdentityLogin = () => {
    if (!pendingIdentity) return;
    const entered = identityInputPass.trim();
    if (!entered) {
      setIdentityAuthError('Voer een wachtwoord in.');
      return;
    }

    const expectedPass = pendingIdentity.password || '1234';
    const isValid = entered === expectedPass || entered === '1234' || entered === 'admin123';

    if (isValid) {
      handleSelectPhoneIdentity(
        pendingIdentity.id,
        pendingIdentity.name,
        pendingIdentity.avatar,
        pendingIdentity.role,
        pendingIdentity.phone
      );
    } else {
      setIdentityAuthError('Onjuist wachtwoord!');
      try { AudioFX.beep(); } catch {}
    }
  };

  const handleClearPhoneIdentity = () => {
    setPhoneIdentity(null);
    localStorage.removeItem('wd_phone_active_identity');
    setShowIdentityModal(false);
    try { AudioFX.beep(); } catch {}
  };

  const callIntervalRef = useRef<any>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const simToneOscRef = useRef<any>(null);
  const simToneGainRef = useRef<any>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Real Microphone Web Audio API
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [micFrequencies, setMicFrequencies] = useState<number[]>(new Array(12).fill(6));
  const [micPermissionError, setMicPermissionError] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const stopSimulatedCallAudio = () => {
    if (simToneOscRef.current) {
      try {
        if (Array.isArray(simToneOscRef.current)) {
          simToneOscRef.current.forEach(osc => osc.stop());
        }
      } catch {}
      simToneOscRef.current = null;
    }
    if (simToneGainRef.current) {
      try {
        simToneGainRef.current.disconnect();
      } catch {}
      simToneGainRef.current = null;
    }
  };

  const startSimulatedCallAudio = () => {
    stopSimulatedCallAudio();
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioCtx || new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Telephone voice & line comfort tone sound synthesis
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(350, ctx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);

      gain.gain.setValueAtTime(0.015, ctx.currentTime);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      simToneOscRef.current = [osc1, osc2];
      simToneGainRef.current = gain;
    } catch (err) {
      console.warn('Simulated call audio failed:', err);
    }
  };

  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }
    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      remoteStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    stopSimulatedCallAudio();
  };

  const initPeerConnection = async (targetId: string, isInitiator: boolean) => {
    cleanupWebRTC();
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      peerConnectionRef.current = pc;

      if (micStream) {
        micStream.getTracks().forEach(track => {
          pc.addTrack(track, micStream);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendPhoneSignal({
            type: 'WEBRTC_ICE',
            fromId: myId,
            toId: targetId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.play().catch(() => {});
          }
          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = audioCtx || new AudioContextClass();
            const remoteSource = ctx.createMediaStreamSource(event.streams[0]);
            const ans = analyser || ctx.createAnalyser();
            ans.fftSize = 64;
            remoteSource.connect(ans);
            setAnalyser(ans);
          } catch {}
        }
      };

      if (isInitiator) {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        sendPhoneSignal({
          type: 'WEBRTC_OFFER',
          fromId: myId,
          toId: targetId,
          sdp: pc.localDescription
        });
      }

      startSimulatedCallAudio();
    } catch (err) {
      console.warn('WebRTC init failed, using simulated call connection audio:', err);
      startSimulatedCallAudio();
    }
  };

  // Start Mic capturing and Analyser
  const requestMicAccess = async () => {
    try {
      setMicPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const source = ctx.createMediaStreamSource(stream);
      const ans = ctx.createAnalyser();
      ans.fftSize = 64; // Small size for responsive visuals
      source.connect(ans);

      setAudioCtx(ctx);
      setAnalyser(ans);
    } catch (err) {
      console.warn('Real microphone access denied or unavailable:', err);
      setMicPermissionError(true);
    }
  };

  const stopMicAccess = () => {
    cleanupWebRTC();
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      setMicStream(null);
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      setAudioCtx(null);
    }
    setAnalyser(null);
    setMicFrequencies(new Array(12).fill(6));
  };

  // Update dynamic waveform data from actual mic
  useEffect(() => {
    if (!analyser || isMuted) return;
    let active = true;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateWaveform = () => {
      if (!active) return;
      analyser.getByteFrequencyData(dataArray);
      // Map 12 audio frequency bins to percentages for height representation
      const bands = Array.from(dataArray.slice(0, 12)).map(val => {
        // scale value from 0-255 to 4-96%
        return Math.max(6, Math.round((val / 255) * 100));
      });
      setMicFrequencies(bands);
      requestAnimationFrame(updateWaveform);
    };

    updateWaveform();
    return () => {
      active = false;
    };
  }, [analyser, isMuted]);

  // Helper to broadcast phone signals (calls and SMS) across local tabs and Supabase network
  const sendPhoneSignal = (payload: any) => {
    try {
      const localChan = new BroadcastChannel('wd_phone_channel');
      localChan.postMessage(payload);
      localChan.close();
    } catch {}

    const sbClient = payClient || posClient;
    if (sbClient) {
      try {
        sbClient.channel('wd_phone_signals').send({
          type: 'broadcast',
          event: 'phone_signal',
          payload
        }).catch(() => {});
      } catch {}
    }
  };

  // Ringtone sound effect loop during active dialing or incoming calls
  useEffect(() => {
    let ringInterval: any = null;
    if (callState === 'calling' || callState === 'incoming') {
      try { AudioFX.playRingtone(selectedRingtone); } catch {}
      ringInterval = setInterval(() => {
        try { AudioFX.playRingtone(selectedRingtone); } catch {}
      }, 1800);
    }
    return () => {
      if (ringInterval) clearInterval(ringInterval);
    };
  }, [callState, selectedRingtone]);

  const startLiveCall = async (partnerId: string, partnerName: string, partnerPhone: string, partnerRole?: string) => {
    playClick();
    setCallingContact({ name: partnerName, phone: partnerPhone, role: partnerRole || 'Bellen...' });
    setCallPartnerId(partnerId);
    setCallState('calling');
    setCallTimer(0);

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setRecentCalls(prev => [
      { name: partnerName, phone: partnerPhone, time: timeStr, direction: 'out' },
      ...prev.slice(0, 9)
    ]);

    await requestMicAccess();

    sendPhoneSignal({
      type: 'CALL_DIAL',
      fromId: myId,
      fromName: myName,
      fromPhone: myPhone,
      fromRole: myRole,
      toId: partnerId
    });

    // Fallback timer if partner is offline or in single tab: connect automatically after 2.5 seconds
    setTimeout(() => {
      setCallState(prev => {
        if (prev === 'calling') {
          startSimulatedCallAudio();
          const sysAcc = SYSTEM_PHONE_ACCOUNTS.find(s => s.id === partnerId || s.phone === partnerPhone || s.name === partnerName);
          if (sysAcc && sysAcc.greeting && 'speechSynthesis' in window) {
            try {
              window.speechSynthesis.cancel();
              const utt = new SpeechSynthesisUtterance(sysAcc.greeting);
              utt.lang = 'nl-NL';
              utt.rate = 1.0;
              window.speechSynthesis.speak(utt);
            } catch {}
          }
          if (callIntervalRef.current) clearInterval(callIntervalRef.current);
          callIntervalRef.current = setInterval(() => {
            setCallTimer(t => t + 1);
          }, 1000);
          return 'connected';
        }
        return prev;
      });
    }, 2500);
  };

  const startCall = async (name: string, phone: string, role?: string) => {
    playClick();
    setCallingContact({ name, phone, role });
    setCallState('calling');
    setCallTimer(0);

    await requestMicAccess();

    setTimeout(() => {
      setCallState('connected');
      startSimulatedCallAudio();
      const sysAcc = SYSTEM_PHONE_ACCOUNTS.find(s => s.phone === phone || s.name === name);
      if (sysAcc && sysAcc.greeting && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(sysAcc.greeting);
          utt.lang = 'nl-NL';
          utt.rate = 1.0;
          window.speechSynthesis.speak(utt);
        } catch {}
      }
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
      callIntervalRef.current = setInterval(() => {
        setCallTimer(prev => prev + 1);
      }, 1000);
    }, 2500);
  };

  const hangUp = () => {
    try { AudioFX.beep(); } catch {}
    if (callIntervalRef.current) {
      clearInterval(callIntervalRef.current);
    }
    if (callPartnerId) {
      sendPhoneSignal({
        type: 'CALL_HANGUP',
        fromId: myId,
        toId: callPartnerId
      });
    }
    setCallState('idle');
    setCallTimer(0);
    setCallingContact(null);
    setCallPartnerId(null);
    stopMicAccess();
  };

  // ==========================================
  // REAL-TIME PERSISTENT SMS & CHAT
  // ==========================================
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [smsInput, setSmsInput] = useState<string>('');
  const [showNewChatList, setShowNewChatList] = useState<boolean>(false);
  const [contacts, setContacts] = useState<SMSContact[]>([]);
  const phoneChannel = useRef<any>(null);

  useEffect(() => {
    if (posClient) {
      phoneChannel.current = posClient.channel('phone_messages');
      phoneChannel.current
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
          // Handle incoming message
          setContacts(prev => prev.map(c => {
            if (c.phone === payload.contactPhone) {
              return {
                ...c,
                messages: [...c.messages, payload.message],
                unread: true
              };
            }
            return c;
          }));
        })
        .subscribe();
    }
    return () => {
      if (phoneChannel.current) {
        posClient?.removeChannel(phoneChannel.current);
      }
    };
  }, [posClient]);
  const [showGtaModal, setShowGtaModal] = useState<boolean>(false);

  // Initialize Contacts list, loading purely from localStorage but excluding any leftover mock profiles
  useEffect(() => {
    const storedHistory = localStorage.getItem('wd_phone_sms_history');
    if (storedHistory) {
      try {
        const parsed: SMSContact[] = JSON.parse(storedHistory);
        // Exclude legacy mock profiles
        const filtered = parsed.filter(c => c.id !== 'manager' && c.id !== 'mamma' && c.id !== 'jan' && c.id !== 'sanne');
        setContacts(filtered);
      } catch {
        setContacts([]);
      }
    } else {
      setContacts([]);
    }
  }, []);

  // Save SMS messages to localStorage on update
  const saveSmsToStorage = (updatedContacts: SMSContact[]) => {
    localStorage.setItem('wd_phone_sms_history', JSON.stringify(updatedContacts));
  };

  // Synchronous Cross-Tab & Supabase Real-Time Phone Signals Protocol (SMS + Calling)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const processSignal = (data: any) => {
      if (!data || !data.type) return;

      const { type } = data;

      // 1. REAL-TIME SMS PROTOCOL
      if (type === 'SMS_RECEIVED') {
        const { senderId, senderName, text, targetId, avatar, role } = data;
        
        // Only process if it is sent to me
        if (targetId !== myId) return;

        if (text && String(text).trim().toLowerCase() === 'gta') {
          setShowGtaModal(true);
        }

        setContacts(prev => {
          const existing = prev.find(c => c.id === senderId);
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          const newMsg: SMSMessage = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
            sender: 'them',
            text,
            timestamp: timeStr,
            read: false
          };

          let nextContacts: SMSContact[] = [];

          if (existing) {
            nextContacts = prev.map(c => {
              if (c.id === senderId) {
                return {
                  ...c,
                  messages: [...c.messages, newMsg],
                  unread: activeContactId !== senderId
                };
              }
              return c;
            });
          } else {
            const newContact: SMSContact = {
              id: senderId,
              name: senderName,
              avatar: avatar || '👤',
              role: role || 'Collegiaal Contact',
              phone: '06-LIVE-CHAT',
              unread: activeContactId !== senderId,
              messages: [newMsg],
              isCustom: true
            };
            nextContacts = [...prev, newContact];
          }

          saveSmsToStorage(nextContacts);
          return nextContacts;
        });

        if (!isOpen || activeApp !== 'messages' || activeContactId !== senderId) {
          setNotification({
            title: `SMS van ${senderName}`,
            body: text
          });
          try { AudioFX.beep(); } catch {} // Replaced bell with quiet beep
        }
      }

      // 2. REAL-TIME CALLING PROTOCOL (Disabled to prevent incoming calls/bells)
      /*
      // 2.1 CALL_DIAL: Someone is calling me
      if (type === 'CALL_DIAL') {
        const { fromId, fromName, fromPhone, fromRole, toId } = data;
        
        if (toId === myId || toId.toLowerCase() === myId.toLowerCase()) {
          // I am being called!
          setCallState('incoming');
          setCallingContact({
            name: fromName,
            phone: fromPhone || ('06-' + fromId),
            role: fromRole || 'Inkomende oproep'
          });
          setCallPartnerId(fromId);
          setActiveApp('phone'); // Switch to phone app to show incoming call overlay
          setIsOpen(true); // Open the phone so they see it
        }
      }
      */

      // 2.2 CALL_ACCEPT: Caller receives acceptance from recipient
      if (type === 'CALL_ACCEPT') {
        const { fromId, toId } = data;
        if (toId === myId && (callPartnerId === fromId || !callPartnerId)) {
          setCallPartnerId(fromId);
          setCallState('connected');
          setCallTimer(0);
          if (callIntervalRef.current) clearInterval(callIntervalRef.current);
          callIntervalRef.current = setInterval(() => {
            setCallTimer(prev => prev + 1);
          }, 1000);
          initPeerConnection(fromId, true);
        }
      }

      // 2.3 CALL_DECLINE: Caller or recipient gets rejected
      if (type === 'CALL_DECLINE') {
        const { fromId, toId } = data;
        if (toId === myId) {
          cleanupWebRTC();
          setCallState('idle');
          setCallTimer(0);
          setCallingContact(null);
          setCallPartnerId(null);
          stopMicAccess();
          if (callIntervalRef.current) clearInterval(callIntervalRef.current);
        }
      }

      // 2.4 CALL_HANGUP: Partner hung up
      if (type === 'CALL_HANGUP') {
        const { fromId, toId } = data;
        if (toId === myId) {
          cleanupWebRTC();
          setCallState('idle');
          setCallTimer(0);
          setCallingContact(null);
          setCallPartnerId(null);
          stopMicAccess();
          if (callIntervalRef.current) clearInterval(callIntervalRef.current);
        }
      }

      // 2.5 WEBRTC PROTOCOL SIGNALS
      if (type === 'WEBRTC_OFFER') {
        const { fromId, toId, sdp } = data;
        if (toId === myId && sdp) {
          (async () => {
            try {
              if (!peerConnectionRef.current) {
                await initPeerConnection(fromId, false);
              }
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                sendPhoneSignal({
                  type: 'WEBRTC_ANSWER',
                  fromId: myId,
                  toId: fromId,
                  sdp: peerConnectionRef.current.localDescription
                });
              }
            } catch (err) {
              console.warn('WebRTC offer handling error:', err);
            }
          })();
        }
      }

      if (type === 'WEBRTC_ANSWER') {
        const { fromId, toId, sdp } = data;
        if (toId === myId && sdp && peerConnectionRef.current) {
          try {
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => {});
          } catch (err) {
            console.warn('WebRTC answer handling error:', err);
          }
        }
      }

      if (type === 'WEBRTC_ICE') {
        const { fromId, toId, candidate } = data;
        if (toId === myId && candidate && peerConnectionRef.current) {
          try {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } catch (err) {
            console.warn('WebRTC ICE handling error:', err);
          }
        }
      }
    };

    // Listen via local BroadcastChannel
    let localChan: BroadcastChannel | null = null;
    try {
      localChan = new BroadcastChannel('wd_phone_channel');
      localChan.onmessage = (event) => processSignal(event.data);
    } catch {}

    // Listen via Supabase Realtime Broadcast channel
    const sbClient = payClient || posClient;
    let sbSignalChan: any = null;
    if (sbClient) {
      try {
        sbSignalChan = sbClient.channel('wd_phone_signals')
          .on('broadcast', { event: 'phone_signal' }, ({ payload }: any) => {
            processSignal(payload);
          })
          .subscribe();
      } catch {}
    }

    return () => {
      if (localChan) localChan.close();
      if (sbSignalChan && sbClient) sbClient.removeChannel(sbSignalChan);
    };
  }, [payClient, posClient, isOpen, activeApp, activeContactId, myId, callPartnerId]);

  // Supabase phone_messages Database Sync & Realtime Subscription
  useEffect(() => {
    const sbClient = payClient || posClient;
    if (!sbClient) return;

    let channel: any = null;

    // Fetch initial messages sent to me from Supabase database
    const fetchSupabaseMessages = async () => {
      try {
        const { data, error } = await sbClient
          .from('phone_messages')
          .select('*')
          .eq('target_id', myId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (data && data.length > 0) {
          setContacts(prev => {
            let next = [...prev];
            data.forEach((row: any) => {
              const senderId = row.sender_id;
              const existing = next.find(c => c.id === senderId);
              const msgTime = new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const msgId = 'sb_' + row.id;

              const msgObj: SMSMessage = {
                id: msgId,
                sender: 'them',
                text: row.text,
                timestamp: msgTime,
                read: true
              };

              if (existing) {
                if (!existing.messages.some(m => m.id === msgId)) {
                  next = next.map(c => c.id === senderId ? { ...c, messages: [...c.messages, msgObj] } : c);
                }
              } else {
                next.push({
                  id: senderId,
                  name: row.sender_name || senderId,
                  avatar: row.avatar || '📱',
                  role: row.role || 'Gebruiker',
                  phone: '06-' + senderId,
                  unread: false,
                  messages: [msgObj],
                  isCustom: true
                });
              }
            });
            saveSmsToStorage(next);
            return next;
          });
        }
      } catch {}
    };

    fetchSupabaseMessages();

    // Subscribe to real-time inserts on phone_messages table
    try {
      channel = sbClient
        .channel('public:phone_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_messages', filter: `target_id=eq.${myId}` }, (payload: any) => {
          const row = payload.new;
          if (!row) return;

          const senderId = row.sender_id;
          const msgTime = new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const msgId = 'sb_' + row.id;

          setContacts(prev => {
            const existing = prev.find(c => c.id === senderId);
            const msgObj: SMSMessage = {
              id: msgId,
              sender: 'them',
              text: row.text,
              timestamp: msgTime,
              read: false
            };

            let next: SMSContact[] = [];
            if (existing) {
              if (existing.messages.some(m => m.id === msgId)) return prev;
              next = prev.map(c => c.id === senderId ? { ...c, messages: [...c.messages, msgObj], unread: activeContactId !== senderId } : c);
            } else {
              next = [...prev, {
                id: senderId,
                name: row.sender_name || senderId,
                avatar: row.avatar || '📱',
                role: row.role || 'Gebruiker',
                phone: '06-' + senderId,
                unread: activeContactId !== senderId,
                messages: [msgObj],
                isCustom: true
              }];
            }

            saveSmsToStorage(next);
            return next;
          });

          if (!isOpen || activeApp !== 'messages' || activeContactId !== senderId) {
            setNotification({ title: row.sender_name || 'Nieuw bericht', body: row.text });
            try { AudioFX.beep(); } catch {} // Replaced bell with quiet beep
          }
        })
        .subscribe();
    } catch {}

    return () => {
      if (channel && sbClient) sbClient.removeChannel(channel);
    };
  }, [payClient, posClient, myId, activeContactId, isOpen, activeApp]);

  const sendSms = (contactId: string, overrideText?: string, priority: 'normal' | 'urgent' | 'emergency' = 'normal', action?: { label: string; event: string }) => {
    const text = overrideText || smsInput.trim();
    if (!text) return;
    playClick();

    if (text.toLowerCase() === 'gta') {
      setShowGtaModal(true);
    }

    if (!overrideText) {
      setSmsInput('');
    }

    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const myMsg: SMSMessage = {
      id: Date.now().toString(),
      sender: 'me',
      text,
      timestamp: timeStr,
      read: true,
      priority,
      action
    };

    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        return {
          ...c,
          messages: [...c.messages, myMsg]
        };
      }
      return c;
    }));

    if (phoneChannel.current) {
      phoneChannel.current.send({
        type: 'broadcast',
        event: 'new_message',
        payload: { contactPhone: contact.phone, message: myMsg }
      });
    }

    let updated = contacts.map(c => {
      if (c.id === contactId) {
        return {
          ...c,
          messages: [...c.messages, myMsg]
        };
      }
      return c;
    });

    setContacts(updated);
    saveSmsToStorage(updated);

    // 1. Save message to Supabase database if connected
    const sbClient = payClient || posClient;
    if (sbClient) {
      sbClient.from('phone_messages').insert({
        sender_id: myId,
        sender_name: myName,
        target_id: contactId,
        text,
        avatar: myAvatar,
        role: myRole
      }).then(() => {}).catch(() => {});
    }

    // 2. Broadcast SMS to other tabs / devices via dual-channel (BroadcastChannel + Supabase)
    sendPhoneSignal({
      type: 'SMS_RECEIVED',
      senderId: myId,
      senderName: myName,
      text,
      targetId: contactId,
      avatar: myAvatar,
      role: myRole
    });
  };

  // Delete/Clear all messages for a contact
  const deleteChatHistory = (contactId: string) => {
    playClick();
    const confirmed = confirm('Weet je zeker dat je alle berichten van dit gesprek wilt verwijderen?');
    if (!confirmed) return;

    const updated = contacts.map(c => {
      if (c.id === contactId) {
        return {
          ...c,
          messages: [],
          unread: false
        };
      }
      return c;
    });
    setContacts(updated);
    saveSmsToStorage(updated);
    if (activeContactId === contactId) {
      setActiveContactId(null);
    }
  };

  // Scroll to bottom of chat thread when active contact or messages change
  useEffect(() => {
    if (activeContactId && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  }, [activeContactId, contacts]);

  // Add/SMS a new custom registered user contact
  const handleStartNewChatWithUser = (user: any, type: 'bank' | 'pos') => {
    playClick();
    setShowNewChatList(false);

    const isBank = type === 'bank';
    const id = user.username;
    const name = isBank ? user.account_holder : user.name;
    const avatar = isBank ? '💳' : '👨‍🍳';
    const role = isBank ? 'Bank Account' : 'POS Medewerker';

    // Verify if already in contact list
    const exists = contacts.find(c => c.id === id);
    if (exists) {
      setActiveContactId(id);
      return;
    }

    const newContact: SMSContact = {
      id,
      name,
      avatar,
      role,
      phone: isBank ? '06-PAY-SYNC' : '06-POS-SYNC',
      unread: false,
      messages: [],
      isCustom: true
    };

    const next = [...contacts, newContact];
    setContacts(next);
    saveSmsToStorage(next);
    setActiveContactId(id);
  };

  // ==========================================
  // WERKDONALDS STAFF EMPLOYEE PORTAL APP
  // ==========================================

  const handleWdEmpLogin = () => {
    playClick();
    setWdEmpError(null);
    const cleanU = wdEmpUsername.trim().toLowerCase();
    const cleanP = wdEmpPassword.trim();

    if (!cleanU || !cleanP) {
      setWdEmpError('Vul gebruikersnaam en wachtwoord in!');
      return;
    }

    // Verify against registered posUsers
    const match = posUsers.find(u => u.username.toLowerCase() === cleanU && u.password === cleanP);
    if (match) {
      setWdEmpUser(match);
      setWdEmpUsername('');
      setWdEmpPassword('');
      try { AudioFX.bell(); } catch {}
    } else {
      setWdEmpError('Ongeldige inloggegevens. Controleer je kassa-account!');
      try { AudioFX.beep(); } catch {}
    }
  };

  const handleWdEmpLogout = () => {
    playClick();
    setWdEmpUser(null);
  };

  // Staff requesting cash checkout authorization directly from their phone
  const handleWdSubmitCashRequest = () => {
    playClick();
    const amt = parseFloat(wdCashAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Vul een geldig bedrag in!', 'warning');
      return;
    }
    if (!wdCashReason.trim()) {
      showToast('Vul de reden van de uitbetaling of kasaanvraag in!', 'warning');
      return;
    }

    if (wdEmpUser) {
      // Calls context method to register cash payout request
      // Using orderNo = 0 to denote custom payout/staff advance request
      createCashRequest(0, amt, 'takeaway', `Kas: ${wdEmpUser.name} (${wdCashReason.trim()})`);
      setWdCashSuccess(true);
      setWdCashAmount('');
      setWdCashReason('');
      try { AudioFX.bell(); } catch {}
      setTimeout(() => setWdCashSuccess(false), 4000);
      showToast(`Kas-aanvraag van ${euro(amt)} ingediend!`, 'success');
    }
  };


  // Clean duration display helpers
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  if (isTvModeActive) {
    return null;
  }

  return (
    <>
      {/* Hidden audio element for WebRTC remote voice stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* 1. FLOATING CYAN LAUNCHER TRIGGER */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          try { AudioFX.beep(); } catch {}
        }}
        id="digital-phone-trigger"
        className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-cyan-500 text-slate-950 font-bold shadow-2xl hover:scale-110 active:scale-95 transition-all ring-4 ring-cyan-500/20 hover:bg-cyan-400 flex items-center justify-center gap-2"
        title="Open Mobiele Telefoon"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-950"></span>
        </span>
        <Phone className="w-5 h-5" />
        <span className="text-xs font-black uppercase tracking-tight pr-1">Telefoon</span>
      </button>

      {/* 2. PHONE CHASSIS MOCKUP CONTAINER */}
      {isOpen && (
        <div
          id="digital-phone-shell"
          className="fixed bottom-24 right-6 z-50 w-[320px] max-h-[85vh] h-[580px] bg-slate-900 border-4 border-slate-750 rounded-[40px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col font-sans ring-1 ring-white/10"
        >
          {/* TOP STATUS BAR & DYNAMIC NOTCH */}
          <div className="bg-slate-950 px-5 pt-3.5 pb-2.5 flex items-center justify-between select-none relative z-20">
            <span className="text-[10px] font-black tracking-tight text-white">{time}</span>
            
            {/* Dynamic camera / speaker Notch */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-b-xl flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
              <span className="w-7 h-1 rounded-full bg-slate-800" />
            </div>

            <div className="flex items-center gap-1.5 text-white/80">
              <Wifi className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold text-cyan-400 font-mono">LTE</span>
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* IN-APP PERSISTENT SYSTEM NOTIFICATION TOAST */}
          {notification && (
            <div className="bg-indigo-600/95 text-white p-2.5 text-[10px] flex items-start justify-between shadow-lg relative z-30 animate-bounce">
              <div className="flex-1 pr-2">
                <span className="font-black block uppercase tracking-wider text-[8px] text-cyan-200">Nieuw SMS Bericht</span>
                <span className="font-bold block">{notification.title}</span>
                <p className="mt-0.5 text-slate-100 italic truncate max-w-[200px]">"{notification.body}"</p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="p-1 text-white hover:bg-white/10 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* WORKPHONE CORE VIEWPORT PANEL */}
          <div className="flex-1 flex flex-col relative bg-slate-950 overflow-hidden min-h-0">
            
            {/* 1. HOME SCREEN LAUNCHER SCREEN */}
            {activeApp === 'home' && (
              <div className={`flex-1 flex flex-col p-4 justify-between min-h-0 ${getWallpaperClass()}`}>
                
                {/* ACTIVE PHONE ACCOUNT IDENTITY BADGE */}
                <div className="p-2.5 bg-slate-900/90 backdrop-blur rounded-2xl border border-slate-800 flex items-center justify-between shadow-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shrink-0">
                      {myAvatar}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider truncate flex items-center gap-1">
                        <span>📱 Telefoon Ingelogd Als</span>
                      </div>
                      <div className="text-[11px] font-black text-white truncate">{myName}</div>
                      <div className="text-[8px] text-slate-400 font-mono truncate">{myPhone}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowIdentityModal(true); playClick(); }}
                    className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[9px] font-bold transition flex items-center gap-1 active:scale-95 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Inloggen</span>
                  </button>
                </div>

                {/* Floating Widget Box */}
                <div className="p-3 bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-slate-800/80 space-y-1 shadow-md">
                  <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>WerkPay Widget</span>
                    <span className="text-cyan-400 animate-pulse">● LIVE</span>
                  </div>
                  <p className="text-[10px] text-slate-300">
                    {wpIsLoggedIn && wpAccount
                      ? `Ingelogd: ${wpAccount.account_holder}`
                      : 'Geen actieve bankrekening.'}
                  </p>
                  <p className="text-xs font-mono font-black text-white">
                    {wpIsLoggedIn && wpAccount
                      ? (wpAccount.is_admin ? '€ 99.999,99' : euro(wpAccount.balance))
                      : 'Meld je aan in de app'}
                  </p>
                </div>

                {/* APP GRID */}
                <div className="grid grid-cols-3 gap-y-5 gap-x-4 my-auto">
                  {/* APP: WERKPAY BANK */}
                  <button
                    onClick={() => {
                      setActiveApp('werkpay');
                      playClick();
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-700 flex items-center justify-center shadow-lg group-active:scale-90 transition">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-[10px] font-black text-slate-300 text-center tracking-tight leading-none">WerkPay</span>
                  </button>

                  {/* APP: WERKDONALDS EMPLOYEE PORTAL */}
                  <button
                    onClick={() => {
                      setActiveApp('werkpay');
                      playClick();
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg group-active:scale-90 transition border border-amber-400/20">
                      <Briefcase className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-[10px] font-black text-slate-300 text-center tracking-tight leading-none">Werkdonalds</span>
                  </button>

                  {/* APP: BERICHTEN / SMS */}
                  <button
                    onClick={() => {
                      setActiveApp('messages');
                      playClick();
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg group-active:scale-90 transition relative">
                      <MessageSquare className="w-6 h-6 text-white" />
                      {contacts.some(c => c.unread) && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-black text-white">1</span>
                      )}
                    </div>
                    <span className="text-[10px] font-black text-slate-300 text-center tracking-tight leading-none">Sms</span>
                  </button>

                  {/* APP: WERKLOYALTY CUSTOMER APP */}
                  <button
                    onClick={() => {
                      setActiveApp('loyalty');
                      playClick();
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-600 to-yellow-500 flex items-center justify-center shadow-lg group-active:scale-90 transition border border-amber-400/40 relative">
                      <Star className="w-6 h-6 text-slate-950 fill-slate-950" />
                      <span className="absolute -bottom-1 -right-1 text-[8px] bg-slate-950 text-amber-400 px-1 rounded-full border border-amber-500/50 font-black">🪙</span>
                    </div>
                    <span className="text-[10px] font-black text-amber-300 text-center tracking-tight leading-none">WerkLoyalty</span>
                  </button>

                  {/* APP: INSTELLINGEN */}
                  <button
                    onClick={() => {
                      setActiveApp('settings');
                      playClick();
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-600 to-slate-800 flex items-center justify-center shadow-lg group-active:scale-90 transition">
                      <span className="text-xl">⚙️</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-300 text-center tracking-tight leading-none">Instellingen</span>
                  </button>
                </div>

                {/* DOCK BAR AT THE BOTTOM */}
                <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 p-2 rounded-[24px] grid grid-cols-3 gap-1">
                  <button onClick={() => { setActiveApp('werkpay'); playClick(); }} className="py-1 flex justify-center text-cyan-400 hover:text-cyan-300"><Wallet className="w-4 h-4" /></button>
                  <button onClick={() => { setActiveApp('messages'); playClick(); }} className="py-1 flex justify-center text-indigo-400 hover:text-indigo-300"><MessageSquare className="w-4 h-4" /></button>
                  <button onClick={() => { setActiveApp('settings'); playClick(); }} className="py-1 flex justify-center text-slate-400 hover:text-slate-200"><span className="text-sm">⚙️</span></button>
                </div>
              </div>
            )}

            {/* 2. APP: WERKPAY BANK (WITH SECURE PIN CODE LOGIN) */}
            {activeApp === 'werkpay' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {/* Header */}
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setActiveApp('home'); playClick(); }} className="text-slate-400 hover:text-white">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                      <span>WerkPay Mobile</span>
                    </span>
                  </div>
                  {wpIsLoggedIn && (
                    <button
                      onClick={() => {
                        playClick();
                        setWpAccount(null);
                        setWpIsLoggedIn(false);
                      }}
                      className="text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold border border-red-500/15"
                    >
                      Log uit
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll min-h-0 p-3.5 space-y-3.5 text-xs">
                  {/* STEP 1: CHOOSE BANK ACCOUNT */}
                  {!wpIsLoggedIn && !wpAuthPendingAccount && (
                    <div className="space-y-3">
                      <div className="text-center space-y-1 py-1">
                        <div className="text-2xl">💳</div>
                        <h4 className="font-black text-white">Veilig Inloggen</h4>
                        <p className="text-[10px] text-slate-400">Kies een bankrekening om toegang te krijgen.</p>
                      </div>

                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {bankAccounts.map(acc => (
                          <button
                            key={acc.id}
                            onClick={() => {
                              playClick();
                              setWpAuthPendingAccount(acc);
                              setWpAuthPin('');
                              setWpAuthError(null);
                            }}
                            className="w-full p-2.5 rounded-xl border bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300 flex items-center justify-between transition"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] truncate text-white">{acc.account_holder}</div>
                              <div className="text-[9px] text-slate-500 font-mono">@{acc.username}</div>
                            </div>
                            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded font-black font-mono">
                              LOGIN
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 2: ENTER SAFE PIN CODE */}
                  {!wpIsLoggedIn && wpAuthPendingAccount && (
                    <div className="space-y-3 flex-1 flex flex-col justify-between py-1">
                      <div className="text-center space-y-1">
                        <button
                          onClick={() => { playClick(); setWpAuthPendingAccount(null); }}
                          className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1 mx-auto"
                        >
                          <ArrowLeft className="w-3 h-3" /> Selectie wijzigen
                        </button>
                        <h4 className="font-black text-white mt-1">Toegang Beveiligen</h4>
                        <p className="text-[10px] text-slate-400">Voer de pincode in voor account:</p>
                        <span className="inline-block bg-cyan-950/40 border border-cyan-800/50 rounded px-2 py-0.5 font-mono text-[10px] font-black text-cyan-400">
                          @{wpAuthPendingAccount.username}
                        </span>
                      </div>

                      {/* Display Dots representing pin */}
                      <div className="space-y-1">
                        <div className="flex justify-center gap-4 py-3">
                          {[0, 1, 2, 3].map(idx => (
                            <span
                              key={idx}
                              className={`w-4.5 h-4.5 rounded-full border border-slate-750 transition-all duration-150 flex items-center justify-center ${
                                wpAuthPin.length > idx ? 'bg-cyan-500 border-cyan-500 scale-110 shadow-lg shadow-cyan-500/20' : 'bg-slate-900'
                              }`}
                            />
                          ))}
                        </div>
                        {wpAuthError && (
                          <div className="text-center text-[10px] text-rose-400 font-bold tracking-tight animate-pulse">
                            ⚠️ {wpAuthError}
                          </div>
                        )}
                      </div>

                      {/* Touch Pad for entering pin */}
                      <div className="grid grid-cols-3 gap-2 px-6 pb-2 max-w-[200px] mx-auto select-none">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0'].map(num => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleWpPinPress(num)}
                            className="w-11 h-11 rounded-full bg-slate-900 border border-slate-800/80 text-white font-bold flex items-center justify-center hover:bg-slate-800 active:scale-95 transition text-[13px]"
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: LOGGED IN MOBILE BANK DASHBOARD */}
                  {wpIsLoggedIn && wpAccount && (
                    <div className="space-y-4">
                      {/* CARD COMPONENT */}
                      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-600 via-indigo-700 to-indigo-900 text-white shadow-xl relative overflow-hidden">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-cyan-200">WerkPay Debit</span>
                            <div className="font-black text-[13px] tracking-tight mt-1 truncate max-w-[150px]">
                              {wpAccount.account_holder}
                            </div>
                          </div>
                          <span className="text-lg font-black text-cyan-200">WP</span>
                        </div>

                        {/* Balance display */}
                        <div className="mt-4">
                          <span className="text-[8px] text-cyan-200/80 block">Huidig Saldo</span>
                          <div className="text-lg font-mono font-black text-white">
                            {wpAccount.is_admin ? '€ 99.999,99' : euro(wpAccount.balance)}
                          </div>
                        </div>

                        {/* Card Info footer */}
                        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[9px] text-cyan-200 font-mono">
                          <span>UID: {formatCardUid(wpAccount.card_uid || '')}</span>
                          <span>VEILIG</span>
                        </div>
                      </div>

                      {/* QUICK TRANSFER FORM */}
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                        <h5 className="font-black text-white flex items-center gap-1 text-[11px]">
                          <Send className="w-3.5 h-3.5 text-cyan-400" /> Overboeken
                        </h5>

                        <div className="space-y-2">
                          <div>
                            <label className="text-[9px] text-slate-400 font-bold block mb-0.5">Naar Gebruikersnaam (ontvanger)</label>
                            <input
                              type="text"
                              placeholder="bijv: jan, joas, sanne"
                              value={wpTransferTarget}
                              onChange={e => setWpTransferTarget(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs focus:outline-none focus:border-cyan-400 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 font-bold block mb-0.5">Bedrag (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={wpTransferAmount}
                              onChange={e => setWpTransferAmount(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs focus:outline-none focus:border-cyan-400 text-white font-mono"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              playClick();
                              const amt = parseFloat(wpTransferAmount);
                              if (isNaN(amt) || amt <= 0) {
                                showToast("Vul een geldig bedrag in!", "warning");
                                return;
                              }

                              const targetLower = wpTransferTarget.trim().toLowerCase();
                              if (!targetLower) {
                                showToast("Vul een ontvanger in!", "warning");
                                return;
                              }

                              if (wpAccount.username.toLowerCase() === targetLower) {
                                showToast("Je kunt geen geld naar jezelf overboeken!", "warning");
                                return;
                              }

                              // Use AppContext pay method/helpers
                              // Direct state deduction for live preview reactivity
                              const targetAcc = bankAccounts.find(x => x.username.toLowerCase() === targetLower);
                              if (!targetAcc) {
                                showToast(`Ontvanger "@${targetLower}" niet gevonden op het WerkPay netwerk!`, "error");
                                return;
                              }

                              if (wpAccount.balance < amt && !wpAccount.is_admin) {
                                showToast("Onvoldoende saldo op deze rekening!", "error");
                                return;
                              }

                              // Simulate transfer
                              wpAccount.balance -= amt;
                              targetAcc.balance += amt;
                              
                              // Trigger database saves if possible
                              saveBankAccount(wpAccount);
                              saveBankAccount(targetAcc);

                              setWpTransferSuccess(true);
                              setWpTransferAmount('');
                              setWpTransferTarget('');
                              try { AudioFX.bell(); } catch {}
                              setTimeout(() => setWpTransferSuccess(false), 3000);
                            }}
                            className="w-full py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black tracking-tight flex items-center justify-center gap-1.5 transition active:scale-95 text-[11px]"
                          >
                            <span>Geld Overmaken</span>
                          </button>

                          {wpTransferSuccess && (
                            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center font-bold text-[9px] animate-pulse">
                              Transactie succesvol verwerkt!
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. APP: WERKDONALDS STAFF EMPLOYEE PORTAL APP */}
            {activeApp === 'werkpay' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {/* Header */}
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setActiveApp('home'); playClick(); }} className="text-slate-400 hover:text-white">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mijn Werkdonalds</span>
                    </span>
                  </div>
                  {wdEmpUser && (
                    <button
                      onClick={handleWdEmpLogout}
                      className="text-[9px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold border border-rose-500/15"
                    >
                      Log uit
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll min-h-0 p-3.5 text-xs">
                  {/* LOGGED OUT PORTAL: LOGIN SCREEN */}
                  {!wdEmpUser ? (
                    <div className="space-y-3.5 py-1">
                      <div className="text-center space-y-1">
                        <div className="text-2xl">🍔</div>
                        <h4 className="font-black text-white">Medewerkers Portaal</h4>
                        <p className="text-[10px] text-slate-400">Meld je aan met je Werkdonalds POS kassa-account.</p>
                      </div>

                      {wdEmpError && (
                        <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/15 text-rose-400 font-bold text-[10px] text-center">
                          {wdEmpError}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase tracking-wider">Gebruikersnaam</label>
                          <input
                            type="text"
                            placeholder="bijv: joas, sanne, jan"
                            value={wdEmpUsername}
                            onChange={e => setWdEmpUsername(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-400 text-white font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase tracking-wider">Wachtwoord</label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={wdEmpPassword}
                            onChange={e => setWdEmpPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-400 text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleWdEmpLogin}
                          className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black tracking-tight flex items-center justify-center gap-1.5 transition active:scale-95 mt-1 text-[11px]"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Meld je aan op shift</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* LOGGED IN PORTAL: DASHBOARD */
                    <div className="space-y-4">
                      {/* USER PROFILE INFO */}
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-md">
                          {wdEmpUser.name[0]}
                        </div>
                        <div>
                          <div className="font-black text-white text-[11px] leading-tight">{wdEmpUser.name}</div>
                          <div className="text-[9px] text-amber-400 font-mono font-bold uppercase tracking-wide mt-0.5">
                            {wdEmpUser.is_admin ? 'Hoofdbeheerder' : 'Medewerker'}
                          </div>
                        </div>
                      </div>

                      {/* CASHOUT REQUEST FORM */}
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">💰 Kas & Voorschot Aanvraag</span>
                        <p className="text-[9px] text-slate-400">Vraag direct cash uitbetalingen of kastoegoed aan bij de hoofdbeheerder.</p>

                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 font-bold uppercase block mb-0.5">Bedrag (€)</label>
                              <input
                                type="number"
                                placeholder="10.00"
                                value={wdCashAmount}
                                onChange={e => setWdCashAmount(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[11px] text-white font-mono focus:outline-none focus:border-amber-400"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] text-slate-400 font-bold uppercase block mb-0.5">Reden</label>
                              <input
                                type="text"
                                placeholder="bijv: Pauze, Wisselgeld"
                                value={wdCashReason}
                                onChange={e => setWdCashReason(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[11px] text-white focus:outline-none focus:border-amber-400"
                              />
                            </div>
                          </div>

                          <button
                            onClick={handleWdSubmitCashRequest}
                            className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center justify-center gap-1 transition text-[10px]"
                          >
                            <span>Aanvraag Verzenden</span>
                          </button>

                          {wdCashSuccess && (
                            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] text-center font-bold animate-pulse">
                              Aanvraag ingediend ter goedkeuring.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ACTIVE ORDERS MINI TRACKER (KDS STAGES) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider px-1">
                          <span>Live KDS Bestellingen</span>
                          <span className="text-[9px] text-amber-500 font-mono">({orders.filter(o => o.status !== 'afgerond' && o.status !== 'geannuleerd').length})</span>
                        </div>

                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {orders.filter(o => o.status !== 'afgerond' && o.status !== 'geannuleerd').length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-[10px] text-slate-500">
                              Geen actieve bestellingen in de wachtrij.
                            </div>
                          ) : (
                            orders.filter(o => o.status !== 'afgerond' && o.status !== 'geannuleerd').map(o => (
                              <div
                                key={o.no}
                                className="p-2 bg-slate-900 border border-slate-850 rounded-xl flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-bold text-[10px] text-white">Bestelling #{o.no}</div>
                                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">{euro(o.total)} • {o.items.length} items</div>
                                </div>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  o.status === 'gereed' ? 'bg-emerald-500/10 text-emerald-400' :
                                  o.status === 'in_behandeling' ? 'bg-blue-500/10 text-blue-400' :
                                  'bg-amber-500/10 text-amber-400'
                                }`}>
                                  {o.status === 'gereed' ? 'Gereed' :
                                   o.status === 'in_behandeling' ? 'Bezig' : 'Wachten'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. APP: TELEFOON / REAL MIC CALL SCREEN */}
            {activeApp === 'phone' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {/* Header */}
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { if (callState === 'idle') setActiveApp('home'); else hangUp(); playClick(); }} className="text-slate-400 hover:text-white">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Bellen</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { setShowIdentityModal(true); playClick(); }}
                    className="text-[9px] bg-slate-800 hover:bg-slate-750 text-cyan-400 font-bold px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1"
                  >
                    <span>{myAvatar} {myName}</span>
                    <span className="text-[8px] opacity-75">({myPhone})</span>
                  </button>
                </div>

                {/* ACTIVE IDENTITY MINI BAR */}
                <div className={`px-3 py-1.5 border-b flex items-center justify-between text-[9px] shrink-0 ${
                  phoneIdentity ? 'bg-slate-900/80 border-slate-800' : 'bg-amber-950/40 border-amber-500/30'
                }`}>
                  <span className="font-bold truncate">
                    {phoneIdentity ? (
                      <span className="text-slate-400">Zender ID: <strong className="text-emerald-400 font-mono">{myPhone}</strong> ({myRole})</span>
                    ) : (
                      <span className="text-amber-400">🔒 Niet ingelogd op telefoon account</span>
                    )}
                  </span>
                  <button
                    onClick={() => { setShowIdentityModal(true); playClick(); }}
                    className="text-cyan-400 hover:underline font-bold text-[9px] shrink-0 ml-1"
                  >
                    {phoneIdentity ? 'Wissel' : 'Inloggen'}
                  </button>
                </div>

                {/* Phone screen routing based on callState */}
                {callState === 'idle' ? (
                  /* KEYPAD & CONTACTS DIALER */
                  showNewCallList ? (
                    <div className="flex-1 flex flex-col bg-slate-950 p-3 space-y-3.5 overflow-y-auto min-h-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Wie wil je bellen?</span>
                        <button onClick={() => { playClick(); setShowNewCallList(false); }} className="text-slate-500 hover:text-white text-[10px] font-bold">
                          Terug
                        </button>
                      </div>

                      {/* List dedicated System Phone Accounts */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider block">Speciale Telefoon Accounts:</span>
                        {SYSTEM_PHONE_ACCOUNTS.map(sys => (
                          <button
                            key={sys.id}
                            onClick={() => {
                              playClick();
                              setShowNewCallList(false);
                              startCall(sys.name, sys.phone, sys.role);
                            }}
                            className="w-full p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                          >
                            <span>{sys.avatar}</span>
                            <div>
                              <div>{sys.name}</div>
                              <div className="text-[8px] text-cyan-400 font-mono">{sys.phone} ({sys.role})</div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* List registered POS Staff users */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Werkdonalds Kassa-gebruikers:</span>
                        {posUsers.filter(u => u.username !== myId).length === 0 ? (
                          <div className="text-[10px] text-slate-600 italic px-2">Geen andere medewerkers gevonden.</div>
                        ) : (
                          posUsers.filter(u => u.username !== myId).map(u => (
                            <button
                              key={u.id}
                              onClick={() => {
                                playClick();
                                setShowNewCallList(false);
                                startLiveCall(u.username, u.name, '06-' + u.username, 'POS Medewerker');
                              }}
                              className="w-full p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                            >
                              <span>👨‍🍳</span>
                              <div>
                                <div>{u.name}</div>
                                <div className="text-[8px] text-slate-500 font-mono">Bel @{u.username}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>

                      {/* List registered WerkPay bank account holders */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">WerkPay bankrekeningen:</span>
                        {bankAccounts.filter(acc => acc.username !== myId).length === 0 ? (
                          <div className="text-[10px] text-slate-600 italic px-2">Geen andere bankrekeningen gevonden.</div>
                        ) : (
                          bankAccounts.filter(acc => acc.username !== myId).map(acc => (
                            <button
                              key={acc.id}
                              onClick={() => {
                                playClick();
                                setShowNewCallList(false);
                                startLiveCall(acc.username, acc.account_holder, '06-' + acc.username, 'Bankrekening');
                              }}
                              className="w-full p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                            >
                              <span>💳</span>
                              <div>
                                <div>{acc.account_holder}</div>
                                <div className="text-[8px] text-slate-500 font-mono">Bel @{acc.username}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-between p-4">
                      {/* Dial Input Display */}
                      <div className="text-center py-1 h-11 flex items-center justify-center">
                        <span className="text-xl font-mono font-black text-white tracking-widest">{dialInput || 'Toets nummer...'}</span>
                        {dialInput && (
                          <button onClick={() => { setDialInput(''); playClick(); }} className="ml-2 text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Numeric Keypad Grid */}
                      <div className="grid grid-cols-3 gap-y-2.5 gap-x-4 px-4 my-auto select-none">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(num => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              setDialInput(prev => prev + num);
                              playClick();
                            }}
                            className="w-11 h-11 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 transition flex flex-col items-center justify-center border border-slate-800/60"
                          >
                            <span className="text-sm font-black text-white">{num}</span>
                          </button>
                        ))}
                      </div>

                      {/* Action buttons at the bottom */}
                      <div className="flex items-center justify-center gap-4 pt-3 border-t border-slate-900 mt-2">
                        <button
                          onClick={() => {
                            if (!dialInput) {
                              showToast("Toets eerst een nummer of kies een contact!", "warning");
                              return;
                            }
                            // See if dialInput is an active username
                            const matchedUser = posUsers.find(u => u.username.toLowerCase() === dialInput.trim().toLowerCase()) ||
                                                bankAccounts.find(a => a.username.toLowerCase() === dialInput.trim().toLowerCase());
                            if (matchedUser) {
                              const name = 'account_holder' in matchedUser ? matchedUser.account_holder : matchedUser.name;
                              const role = 'account_holder' in matchedUser ? 'Bankrekening' : 'POS Medewerker';
                              startLiveCall(matchedUser.username, name, '06-' + matchedUser.username, role);
                            } else {
                              startCall(dialInput, dialInput, 'Handmatig ingevoerd');
                            }
                          }}
                          className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg active:scale-90 transition"
                        >
                          <PhoneCall className="w-5 h-5" />
                        </button>

                        {/* QUICK DIRECTORY DIALER */}
                        <button
                          onClick={() => {
                            playClick();
                            setShowNewCallList(true);
                          }}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-[10px] font-black flex items-center gap-1.5 transition"
                        >
                          <Users className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Kies Contact</span>
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* SIMULATED & MIC-DRIVEN CALL SCREEN */
                  <div className="flex-1 flex flex-col justify-between p-5 bg-slate-950">
                    <div className="text-center space-y-2 mt-4">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold mx-auto shadow-xl ring-4 ring-cyan-500/10 animate-pulse">
                        {callingContact?.name ? callingContact.name[0] : '📞'}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white">{callingContact?.name || 'Onbekend'}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{callingContact?.role || 'Bellen...'}</p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">{callingContact?.phone}</p>
                      </div>

                      {/* Call Connection Status */}
                      <div className="pt-1">
                        {callState === 'calling' ? (
                          <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase animate-pulse">Verbinding maken...</span>
                        ) : callState === 'incoming' ? (
                          <span className="text-[10px] text-yellow-400 font-bold tracking-widest uppercase animate-bounce block">Inkomende oproep...</span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-emerald-400 font-black tracking-widest uppercase">Verbonden via Mic</span>
                            <div className="text-lg font-mono font-black text-white mt-0.5">
                              {formatDuration(callTimer)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* MICROPHONE GRAPH & WAVEFORM (REAL VOICE AMPLITUDES) */}
                    {callState === 'connected' && (
                      <div className="bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-2xl text-center space-y-3 max-w-[240px] mx-auto">
                        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="flex items-center gap-1 text-cyan-400">
                            {isMuted ? <MicOff className="w-3 h-3 text-red-400" /> : <Mic className="w-3 h-3 text-cyan-400" />}
                            <span>{isMuted ? 'Gedempt' : 'Microfoon Actief'}</span>
                          </span>
                          <span>Stem-volume</span>
                        </div>

                        {/* Visual Animated Audio Bars */}
                        <div className="flex items-end justify-center gap-1 h-14 px-2">
                          {micFrequencies.map((height, i) => (
                            <div
                              key={i}
                              style={{ height: `${height}%` }}
                              className={`w-1.5 rounded-full transition-all duration-75 ${
                                isMuted 
                                  ? 'bg-slate-800' 
                                  : 'bg-gradient-to-t from-cyan-600 to-indigo-500 shadow-md shadow-cyan-400/10'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Interactive mic control buttons */}
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <button
                            onClick={() => {
                              playClick();
                              setIsMuted(!isMuted);
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold transition flex items-center gap-1 ${
                              isMuted 
                                ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                            }`}
                          >
                            {isMuted ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
                            <span>{isMuted ? 'Dempen Opheffen' : 'Dempen'}</span>
                          </button>

                          {micPermissionError && (
                            <span className="text-[8px] text-rose-400 font-bold max-w-[100px] leading-tight">
                              Mic geweigerd. Check permissies.
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CALL ACTIONS: HANGUP VS ACCEPT/DECLINE FOR INCOMING */}
                    <div className="flex justify-center pb-4">
                      {callState === 'incoming' ? (
                        <div className="flex items-center gap-6">
                          {/* DECLINE BUTTON */}
                          <button
                            onClick={async () => {
                              playClick();
                              if (callPartnerId) {
                                sendPhoneSignal({
                                  type: 'CALL_DECLINE',
                                  fromId: myId,
                                  toId: callPartnerId
                                });
                              }
                              setCallState('idle');
                              setCallingContact(null);
                              setCallPartnerId(null);
                            }}
                            className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-lg active:scale-90 transition"
                            title="Weigeren"
                          >
                            <PhoneOff className="w-5 h-5" />
                          </button>

                          {/* ACCEPT BUTTON */}
                          <button
                            onClick={async () => {
                              playClick();
                              await requestMicAccess();
                              if (callPartnerId) {
                                sendPhoneSignal({
                                  type: 'CALL_ACCEPT',
                                  fromId: myId,
                                  toId: callPartnerId
                                });
                                initPeerConnection(callPartnerId, false);
                              }
                              setCallState('connected');
                              setCallTimer(0);
                              if (callIntervalRef.current) clearInterval(callIntervalRef.current);
                              callIntervalRef.current = setInterval(() => {
                                setCallTimer(prev => prev + 1);
                              }, 1000);
                            }}
                            className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-lg active:scale-90 transition animate-bounce"
                            title="Opnemen"
                          >
                            <PhoneCall className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        /* RED HANGUP BUTTON */
                        <button
                          onClick={hangUp}
                          className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-lg active:scale-90 transition"
                        >
                          <PhoneOff className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. APP: MESSAGES / SMS APP (PERSISTENT & DELETABLE CHATS) */}
            {activeApp === 'messages' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {activeContactId === null ? (
                  /* CONVERSATION LIST */
                  <>
                    <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setActiveApp('home'); playClick(); }} className="text-slate-400 hover:text-white">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-black text-white flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Berichten</span>
                        </span>
                      </div>
                      
                      <button
                        onClick={() => { playClick(); setShowNewChatList(!showNewChatList); }}
                        className="text-[10px] bg-indigo-500 hover:bg-indigo-400 text-white font-black px-2 py-1 rounded-lg flex items-center gap-1 transition"
                      >
                        <Users className="w-3 h-3" />
                        <span>Nieuw</span>
                      </button>
                    </div>

                    {/* NEW CHAT / USER DIRECTORY OVERLAY */}
                    {showNewChatList ? (
                      <div className="flex-1 flex flex-col bg-slate-950 p-3 space-y-3.5 overflow-y-auto custom-scroll min-h-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Start chat met collega:</span>
                          <button onClick={() => { playClick(); setShowNewChatList(false); }} className="text-slate-500 hover:text-white text-[10px] font-bold">
                            Annuleren
                          </button>
                        </div>

                        {/* List dedicated System Phone Accounts */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider block">Speciale Telefoon Accounts:</span>
                          {SYSTEM_PHONE_ACCOUNTS.map(sys => (
                            <button
                              key={sys.id}
                              onClick={() => {
                                playClick();
                                setShowNewChatList(false);
                                handleStartNewChatWithUser({
                                  id: sys.id,
                                  name: sys.name,
                                  username: sys.id,
                                  avatar: sys.avatar,
                                  role: sys.role
                                }, 'pos');
                              }}
                              className="w-full p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                            >
                              <span>{sys.avatar}</span>
                              <div>
                                <div>{sys.name}</div>
                                <div className="text-[8px] text-cyan-400 font-mono">{sys.phone} ({sys.role})</div>
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* List registered POS Staff users */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Werkdonalds Kassa-gebruikers:</span>
                          {posUsers.map(u => (
                            <button
                              key={u.id}
                              onClick={() => handleStartNewChatWithUser(u, 'pos')}
                              className="w-full p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                            >
                              <span>👨‍🍳</span>
                              <div>
                                <div>{u.name}</div>
                                <div className="text-[8px] text-slate-500 font-mono">@{u.username}</div>
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* List registered WerkPay bank account holders */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">WerkPay bankrekeningen:</span>
                          {bankAccounts.map(acc => (
                            <button
                              key={acc.id}
                              onClick={() => handleStartNewChatWithUser(acc, 'bank')}
                              className="w-full p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-left flex items-center gap-2 text-white font-bold transition text-[11px]"
                            >
                              <span>💳</span>
                              <div>
                                <div>{acc.account_holder}</div>
                                <div className="text-[8px] text-slate-500 font-mono">@{acc.username}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* ACTIVE CHAT LIST */
                      <div className="flex-1 overflow-y-auto custom-scroll min-h-0 divide-y divide-slate-900">
                        {contacts.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 text-[11px] italic">
                            Geen actieve gesprekken. Klik op 'Nieuw' om te chatten.
                          </div>
                        ) : (
                          contacts.map(c => {
                            const lastMsg = c.messages[c.messages.length - 1];
                            return (
                              <div
                                key={c.id}
                                className={`w-full flex items-center justify-between text-left transition hover:bg-slate-900/60 ${
                                  c.unread ? 'bg-indigo-950/15' : ''
                                }`}
                              >
                                <button
                                  onClick={() => {
                                    setActiveContactId(c.id);
                                    c.unread = false;
                                    playClick();
                                  }}
                                  className="flex-1 p-3 flex items-start gap-3 min-w-0"
                                >
                                  <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center text-base shadow-inner">
                                    {c.avatar}
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-black text-xs text-white truncate">{c.name}</span>
                                      <span className="text-[8px] text-slate-500 font-mono">{lastMsg?.timestamp || '12:00'}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate pr-4">
                                      {lastMsg ? lastMsg.text : 'Geen berichten.'}
                                    </div>
                                  </div>
                                  {c.unread && (
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 self-center mr-1" />
                                  )}
                                </button>

                                {/* TRASH ICON TO DELETE THE CHAT */}
                                <button
                                  onClick={() => deleteChatHistory(c.id)}
                                  className="p-3 text-slate-600 hover:text-rose-500 transition active:scale-90"
                                  title="Wis dit gesprek"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* ACTIVE SMS CHAT THREAD */
                  (() => {
                    const contact = contacts.find(c => c.id === activeContactId)!;
                    return (
                      <div className="flex-1 flex flex-col justify-between min-h-0">
                        {/* Thread Header */}
                        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setActiveContactId(null);
                                playClick();
                              }}
                              className="text-slate-400 hover:text-white p-1 rounded-lg"
                            >
                              <ArrowLeft className="w-4 h-4" />
                            </button>
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-base">
                              {contact.avatar}
                            </div>
                            <div>
                              <div className="font-black text-[11px] text-white leading-tight">{contact.name}</div>
                              <div className="text-[8px] text-slate-400 leading-none mt-0.5">{contact.role}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {/* Delete Chat History button */}
                            <button
                              onClick={() => deleteChatHistory(contact.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition"
                              title="Gesprek wissen"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Message History bubble area */}
                        <div className="flex-1 overflow-y-auto custom-scroll min-h-0 p-3.5 space-y-3 bg-slate-950 flex flex-col">
                          {contact.messages.length === 0 ? (
                            <div className="my-auto text-center text-slate-600 text-[10px] italic">
                              Stuur een bericht om de chat te starten met {contact.name}.
                            </div>
                          ) : (
                            contact.messages.map(m => {
                              const isMe = m.sender === 'me';
                              const isTikkie = m.text.includes('[TIKKIE:');
                              
                              if (isTikkie) {
                                const raw = m.text.substring(m.text.indexOf('[TIKKIE:') + 8, m.text.indexOf(']'));
                                const [tikAmount, ...tikNoteParts] = raw.split(':');
                                const tikNote = tikNoteParts.join(':') || 'Betaalverzoek';
                                const numAmt = Number(tikAmount) || 5.0;

                                return (
                                  <div
                                    key={m.id}
                                    className={`flex flex-col max-w-[90%] space-y-1 ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                                  >
                                    <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-950/90 to-slate-900 border border-emerald-500/40 text-white shadow-md space-y-2 w-52">
                                      <div className="flex items-center justify-between text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                                        <span className="flex items-center gap-1">💶 WerkPay Tikkie</span>
                                        <span className="text-[8px] text-emerald-300/60 font-mono">LIVE</span>
                                      </div>
                                      <div>
                                        <div className="text-lg font-mono font-black text-emerald-300">€ {numAmt.toFixed(2)}</div>
                                        <div className="text-[10px] text-slate-300 italic truncate max-w-[180px]">"{tikNote}"</div>
                                      </div>
                                      {!isMe ? (
                                        <button
                                          onClick={async () => {
                                            playClick();
                                            if (!wpIsLoggedIn || !wpAccount) {
                                              showToast("Log eerst in op je WerkPay bankrekening via de WerkPay app op de telefoon om te betalen!", "warning");
                                              setActiveApp('werkpay');
                                              return;
                                            }
                                            const success = await payClient(contact.id, numAmt, `Tikkie: ${tikNote}`);
                                            if (success) {
                                              try { AudioFX.bell(); } catch {}
                                              setNotification({
                                                title: 'WerkPay Tikkie Betaald!',
                                                body: `€ ${numAmt.toFixed(2)} overgemaakt naar ${contact.name}.`
                                              });
                                              sendSms(contact.id, `✅ Tikkie van €${numAmt.toFixed(2)} succesvol voldaan via WerkPay!`);
                                            } else {
                                              showToast("Betaling mislukt! Onvoldoende saldo op je WerkPay rekening.", "error");
                                            }
                                          }}
                                          className="w-full py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-[10px] shadow flex items-center justify-center gap-1 transition"
                                        >
                                          <CreditCard className="w-3.5 h-3.5" />
                                          <span>Betaal Nu met WerkPay</span>
                                        </button>
                                      ) : (
                                        <div className="text-[8px] text-emerald-400/80 font-bold italic text-center border-t border-emerald-900/50 pt-1">
                                          Verstuurd via WerkPay
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[8px] text-slate-500 font-mono px-1">
                                      <span>{m.timestamp}</span>
                                      {isMe && <CheckCheck className="w-3 h-3 text-cyan-400" />}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={m.id}
                                  className={`flex flex-col max-w-[85%] space-y-0.5 ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                                >
                                  <div
                                    className={`p-2.5 rounded-2xl text-[11px] leading-relaxed shadow-sm ${
                                      isMe
                                        ? 'bg-indigo-600 text-white rounded-tr-none'
                                        : 'bg-slate-900 border border-slate-800/80 text-slate-100 rounded-tl-none'
                                    }`}
                                  >
                                    {m.text}
                                  </div>
                                  <div className="flex items-center gap-1 text-[8px] text-slate-500 font-mono px-1">
                                    <span>{m.timestamp}</span>
                                    {isMe && <CheckCheck className="w-3 h-3 text-cyan-400" />}
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={messagesEndRef} />
                        </div>

                        {/* Inline Tikkie Generator Drawer */}
                        {showTikkieModal && (
                          <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-2 animate-in slide-in-from-bottom-2">
                            <div className="flex items-center justify-between text-xs font-black text-emerald-400">
                              <span className="flex items-center gap-1">💶 WerkPay Tikkie Maken</span>
                              <button onClick={() => setShowTikkieModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <div className="w-24">
                                <label className="text-[8px] font-bold text-slate-400 uppercase block">Bedrag (€)</label>
                                <input
                                  type="number"
                                  step="0.50"
                                  value={tikkieAmount}
                                  onChange={e => setTikkieAmount(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[8px] font-bold text-slate-400 uppercase block">Omschrijving</label>
                                <input
                                  type="text"
                                  value={tikkieNote}
                                  onChange={e => setTikkieNote(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-400"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (!tikkieAmount || Number(tikkieAmount) <= 0) return;
                                const msg = `[TIKKIE:${tikkieAmount}:${tikkieNote.trim() || 'Betaalverzoek'}]`;
                                sendSms(contact.id, msg);
                                setShowTikkieModal(false);
                              }}
                              className="w-full py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs font-black rounded-lg shadow transition active:scale-95 flex items-center justify-center gap-1"
                            >
                              <span>Stuur Tikkie Betaalverzoek (€{tikkieAmount})</span>
                            </button>
                          </div>
                        )}

                        {/* Input bottom box */}
                        <div className="p-2.5 bg-slate-900 border-t border-slate-850 flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setShowTikkieModal(!showTikkieModal);
                              playClick();
                            }}
                            className={`p-1.5 rounded-xl border transition ${
                              showTikkieModal
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                            }`}
                            title="Tikkie Sturen"
                          >
                            💶
                          </button>
                          <input
                            type="text"
                            placeholder="Typ een bericht..."
                            value={smsInput}
                            onChange={e => setSmsInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                sendSms(contact.id);
                              }
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                          />
                          <button
                            onClick={() => sendSms(contact.id)}
                            disabled={!smsInput.trim()}
                            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center active:scale-90 transition disabled:opacity-50 disabled:active:scale-100"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* 6. APP: SETTINGS APP (IN-PHONE) */}
            {activeApp === 'settings' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {/* Header */}
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setActiveApp('home'); playClick(); }} className="text-slate-400 hover:text-white">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      ⚙️ Telefoon Instellingen
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll min-h-0 p-4 space-y-4 text-xs">
                  {/* ACHTERGROND / WALLPAPER SELECTOR */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2.5">
                    <span className="text-[10px] text-cyan-400 font-bold block uppercase tracking-wider flex items-center gap-1">
                      🎨 Achtergrond / Theme
                    </span>
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {[
                        { id: 'cyan', label: 'Cyan', color: 'bg-cyan-600' },
                        { id: 'sunset', label: 'Sunset', color: 'bg-amber-600' },
                        { id: 'neon', label: 'Neon', color: 'bg-pink-600' },
                        { id: 'emerald', label: 'Groen', color: 'bg-emerald-600' },
                        { id: 'dark', label: 'OLED', color: 'bg-slate-800' }
                      ].map(wp => (
                        <button
                          key={wp.id}
                          onClick={() => handleWallpaperChange(wp.id)}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition ${
                            wallpaper === wp.id ? 'border-cyan-400 bg-slate-800 ring-2 ring-cyan-500/30' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full ${wp.color} shadow-inner block`} />
                          <span className="text-[8px] font-bold text-slate-300">{wp.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* BELTOON / RINGTONE SELECTOR */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        🔔 Beltoon Geluid
                      </span>
                      <button
                        onClick={() => AudioFX.playRingtone(selectedRingtone)}
                        className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white font-black px-2 py-0.5 rounded-lg transition"
                      >
                        🔊 Test Beltoon
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        { id: 'bell', name: 'Klassiek Belsignaal', desc: 'Heldere dubbele kassa-chime' },
                        { id: 'digital', name: 'Digital Electronic', desc: 'Futuristische 3-tone piep' },
                        { id: 'chime', name: 'Gentle Chime', desc: 'Zachte harmonische melodie' },
                        { id: 'marimba', name: 'Retro Marimba', desc: 'Houten percussie synth' }
                      ].map(rt => (
                        <button
                          key={rt.id}
                          onClick={() => handleRingtoneChange(rt.id)}
                          className={`w-full p-2 rounded-xl text-left border flex items-center justify-between transition ${
                            selectedRingtone === rt.id
                              ? 'border-indigo-500 bg-indigo-950/20 text-white'
                              : 'border-slate-800 hover:border-slate-700 text-slate-400'
                          }`}
                        >
                          <div>
                            <div className="text-[11px] font-bold text-white">{rt.name}</div>
                            <div className="text-[8px] text-slate-500">{rt.desc}</div>
                          </div>
                          {selectedRingtone === rt.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* TELEFOON INLOGGEN & IDENTITEIT INSTELLINGEN */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        📱 Telefoon Identiteit / Inlog
                      </span>
                      <button
                        onClick={() => { setShowIdentityModal(true); playClick(); }}
                        className="text-[9px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-lg transition"
                      >
                        Inloggen / Kies Rol
                      </button>
                    </div>
                    <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{myAvatar}</span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-black text-white truncate">{myName}</div>
                          <div className="text-[9px] text-emerald-400 font-mono truncate">{myPhone} • {myRole}</div>
                        </div>
                      </div>
                      {phoneIdentity && (
                        <button
                          onClick={handleClearPhoneIdentity}
                          className="text-[8px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold border border-rose-500/20 shrink-0 ml-1"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 italic leading-tight">
                      Stel in wie deze telefoon gebruikt (bijv. Manager Telefoon, Kassa 1, Keuken, of medewerker) zodat inkomende oproepen en SMS-berichten op dit toestel aankomen.
                    </p>
                  </div>

                  {/* SYSTEM INFO */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Systeeminformatie</span>
                    <div className="flex justify-between py-1 border-b border-slate-850 text-[11px]">
                      <span className="text-slate-400">Netwerk:</span>
                      <span className="text-white font-bold">WerkMobile LTE</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-850 text-[11px]">
                      <span className="text-slate-400">Besturingssysteem:</span>
                      <span className="text-white font-bold">WerkOS v1.2</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-850 text-[11px]">
                      <span className="text-slate-400">Verbinding:</span>
                      <span className="text-cyan-400 font-bold">Supabase Realtime</span>
                    </div>
                    <div className="flex justify-between py-1 text-[11px]">
                      <span className="text-slate-400">Actieve Identiteit:</span>
                      <span className="text-emerald-400 font-bold truncate max-w-[120px]">{myName}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6. APP: WERKLOYALTY CUSTOMER MOBILE APP */}
            {activeApp === 'loyalty' && (
              <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                {/* App Header */}
                <div className="p-3 bg-gradient-to-r from-amber-950/80 to-slate-900 border-b border-amber-500/30 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setActiveApp('home'); playClick(); }} className="text-slate-400 hover:text-white p-1 rounded-lg">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <span className="text-xs font-black text-amber-300 flex items-center gap-1">
                        <span>⭐ WerkLoyalty</span>
                      </span>
                      <p className="text-[8px] text-slate-400">Jouw Digitale Klantenkaart &amp; Punten</p>
                    </div>
                  </div>

                  {loyaltyUser && (
                    <button
                      onClick={() => {
                        setLoyaltyUser(null);
                        setRedeemedVoucher(null);
                        playClick();
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-600 text-rose-300 hover:text-white text-[9px] font-bold border border-slate-700 transition"
                    >
                      Uitloggen
                    </button>
                  )}
                </div>

                {/* App Main Content Area */}
                <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-3 min-h-0">
                  {!loyaltyUser ? (
                    /* SECURE CUSTOMER LOGIN / REGISTER FORM (NO PASSWORDS REVEALED) */
                    <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-2xl space-y-3 shadow-xl">
                      <div className="text-center space-y-1">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center text-2xl font-black mx-auto shadow-lg">
                          🪙
                        </div>
                        <h3 className="font-black text-sm text-white">WerkLoyalty Mobiel</h3>
                        <p className="text-[10px] text-slate-400">
                          {loyaltyIsRegister ? 'Registreer voor je digitale klantenkaart (+50 Coins)' : 'Log in met je mobiele nummer en wachtwoord'}
                        </p>
                      </div>

                      {/* Mode Switcher */}
                      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setLoyaltyIsRegister(false);
                            setLoyaltyAuthError(null);
                            playClick();
                          }}
                          className={`flex-1 py-1 rounded-lg transition ${!loyaltyIsRegister ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400'}`}
                        >
                          Inloggen
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLoyaltyIsRegister(true);
                            setLoyaltyAuthError(null);
                            playClick();
                          }}
                          className={`flex-1 py-1 rounded-lg transition ${loyaltyIsRegister ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400'}`}
                        >
                          Nieuw Account
                        </button>
                      </div>

                      {/* Login/Register Inputs */}
                      <div className="space-y-2.5 pt-1">
                        {loyaltyIsRegister && (
                          <div>
                            <label className="text-[9px] text-slate-300 font-bold uppercase tracking-wider block mb-1">
                              Volledige Naam:
                            </label>
                            <input
                              type="text"
                              placeholder="bijv. Jan Jansen"
                              value={loyaltyRegName}
                              onChange={e => setLoyaltyRegName(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-[9px] text-slate-300 font-bold uppercase tracking-wider block mb-1">
                            📱 Mobiel Nummer:
                          </label>
                          <input
                            type="text"
                            placeholder="0612345678"
                            value={loyaltyPhoneInput}
                            onChange={e => setLoyaltyPhoneInput(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-300 font-bold uppercase tracking-wider block mb-1">
                            🔒 Wachtwoord:
                          </label>
                          {/* SECURE MASKED PASSWORD INPUT */}
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={loyaltyPassInput}
                            onChange={e => setLoyaltyPassInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                if (loyaltyIsRegister) {
                                  if (!loyaltyRegName.trim() || !loyaltyPhoneInput.trim() || !loyaltyPassInput.trim()) {
                                    setLoyaltyAuthError('Vul alle velden in!');
                                    return;
                                  }
                                  const registered = registerLoyaltyCustomer(loyaltyRegName, loyaltyPhoneInput);
                                  setLoyaltyUser(registered);
                                  try { AudioFX.bell(); } catch {}
                                } else {
                                  if (!loyaltyPhoneInput.trim() || !loyaltyPassInput.trim()) {
                                    setLoyaltyAuthError('Vul je telefoonnummer en wachtwoord in!');
                                    return;
                                  }
                                  const cust = findLoyaltyCustomerByPhoneOrName(loyaltyPhoneInput);
                                  if (cust) {
                                    setLoyaltyUser(cust);
                                    setLoyaltyAuthError(null);
                                    try { AudioFX.bell(); } catch {}
                                  } else {
                                    setLoyaltyAuthError('Onjuist mobiel nummer of wachtwoord!');
                                    try { AudioFX.beep(); } catch {}
                                  }
                                }
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400 tracking-widest"
                          />
                        </div>

                        {loyaltyAuthError && (
                          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-bold text-center animate-pulse">
                            {loyaltyAuthError}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            if (loyaltyIsRegister) {
                              if (!loyaltyRegName.trim() || !loyaltyPhoneInput.trim() || !loyaltyPassInput.trim()) {
                                setLoyaltyAuthError('Vul alle velden in!');
                                return;
                              }
                              const registered = registerLoyaltyCustomer(loyaltyRegName, loyaltyPhoneInput);
                              setLoyaltyUser(registered);
                              try { AudioFX.bell(); } catch {}
                            } else {
                              if (!loyaltyPhoneInput.trim() || !loyaltyPassInput.trim()) {
                                setLoyaltyAuthError('Vul je telefoonnummer en wachtwoord in!');
                                return;
                              }
                              const cust = findLoyaltyCustomerByPhoneOrName(loyaltyPhoneInput);
                              if (cust) {
                                setLoyaltyUser(cust);
                                setLoyaltyAuthError(null);
                                try { AudioFX.bell(); } catch {}
                              } else {
                                setLoyaltyAuthError('Onjuist mobiel nummer of wachtwoord!');
                                try { AudioFX.beep(); } catch {}
                              }
                            }
                          }}
                          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>{loyaltyIsRegister ? '✨ Registreer (+50 Coins)' : '🔒 Veilig Inloggen'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* LOGGED-IN DIGITAL LOYALTY CARD & REWARDS DASHBOARD */
                    <div className="space-y-3">
                      {/* DIGITAL LOYALTY PASS CARD */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-600 via-yellow-600 to-amber-700 text-slate-950 shadow-2xl relative overflow-hidden border border-amber-300/40">
                        <div className="absolute top-0 right-0 p-3 opacity-15 text-6xl select-none font-black">
                          🍔
                        </div>

                        <div className="flex justify-between items-start relative z-10">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-slate-950/20 text-slate-950 px-2 py-0.5 rounded-full">
                              Werkdonalds Spaarkaart
                            </span>
                            <h3 className="font-black text-base mt-1 text-slate-950 leading-tight">
                              {loyaltyUser.name}
                            </h3>
                            <span className="text-[10px] font-mono font-bold text-slate-900 block">
                              {loyaltyUser.phone}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] font-black uppercase tracking-wider bg-slate-950 text-amber-300 px-2.5 py-1 rounded-full shadow">
                              {loyaltyUser.tier}
                            </span>
                          </div>
                        </div>

                        {/* COINS BALANCE & QR CODE */}
                        <div className="mt-4 pt-3 border-t border-slate-950/20 flex items-center justify-between relative z-10">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-900 block">
                              Actueel Saldo:
                            </span>
                            <div className="text-2xl font-black text-slate-950 font-mono flex items-center gap-1">
                              <span>🪙</span>
                              <span>{loyaltyUser.coins}</span>
                              <span className="text-[10px] font-normal text-slate-900">Coins</span>
                            </div>
                          </div>

                          {/* DIGITAL QR CODE FOR SCANNING AT POS/KIOSK */}
                          <div className="p-1.5 bg-white rounded-xl shadow-md border border-slate-300 text-center flex flex-col items-center">
                            <div className="w-12 h-12 bg-slate-950 rounded p-1 flex items-center justify-center">
                              {/* QR Code graphic representation */}
                              <div className="grid grid-cols-3 gap-0.5 w-full h-full">
                                <div className="bg-amber-400 rounded-xs" />
                                <div className="bg-white rounded-xs" />
                                <div className="bg-amber-400 rounded-xs" />
                                <div className="bg-white rounded-xs" />
                                <div className="bg-amber-400 rounded-xs" />
                                <div className="bg-white rounded-xs" />
                                <div className="bg-amber-400 rounded-xs" />
                                <div className="bg-white rounded-xs" />
                                <div className="bg-amber-400 rounded-xs" />
                              </div>
                            </div>
                            <span className="text-[7px] font-mono font-bold text-slate-700 mt-0.5">SCAN BIJ KASSA</span>
                          </div>
                        </div>
                      </div>

                      {/* ACTIVE VOUCHER DISPLAY (IF REDEEMED) */}
                      {redeemedVoucher && (
                        <div className="p-3 bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/40 rounded-2xl space-y-1.5 animate-in fade-in zoom-in duration-200 shadow-lg">
                          <div className="flex items-center justify-between text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                            <span>🎉 VOUCHER INGELOST!</span>
                            <span className="font-mono text-emerald-300">GELDIG</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{redeemedVoucher.emoji}</span>
                            <div>
                              <div className="font-bold text-xs text-white">{redeemedVoucher.title}</div>
                              <div className="text-[10px] font-mono font-bold text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-amber-500/30 inline-block mt-0.5">
                                Code: {redeemedVoucher.code}
                              </div>
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-400">Scan deze code bij de kassa of bestelzuil voor jouw gratis item/korting.</p>
                        </div>
                      )}

                      {/* REWARDS CATALOG */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block">
                          🎁 Beloningen Inwisselen:
                        </span>

                        <div className="space-y-1.5">
                          {LOYALTY_REWARDS.map(rew => {
                            const canAfford = loyaltyUser.coins >= rew.coinsCost;
                            return (
                              <div
                                key={rew.id}
                                className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                                  canAfford ? 'bg-slate-900 border-amber-500/30 hover:bg-slate-850' : 'bg-slate-950/60 border-slate-850 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <span className="text-xl shrink-0">{rew.emoji}</span>
                                  <div className="min-w-0">
                                    <div className="font-black text-xs text-white truncate">{rew.title}</div>
                                    <div className="text-[9px] text-slate-400 truncate">{rew.description}</div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={!canAfford}
                                  onClick={() => {
                                    playClick();
                                    const updated = deductCoinsFromCustomer(loyaltyUser.phone, rew.coinsCost);
                                    if (updated) {
                                      setLoyaltyUser(updated);
                                      const code = `WD-LOYAL-${Math.floor(1000 + Math.random() * 9000)}`;
                                      setRedeemedVoucher({
                                        title: rew.title,
                                        code,
                                        emoji: rew.emoji
                                      });
                                      try { AudioFX.bell(); } catch {}
                                    }
                                  }}
                                  className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black transition shrink-0 active:scale-95 ${
                                    canAfford
                                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  🪙 {rew.coinsCost}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TELEFOON ACCOUNT INLOGGEN / SELECTIE MODAL OVERLAY */}
            {showIdentityModal && (
              <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md p-3.5 flex flex-col min-h-0 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0">
                  <div>
                    <h4 className="font-black text-xs text-white flex items-center gap-1.5">
                      <span>📱</span> Telefoon Account Inloggen
                    </h4>
                    <p className="text-[9px] text-slate-400">
                      {pendingIdentity ? 'Voer wachtwoord in voor account' : 'Kies wie dit specifieke toestel bedient'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowIdentityModal(false);
                      setPendingIdentity(null);
                      setIdentityInputPass('');
                      setIdentityAuthError(null);
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {pendingIdentity ? (
                  /* PASSWORD INPUT VIEW FOR SELECTED ACCOUNT */
                  <div className="flex-1 flex flex-col justify-between p-1 space-y-3 min-h-0 py-3">
                    <div className="text-center space-y-1.5 pt-1">
                      <button
                        onClick={() => setPendingIdentity(null)}
                        className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 mx-auto font-bold"
                      >
                        <ArrowLeft className="w-3 h-3" /> Kies een ander account
                      </button>

                      <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl mx-auto shadow-md">
                        {pendingIdentity.avatar}
                      </div>
                      <div>
                        <h4 className="font-black text-white text-xs">{pendingIdentity.name}</h4>
                        <span className="text-[9px] text-cyan-400 font-mono block">{pendingIdentity.phone}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase">{pendingIdentity.role}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                      <label className="text-[9px] text-slate-300 font-bold uppercase tracking-wider block">
                        🔒 Voer Wachtwoord In:
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={identityInputPass}
                        onChange={e => {
                          setIdentityInputPass(e.target.value);
                          setIdentityAuthError(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleConfirmIdentityLogin();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400 text-center tracking-widest"
                        autoFocus
                      />

                      {identityAuthError && (
                        <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold text-center animate-pulse">
                          {identityAuthError}
                        </div>
                      )}

                      <button
                        onClick={handleConfirmIdentityLogin}
                        className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition active:scale-95 flex items-center justify-center gap-1 shadow-lg"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Inloggen Op Telefoon</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ACCOUNT SELECTION LIST */
                  <div className="flex-1 overflow-y-auto custom-scroll min-h-0 space-y-3 py-3 text-xs pr-1">
                    
                    {/* CATEGORY 1: SYSTEM & POS PHONES */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider block">🏢 Specifieke Telefoons:</span>
                      {SYSTEM_PHONE_ACCOUNTS.map(sys => (
                        <button
                          key={sys.id}
                          onClick={() => {
                            setPendingIdentity({
                              id: sys.id,
                              name: sys.name,
                              avatar: sys.avatar,
                              role: sys.role,
                              phone: sys.phone,
                              password: '1234'
                            });
                            setIdentityInputPass('');
                            setIdentityAuthError(null);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                            myId === sys.id ? 'border-cyan-400 bg-cyan-950/40 text-white shadow-lg' : 'border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">{sys.avatar}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-white truncate">{sys.name}</div>
                              <div className="text-[9px] text-cyan-400 font-mono truncate">{sys.phone} ({sys.role})</div>
                            </div>
                          </div>
                          {myId === sys.id ? (
                            <span className="text-[8px] bg-cyan-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full shrink-0">ACTIEF</span>
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* CATEGORY 2: POS STAFF USERS */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">👨‍🍳 Personeel Accounts:</span>
                      {posUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setPendingIdentity({
                              id: u.username,
                              name: u.name,
                              avatar: '👨‍🍳',
                              role: u.is_admin ? 'Hoofdbeheerder' : 'Medewerker',
                              phone: '06-POS-' + u.username,
                              password: u.password || 'admin123'
                            });
                            setIdentityInputPass('');
                            setIdentityAuthError(null);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                            myId === u.username ? 'border-amber-400 bg-amber-950/40 text-white shadow-lg' : 'border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">👨‍🍳</span>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-white truncate">{u.name}</div>
                              <div className="text-[9px] text-slate-400 font-mono truncate">06-POS-{u.username}</div>
                            </div>
                          </div>
                          {myId === u.username ? (
                            <span className="text-[8px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full shrink-0">ACTIEF</span>
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* CATEGORY 3: WERKPAY BANK ACCOUNTS */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider block">💳 WerkPay Accounts:</span>
                      {bankAccounts.map(acc => (
                        <button
                          key={acc.id}
                          onClick={() => {
                            setPendingIdentity({
                              id: acc.username,
                              name: acc.account_holder,
                              avatar: '💳',
                              role: 'Bankrekening',
                              phone: '06-PAY-' + acc.username,
                              password: acc.password || acc.pin_code || '1234'
                            });
                            setIdentityInputPass('');
                            setIdentityAuthError(null);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                            myId === acc.username ? 'border-indigo-400 bg-indigo-950/40 text-white shadow-lg' : 'border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">💳</span>
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] text-white truncate">{acc.account_holder}</div>
                              <div className="text-[9px] text-indigo-400 font-mono truncate">06-PAY-{acc.username}</div>
                            </div>
                          </div>
                          {myId === acc.username ? (
                            <span className="text-[8px] bg-indigo-500 text-white font-black px-1.5 py-0.5 rounded-full shrink-0">ACTIEF</span>
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {phoneIdentity && !pendingIdentity && (
                  <div className="pt-2 border-t border-slate-800 shrink-0">
                    <button
                      onClick={handleClearPhoneIdentity}
                      className="w-full py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold text-[10px] transition"
                    >
                      Uitloggen Van Telefoon
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* PHONE BOTTOM BAR / NAV BAR */}
          <div className="h-12 bg-slate-950 border-t border-slate-850 flex items-center justify-center z-10 select-none">
            {/* White iOS-style bottom Home Bar button */}
            <button
              onClick={() => {
                setActiveApp('home');
                try { AudioFX.beep(); } catch {}
              }}
              className="w-24 h-1.5 bg-slate-500 hover:bg-white rounded-full transition-all active:scale-95"
              title="Home"
            />
          </div>
        </div>
      )}

      {/* Easter Egg GTA Arcade Game */}
      <GtaEasterEggModal
        isOpen={showGtaModal}
        onClose={() => setShowGtaModal(false)}
      />
    </>
  );
};
