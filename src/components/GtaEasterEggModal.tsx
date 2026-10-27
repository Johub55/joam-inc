import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { euro } from '../services/store';
import { showToast } from '../services/appToast';
import { BankTransaction } from '../types';
import { 
  X, 
  Trophy, 
  Flame, 
  Car, 
  Navigation, 
  Volume2, 
  VolumeX, 
  Zap, 
  Shield, 
  RotateCcw,
  Sparkles,
  Award,
  Heart,
  Crosshair,
  MapPin,
  Compass,
  CreditCard,
  CheckCircle2,
  Wallet
} from 'lucide-react';
import { AudioFX } from '../services/audio';

interface GtaEasterEggModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface SkidMark {
  x: number;
  y: number;
  angle: number;
  life: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'nitro' | 'cash' | 'golden_burger' | 'repair' | 'star' | 'ammo';
  emoji: string;
  label: string;
}

interface Pedestrian {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

interface CopCar {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  angle: number;
  health: number;
  maxHealth: number;
  active: boolean;
  respawnTimer: number;
  color: string;
  isBlownUp: boolean;
}

interface Tree {
  x: number;
  y: number;
  radius: number;
}

interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color: string;
}

// Map Dimensions
const MAP_WIDTH = 3600;
const MAP_HEIGHT = 2700;

// Helper for seamless infinite toroidal map wrapping calculations
const getWrappedDelta = (from: number, to: number, max: number) => {
  let d = to - from;
  while (d > max / 2) d -= max;
  while (d < -max / 2) d += max;
  return d;
};

// Static Constants declared outside the component to prevent Temporal Dead Zone (TDZ)
const BUILDINGS: Building[] = [
  // ROW 1: y = 100
  { x: 100, y: 100, width: 250, height: 180, name: 'Burger Fabriek West', color: '#1e293b' },
  { x: 450, y: 100, width: 200, height: 180, name: 'Saus Depot', color: '#334155' },
  { x: 800, y: 100, width: 350, height: 180, name: 'Residential Block A', color: '#1e293b' },
  { x: 1350, y: 100, width: 300, height: 180, name: 'Friet Kantoor Noord', color: '#1e293b' },
  { x: 1800, y: 100, width: 250, height: 180, name: 'Supermarkt XL', color: '#111827' },
  { x: 2200, y: 100, width: 300, height: 180, name: 'Snelweg Tolpoort', color: '#1e293b' },
  { x: 2650, y: 100, width: 400, height: 180, name: 'De Koekploeg Bakkerij 🍪', color: '#7c2d12' },
  { x: 3150, y: 100, width: 300, height: 180, name: 'Logistiek Centrum', color: '#1e293b' },

  // ROW 2: y = 450
  { x: 100, y: 450, width: 250, height: 220, name: 'Appartementen Zuid', color: '#1e293b' },
  { x: 850, y: 450, width: 400, height: 220, name: 'Werkdonalds Megastore 🍔', color: '#dc2626' },
  { x: 1450, y: 450, width: 250, height: 220, name: 'Politiebureau Centrum 🚨', color: '#1e3a8a' },
  { x: 1800, y: 450, width: 300, height: 220, name: 'Joas Security Mansion 🏰', color: '#111827' },
  { x: 2300, y: 450, width: 450, height: 220, name: 'Winkelboulevard Noord', color: '#1e293b' },
  { x: 2900, y: 450, width: 350, height: 220, name: 'Saus Distributie', color: '#334155' },

  // ROW 3: y = 900
  { x: 100, y: 900, width: 350, height: 180, name: 'Bedrijvenpark Oost', color: '#1e293b' },
  { x: 650, y: 900, width: 150, height: 180, name: 'Mini Mall', color: '#334155' },
  { x: 1100, y: 900, width: 400, height: 180, name: 'Winkelcentrum Centrum', color: '#1e293b' },
  { x: 1650, y: 900, width: 300, height: 180, name: 'WerkPay Bank HQ 💰', color: '#0f172a' },
  { x: 2100, y: 900, width: 400, height: 180, name: 'City Hall / Stadhuis', color: '#1e3a8a' },
  { x: 2650, y: 900, width: 350, height: 180, name: 'Stadspark Paviljoen 🌳', color: '#064e3b' },
  { x: 3150, y: 900, width: 300, height: 180, name: 'Gym & Sports Arena', color: '#1e293b' },

  // ROW 4: y = 1350
  { x: 100, y: 1350, width: 300, height: 220, name: 'Parkwijk Villa’s', color: '#1e293b' },
  { x: 600, y: 1350, width: 450, height: 220, name: 'Industrieel Haven Depot', color: '#334155' },
  { x: 1250, y: 1350, width: 300, height: 220, name: 'Schoonmaak Opslag', color: '#1e293b' },
  { x: 1750, y: 1350, width: 400, height: 220, name: 'Strandboulevard Winkel', color: '#1e293b' },
  { x: 2300, y: 1350, width: 250, height: 220, name: 'McDonalds Rivalen', color: '#7f1d1d' },
  { x: 2700, y: 1350, width: 400, height: 220, name: 'Werkdonalds Haven Terminal', color: '#dc2626' },
  { x: 3200, y: 1350, width: 250, height: 220, name: 'Vuurtoren Kwartier', color: '#1e293b' },

  // ROW 5: y = 1800
  { x: 150, y: 1800, width: 400, height: 180, name: 'Nieuwbouwwijk West', color: '#1e293b' },
  { x: 750, y: 1800, width: 300, height: 180, name: 'Saus Silo complex', color: '#334155' },
  { x: 1200, y: 1800, width: 350, height: 180, name: 'Appartementen Oost', color: '#1e293b' },
  { x: 1700, y: 1800, width: 450, height: 180, name: 'Mega Bioscoop', color: '#111827' },
  { x: 2300, y: 1800, width: 300, height: 180, name: 'WerkPay Cloud Server farm', color: '#0f172a' },
  { x: 2800, y: 1800, width: 350, height: 180, name: 'Friet Snijderij', color: '#1e293b' },

  // ROW 6: y = 2250
  { x: 200, y: 2250, width: 350, height: 250, name: 'Suburban Residential B', color: '#1e293b' },
  { x: 700, y: 2250, width: 300, height: 250, name: 'Afvalverwerking Stad', color: '#334155' },
  { x: 1150, y: 2250, width: 500, height: 250, name: 'Winkelcentrum Zuid', color: '#1e293b' },
  { x: 1850, y: 2250, width: 300, height: 250, name: 'Werkdonalds Training Center 🎓', color: '#dc2626' },
  { x: 2350, y: 2250, width: 450, height: 250, name: 'Haven Containeroverslag', color: '#334155' },
  { x: 2950, y: 2250, width: 400, height: 250, name: 'Jachthaven Clubhuis ⛵', color: '#0f172a' }
];

const ROADS = [
  // Horizontal highways
  { x: 0, y: 340, w: MAP_WIDTH, h: 80 },
  { x: 0, y: 760, w: MAP_WIDTH, h: 80 },
  { x: 0, y: 1170, w: MAP_WIDTH, h: 80 },
  { x: 0, y: 1650, w: MAP_WIDTH, h: 80 },
  { x: 0, y: 2060, w: MAP_WIDTH, h: 80 },
  { x: 0, y: 2560, w: MAP_WIDTH, h: 80 },
  // Vertical highways
  { x: 380, y: 0, w: 80, h: MAP_HEIGHT },
  { x: 1150, y: 0, w: 80, h: MAP_HEIGHT },
  { x: 1550, y: 0, w: 80, h: MAP_HEIGHT },
  { x: 2150, y: 0, w: 80, h: MAP_HEIGHT },
  { x: 2780, y: 0, w: 80, h: MAP_HEIGHT },
  { x: 3380, y: 0, w: 80, h: MAP_HEIGHT }
];

export const GtaEasterEggModal: React.FC<GtaEasterEggModalProps> = ({ isOpen, onClose }) => {
  const { currentBankAccount, claimGtaReward } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('wd_gta_high_score') || '0', 10);
  });
  const [wantedLevel, setWantedLevel] = useState<number>(1);
  const [burgersDelivered, setBurgersDelivered] = useState<number>(0);
  const [health, setHealth] = useState<number>(100);
  const [nitro, setNitro] = useState<number>(100);
  const [isNitroActive, setIsNitroActive] = useState<boolean>(false);
  const [combo, setCombo] = useState<number>(1);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [lives, setLives] = useState<number>(5);
  const [ammo, setAmmo] = useState<number>(30);
  const [statusMsg, setStatusMsg] = useState<string>('🚨 WERKDONALDS GTA: Rijd naar de groene bezorgzone en schiet op politie met KLIK of F!');
  const [restartTrigger, setRestartTrigger] = useState<number>(0);
  const [hasClaimedReward, setHasClaimedReward] = useState<boolean>(false);
  const [claimStatus, setClaimStatus] = useState<string>('');

  // Simple Synthesized Web Audio Sound Effects
  const playRetroTone = (freq: number, type: OscillatorType, duration: number, vol = 0.15) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
      gain.gain.setValueAtTime(vol, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();
      osc.stop(audioCtxRef.current.currentTime + duration);
    } catch {}
  };

  const playGunshotSound = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      // Synthesize noise/snap sound for pistol
      const bufferSize = audioCtxRef.current.sampleRate * 0.1; // 100ms
      const buffer = audioCtxRef.current.createBuffer(1, bufferSize, audioCtxRef.current.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = audioCtxRef.current.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = audioCtxRef.current.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, audioCtxRef.current.currentTime);

      const gain = audioCtxRef.current.createGain();
      gain.gain.setValueAtTime(0.3, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtxRef.current.destination);

      noiseNode.start();
    } catch {}
  };

  const playExplosionSound = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      // Synthesize deep rumble for explosion
      const bufferSize = audioCtxRef.current.sampleRate * 0.4; // 400ms
      const buffer = audioCtxRef.current.createBuffer(1, bufferSize, audioCtxRef.current.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = audioCtxRef.current.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = audioCtxRef.current.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, audioCtxRef.current.currentTime);
      filter.frequency.exponentialRampToValueAtTime(30, audioCtxRef.current.currentTime + 0.4);

      const gain = audioCtxRef.current.createGain();
      gain.gain.setValueAtTime(0.5, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.4);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtxRef.current.destination);

      noiseNode.start();
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) return;

    try { AudioFX.success(); } catch {}
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let localScore = 0;
    let localDelivered = 0;
    let localHealth = 100;
    let localNitro = 100;
    let localWanted = 1;
    let localCombo = 1;
    let localLives = 5;
    let localAmmo = 30;
    let screenShake = 0;
    let invulnerableTimer = 0;
    let shootCooldown = 0;

    // Player starts at center of the massive 3600x2700 map
    const player = {
      x: 1800,
      y: 1350,
      angle: 0,
      speed: 0,
      maxSpeed: 4.8,
      accel: 0.19,
      friction: 0.94,
      rotSpeed: 0.068,
      width: 24,
      height: 42
    };

    // Keys state
    const keys: Record<string, boolean> = {};

    // Mouse details for shooting aiming
    let mousePos = { x: 0, y: 0 };
    let isMouseDown = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Mouse coordinates relative to canvas
      mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    };

    const handleMouseDown = () => {
      isMouseDown = true;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // Dynamic Objects Lists
    const particles: Particle[] = [];
    const skidMarks: SkidMark[] = [];
    const floatingTexts: FloatingText[] = [];
    const bullets: Bullet[] = [];

    // Static environmental obstacles
    const trees: Tree[] = [];
    // Spawn 35 logical trees on grass only (not on BUILDINGS or ROADS)
    let attempts = 0;
    while (trees.length < 35 && attempts < 800) {
      attempts++;
      const radius = 12 + Math.random() * 8;
      const x = 150 + Math.random() * (MAP_WIDTH - 300);
      const y = 150 + Math.random() * (MAP_HEIGHT - 300);

      // Check if overlaps any building (with safety padding of 15px)
      const hitsBuilding = BUILDINGS.some(b => 
        x >= b.x - radius - 15 && 
        x <= b.x + b.width + radius + 15 && 
        y >= b.y - radius - 15 && 
        y <= b.y + b.height + radius + 15
      );

      // Check if overlaps any road (with safety padding of 15px)
      const hitsRoad = ROADS.some(r => 
        x >= r.x - radius - 15 && 
        x <= r.x + r.w + radius + 15 && 
        y >= r.y - radius - 15 && 
        y <= r.y + r.h + radius + 15
      );

      // Ensure not too close to the starting point (1800, 1350)
      const nearCenter = Math.hypot(x - 1800, y - 1350) < 180;

      if (!hitsBuilding && !hitsRoad && !nearCenter) {
        trees.push({ x, y, radius });
      }
    }

    // Delivery Target Zones in the massive map
    let target = {
      x: 1750,
      y: 1250,
      radius: 40,
      name: 'Werkdonalds Megastore Drive-In 🍔'
    };

    const targetNames = [
      'Fam. De Vries (Kantoor Noord)', 
      'Joas (Skyscraper Suite) 🏢', 
      'Bouwplaats Oost', 
      'Havenkade Bezorging 🚢', 
      'Klant Centraal Station 🚉', 
      'Strandvilla VIP 🏝️',
      'Politiebureau Nachtdienst 👮',
      'Appartementenblok C 🏠',
      'Saus Depot Medewerker 🍅',
      'Winkelcentrum VIP 🛍️',
      'De Koekploeg Bakkerij 🍪',
      'Stadhuis Burgemeester 🏛️',
      'Jachthaven Clubhuis ⛵',
      'Vuurtoren Kwartier 🗼'
    ];

    const spawnNewTarget = () => {
      let valid = false;
      let newTargetX = 0;
      let newTargetY = 0;
      let attempts = 0;
      while (!valid && attempts < 100) {
        attempts++;
        // Pick random safe locations on horizontal/vertical ROADS
        const rd = ROADS[Math.floor(Math.random() * ROADS.length)];
        newTargetX = rd.x + (rd.w === MAP_WIDTH ? Math.random() * (MAP_WIDTH - 200) + 100 : rd.w / 2);
        newTargetY = rd.y + (rd.h === MAP_HEIGHT ? Math.random() * (MAP_HEIGHT - 200) + 100 : rd.h / 2);

        // Check if overlaps any building (with safety padding of 50px)
        const hitsBuilding = BUILDINGS.some(b => 
          newTargetX >= b.x - 50 && 
          newTargetX <= b.x + b.width + 50 && 
          newTargetY >= b.y - 50 && 
          newTargetY <= b.y + b.height + 50
        );
        if (!hitsBuilding) valid = true;
      }
      target.x = newTargetX;
      target.y = newTargetY;
      target.name = targetNames[Math.floor(Math.random() * targetNames.length)];
    };

    // Cop Cars Array (Can spawn multiple based on wanted level!)
    const cops: CopCar[] = [
      { id: 1, x: 200, y: 200, vx: 0, vy: 0, speed: 2.3, angle: 0, health: 100, maxHealth: 100, active: true, respawnTimer: 0, color: '#1e3a8a', isBlownUp: false }
    ];

    const handleRespawnCop = (cop: CopCar) => {
      // Spawn cop far away from player
      const dist = 500;
      let angle = Math.random() * Math.PI * 2;
      cop.x = Math.max(100, Math.min(MAP_WIDTH - 100, player.x + Math.cos(angle) * dist));
      cop.y = Math.max(100, Math.min(MAP_HEIGHT - 100, player.y + Math.sin(angle) * dist));
      cop.health = 100;
      cop.isBlownUp = false;
      cop.active = true;
      cop.respawnTimer = 0;
    };

    // Powerups list
    const powerUps: PowerUp[] = [
      { x: 500, y: 780, type: 'nitro', emoji: '⚡', label: '+NITRO BOOST' },
      { x: 1570, y: 360, type: 'cash', emoji: '💰', label: '+€ 150 CASH' },
      { x: 1190, y: 1190, type: 'ammo', emoji: '🔫', label: '+20 KOGELS' }
    ];

    const spawnRandomPowerUp = () => {
      if (powerUps.length >= 8) return;
      const types: PowerUp['type'][] = ['nitro', 'cash', 'golden_burger', 'repair', 'star', 'ammo'];
      const emojis = { nitro: '⚡', cash: '💰', golden_burger: '🍔', repair: '🛠️', star: '⭐', ammo: '🔫' };
      const labels = { nitro: '+NITRO BOOST', cash: '+€150 CASH', golden_burger: '🏆 MEGA BURGER', repair: '🛠️ REPARATIE', star: '⭐ WANTED LEVEL DOWN', ammo: '+20 KOGELS' };
      const t = types[Math.floor(Math.random() * types.length)];
      powerUps.push({
        x: 100 + Math.floor(Math.random() * (MAP_WIDTH - 200)),
        y: 100 + Math.floor(Math.random() * (MAP_HEIGHT - 200)),
        type: t,
        emoji: emojis[t],
        label: labels[t]
      });
    };

    // Pedestrians
    const pedestrians: Pedestrian[] = [
      { x: 420, y: 100, vx: 0.5, vy: 0, color: '#38bdf8' },
      { x: 1200, y: 400, vx: -0.4, vy: 0, color: '#f43f5e' },
      { x: 1600, y: 1200, vx: 0.6, vy: 0, color: '#a855f7' },
      { x: 800, y: 1400, vx: 0, vy: 0.5, color: '#34d399' }
    ];

    const addFloatingText = (x: number, y: number, text: string, color = '#fef08a') => {
      floatingTexts.push({
        id: Math.random(),
        x,
        y,
        text,
        color,
        life: 1.0
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;

      // Handle direct manual Shooting via F key or Enter
      if ((e.code === 'KeyF' || e.code === 'Enter') && localAmmo > 0 && !isGameOver && shootCooldown <= 0) {
        shootCooldown = 12; // shooting delay in frames (about 200ms)
        localAmmo -= 1;
        setAmmo(localAmmo);
        playGunshotSound();

        // Fire straight ahead from player's front bumper
        const bvx = Math.sin(player.angle) * 11;
        const bvy = -Math.cos(player.angle) * 11;
        const bx = player.x + Math.sin(player.angle) * 22;
        const by = player.y - Math.cos(player.angle) * 22;

        bullets.push({
          x: bx,
          y: by,
          vx: bvx,
          vy: bvy,
          life: 55,
          damage: 25
        });

        // Small muzzle flash
        particles.push({
          x: bx,
          y: by,
          vx: bvx * 0.2 + (Math.random() - 0.5) * 2,
          vy: bvy * 0.2 + (Math.random() - 0.5) * 2,
          life: 1,
          maxLife: 0.15,
          color: '#fcd34d',
          size: 6
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // PowerUp spawn interval
    const powerUpTimer = setInterval(spawnRandomPowerUp, 6000);

    // Trigger initial stats
    setLives(localLives);
    setAmmo(localAmmo);
    setScore(localScore);
    setBurgersDelivered(localDelivered);
    setWantedLevel(localWanted);
    setHealth(localHealth);
    setNitro(localNitro);

    // Main Game Loop
    const render = () => {
      // 1. EVALUATE CRASH & LIVES REDUCTION
      if (localHealth <= 0) {
        if (localLives > 1) {
          // Lose 1 Life & Respawn in middle of map
          localLives -= 1;
          setLives(localLives);
          localHealth = 100;
          setHealth(100);
          invulnerableTimer = 120; // 2 seconds invulnerable flashing

          // Explode current vehicle
          playExplosionSound();
          for (let p = 0; p < 25; p++) {
            particles.push({
              x: player.x,
              y: player.y,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1,
              maxLife: 0.8,
              color: Math.random() > 0.5 ? '#f59e0b' : '#ef4444',
              size: 5 + Math.random() * 8
            });
          }

          // Move player to map center
          player.x = 1800;
          player.y = 1350;
          player.speed = 0;
          player.angle = 0;

          // Reset Cops positions to far corner
          cops.forEach(cop => {
            cop.x = 200;
            cop.y = 200;
            cop.health = 100;
          });

          addFloatingText(1800, 1300, '💥 AUTO CRASH! -1 LEVEN', '#ef4444');
          setStatusMsg(`💥 Je auto is gecrasht! Gelukkig heb je nog ${localLives} auto's over. Respawned in de Drive-In!`);
          screenShake = 15;
        } else {
          localLives = 0;
          setLives(0);
          setIsGameOver(true);
          setStatusMsg('💥 GAME OVER! Al je bezorgwagens zijn vernield. Druk op Opnieuw Spelen!');
          playExplosionSound();
          return;
        }
      }

      // Decrement timers
      if (invulnerableTimer > 0) invulnerableTimer--;
      if (shootCooldown > 0) shootCooldown--;

      // Handle Mouse Shooting
      if (isMouseDown && localAmmo > 0 && shootCooldown <= 0 && !isGameOver) {
        shootCooldown = 15; // Cooldown of 250ms
        localAmmo -= 1;
        setAmmo(localAmmo);
        playGunshotSound();

        // Target pointing from center screen to mouse coordinates, accounting for camera
        const camX = Math.max(0, Math.min(MAP_WIDTH - canvas.width, player.x - canvas.width / 2));
        const camY = Math.max(0, Math.min(MAP_HEIGHT - canvas.height, player.y - canvas.height / 2));
        const targetWorldX = mousePos.x + camX;
        const targetWorldY = mousePos.y + camY;

        const dx = targetWorldX - player.x;
        const dy = targetWorldY - player.y;
        const dist = Math.hypot(dx, dy) || 1;

        const bulletAngle = Math.atan2(dy, dx);
        const bvx = Math.cos(bulletAngle) * 11;
        const bvy = Math.sin(bulletAngle) * 11;

        const bx = player.x + Math.cos(bulletAngle) * 22;
        const by = player.y + Math.sin(bulletAngle) * 22;

        bullets.push({
          x: bx,
          y: by,
          vx: bvx,
          vy: bvy,
          life: 55,
          damage: 25
        });

        // Spark muzzle particle
        particles.push({
          x: bx,
          y: by,
          vx: bvx * 0.15 + (Math.random() - 0.5) * 2,
          vy: bvy * 0.15 + (Math.random() - 0.5) * 2,
          life: 1,
          maxLife: 0.15,
          color: '#fcd34d',
          size: 5
        });
      }

      // Check Nitro
      const nitroActive = (keys['Space'] || keys['ShiftLeft'] || keys['ShiftRight']) && localNitro > 0;
      setIsNitroActive(nitroActive);

      let effectiveMaxSpeed = player.maxSpeed;
      let effectiveAccel = player.accel;

      if (nitroActive) {
        effectiveMaxSpeed = player.maxSpeed * 1.65;
        effectiveAccel = player.accel * 2.2;
        localNitro = Math.max(0, localNitro - 0.5);
        setNitro(Math.round(localNitro));

        // Nitro trail flame sparks
        particles.push({
          x: player.x - Math.sin(player.angle) * 20,
          y: player.y + Math.cos(player.angle) * 20,
          vx: -Math.sin(player.angle) * 3 + (Math.random() - 0.5) * 2,
          vy: Math.cos(player.angle) * 3 + (Math.random() - 0.5) * 2,
          life: 1,
          maxLife: 0.35,
          color: Math.random() > 0.4 ? '#38bdf8' : '#0284c7',
          size: 5 + Math.random() * 4
        });
      } else {
        if (localNitro < 100) {
          localNitro = Math.min(100, localNitro + 0.07);
          setNitro(Math.round(localNitro));
        }
      }

      // 2. UPDATE PLAYER DRIVING PHYSICS
      if (keys['KeyW'] || keys['ArrowUp']) {
        player.speed = Math.min(player.speed + effectiveAccel, effectiveMaxSpeed);
      } else if (keys['KeyS'] || keys['ArrowDown']) {
        player.speed = Math.max(player.speed - effectiveAccel, -effectiveMaxSpeed * 0.5);
      } else {
        player.speed *= player.friction;
      }

      const isTurning = keys['KeyA'] || keys['ArrowLeft'] || keys['KeyD'] || keys['ArrowRight'];
      if (keys['KeyA'] || keys['ArrowLeft']) {
        player.angle -= player.rotSpeed * (player.speed / effectiveMaxSpeed);
      }
      if (keys['KeyD'] || keys['ArrowRight']) {
        player.angle += player.rotSpeed * (player.speed / effectiveMaxSpeed);
      }

      // Skidmarks on high-speed drifting
      if (Math.abs(player.speed) > 2.8 && isTurning) {
        if (skidMarks.length > 120) skidMarks.shift();
        skidMarks.push({
          x: player.x,
          y: player.y,
          angle: player.angle,
          life: 1.0
        });
        particles.push({
          x: player.x,
          y: player.y,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          life: 1,
          maxLife: 0.4,
          color: 'rgba(226, 232, 240, 0.3)',
          size: 4 + Math.random() * 4
        });
      }

      player.x += Math.sin(player.angle) * player.speed;
      player.y -= Math.cos(player.angle) * player.speed;

      // Infinite Toroidal Map Wrapping (Drive Endless in all directions)
      if (player.x < 0) player.x += MAP_WIDTH;
      if (player.x >= MAP_WIDTH) player.x -= MAP_WIDTH;
      if (player.y < 0) player.y += MAP_HEIGHT;
      if (player.y >= MAP_HEIGHT) player.y -= MAP_HEIGHT;

      // Local wrapped player position for grid collision tests
      const localPx = ((player.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
      const localPy = ((player.y % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT;

      // BUILDINGS Collisions (using local relative position inside building tile grid)
      BUILDINGS.forEach(b => {
        if (localPx >= b.x - 12 && localPx <= b.x + b.width + 12 && localPy >= b.y - 12 && localPy <= b.y + b.height + 12) {
          // Smash building! Push out player
          if (Math.abs(player.speed) > 2.0 && invulnerableTimer <= 0) {
            playRetroTone(140, 'sawtooth', 0.25, 0.18);
            localHealth = Math.max(0, localHealth - 10);
            setHealth(localHealth);
            screenShake = 8;
            addFloatingText(player.x, player.y, '💥 -10 HP (GEBOTST!)', '#f43f5e');
          }
          player.speed *= -0.5;
          // Shove player away from building edges
          const distL = Math.abs(localPx - (b.x - 12));
          const distR = Math.abs(localPx - (b.x + b.width + 12));
          const distT = Math.abs(localPy - (b.y - 12));
          const distB = Math.abs(localPy - (b.y + b.height + 12));
          const minDist = Math.min(distL, distR, distT, distB);
          if (minDist === distL) player.x -= (localPx - (b.x - 14));
          else if (minDist === distR) player.x += (b.x + b.width + 14 - localPx);
          else if (minDist === distT) player.y -= (localPy - (b.y - 14));
          else if (minDist === distB) player.y += (b.y + b.height + 14 - localPy);
        }
      });

      // Tree Collisions
      trees.forEach(tr => {
        const tdx = getWrappedDelta(tr.x, localPx, MAP_WIDTH);
        const tdy = getWrappedDelta(tr.y, localPy, MAP_HEIGHT);
        const dist = Math.hypot(tdx, tdy);
        if (dist < tr.radius + 12) {
          if (Math.abs(player.speed) > 2.5 && invulnerableTimer <= 0) {
            playRetroTone(120, 'triangle', 0.2, 0.12);
            localHealth = Math.max(0, localHealth - 6);
            setHealth(localHealth);
            screenShake = 5;
            addFloatingText(player.x, player.y, '🌲 Houten boom!', '#4ade80');
          }
          player.speed *= -0.4;
          // Push back
          const angle = Math.atan2(tdy, tdx);
          player.x += Math.cos(angle) * (tr.radius + 14 - dist);
          player.y += Math.sin(angle) * (tr.radius + 14 - dist);
        }
      });

      // 3. MULTI-COP AI & ATTACK LOGIC (Based on Wanted Level)
      const targetCopCount = localWanted >= 5 ? 3 : (localWanted >= 3 ? 2 : 1);
      if (cops.length < targetCopCount) {
        cops.push({
          id: Date.now() + Math.random(),
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          speed: 2.1 + (cops.length * 0.3),
          angle: 0,
          health: 100,
          maxHealth: 100,
          active: true,
          respawnTimer: 0,
          color: cops.length === 1 ? '#1e3a8a' : '#0284c7',
          isBlownUp: false
        });
      }

      cops.forEach(cop => {
        if (!cop.active) {
          cop.respawnTimer--;
          if (cop.respawnTimer <= 0) {
            handleRespawnCop(cop);
          }
          return;
        }

        const cdx = getWrappedDelta(cop.x, player.x, MAP_WIDTH);
        const cdy = getWrappedDelta(cop.y, player.y, MAP_HEIGHT);
        const distToPlayer = Math.hypot(cdx, cdy);
        cop.angle = Math.atan2(cdy, cdx) + Math.PI / 2;

        if (distToPlayer > 12) {
          // Cops chase the player!
          cop.x += (cdx / distToPlayer) * cop.speed;
          cop.y += (cdy / distToPlayer) * cop.speed;

          if (cop.x < 0) cop.x += MAP_WIDTH;
          if (cop.x >= MAP_WIDTH) cop.x -= MAP_WIDTH;
          if (cop.y < 0) cop.y += MAP_HEIGHT;
          if (cop.y >= MAP_HEIGHT) cop.y -= MAP_HEIGHT;
        }

        // Cop Ram player collision
        if (distToPlayer < 28 && invulnerableTimer <= 0) {
          playRetroTone(100, 'sawtooth', 0.3, 0.25);
          localHealth = Math.max(0, localHealth - 14);
          setHealth(localHealth);
          screenShake = 12;
          player.speed *= -0.7;

          // Bounce back cop
          cop.x -= (cdx / distToPlayer) * 32;
          cop.y -= (cdy / distToPlayer) * 32;

          addFloatingText(player.x, player.y, '🚨 -14 HP GERAMD!', '#f43f5e');

          // Sparks
          for (let p = 0; p < 10; p++) {
            particles.push({
              x: player.x,
              y: player.y,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6,
              life: 1,
              maxLife: 0.45,
              color: '#ef4444',
              size: 4 + Math.random() * 3
            });
          }
        }
      });

      // 4. BULLETS UPDATES & HIT REGISTRATION
      for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
        const bul = bullets[bIdx];
        bul.x += bul.vx;
        bul.y += bul.vy;
        bul.life--;

        if (bul.life <= 0) {
          bullets.splice(bIdx, 1);
          continue;
        }

        let bulletDied = false;

        // Hit Cop Cars Check!
        for (let c = 0; c < cops.length; c++) {
          const cop = cops[c];
          if (!cop.active) continue;

          const dist = Math.hypot(bul.x - cop.x, bul.y - cop.y);
          if (dist < 26) {
            // Hit!
            cop.health -= bul.damage;
            bulletDied = true;
            playRetroTone(250, 'sawtooth', 0.1, 0.12);

            // Splatter spark on cop
            for (let p = 0; p < 5; p++) {
              particles.push({
                x: cop.x,
                y: cop.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1,
                maxLife: 0.25,
                color: '#fbbf24',
                size: 3
              });
            }

            addFloatingText(cop.x, cop.y - 15, `💥 -${bul.damage} HP`, '#fcd34d');

            if (cop.health <= 0) {
              // EXPLODE COP CAR!
              cop.active = false;
              cop.isBlownUp = true;
              cop.respawnTimer = 150; // 2.5 seconds cooldown
              playExplosionSound();

              localScore += 250;
              setScore(localScore);

              if (localScore > highScore) {
                setHighScore(localScore);
                localStorage.setItem('wd_gta_high_score', localScore.toString());
              }

              addFloatingText(cop.x, cop.y, '🏆 COP EXPLOODERD! +€250', '#10b981');
              setStatusMsg('🔥 Geweldig schot! Je hebt een politieauto opgeblazen! +€250,00');

              // Giant fiery explosion particles
              for (let ex = 0; ex < 25; ex++) {
                particles.push({
                  x: cop.x,
                  y: cop.y,
                  vx: (Math.random() - 0.5) * 9,
                  vy: (Math.random() - 0.5) * 9,
                  life: 1,
                  maxLife: 0.7,
                  color: Math.random() > 0.4 ? '#ef4444' : '#f97316',
                  size: 6 + Math.random() * 8
                });
              }
            }
            break;
          }
        }

        if (bulletDied) {
          bullets.splice(bIdx, 1);
          continue;
        }

        // Bullet Hit Building check
        for (let b = 0; b < BUILDINGS.length; b++) {
          const bl = BUILDINGS[b];
          if (bul.x >= bl.x && bul.x <= bl.x + bl.width && bul.y >= bl.y && bul.y <= bl.y + bl.height) {
            bullets.splice(bIdx, 1);
            break;
          }
        }
      }

      // 5. TARGET ZONE CHECK (Infinite Wrapped Delta)
      const tdxTarget = getWrappedDelta(player.x, target.x, MAP_WIDTH);
      const tdyTarget = getWrappedDelta(player.y, target.y, MAP_HEIGHT);
      const distToTarget = Math.hypot(tdxTarget, tdyTarget);
      if (distToTarget < target.radius) {
        playRetroTone(580, 'sine', 0.15);
        setTimeout(() => playRetroTone(880, 'sine', 0.2), 100);

        const earned = 75 * localCombo;
        localScore += earned;
        localDelivered += 1;
        setScore(localScore);
        setBurgersDelivered(localDelivered);

        // Update High Score
        if (localScore > highScore) {
          setHighScore(localScore);
          localStorage.setItem('wd_gta_high_score', localScore.toString());
        }

        addFloatingText(target.x, target.y, `🍔 Bezorgd! +€${earned},00`, '#34d399');
        setStatusMsg(`🎉 BEZORGD BIJ ${target.name}! +€ ${earned},00 | Rijd naar de volgende zone!`);
        screenShake = 6;
        spawnNewTarget();

        // Level up wanted state every 2 deliveries
        if (localDelivered % 2 === 0) {
          localWanted = Math.min(5, localWanted + 1);
          setWantedLevel(localWanted);
          localCombo = Math.min(5, localCombo + 1);
          setCombo(localCombo);
          addFloatingText(player.x, player.y - 40, `⭐ WANTED LEVEL ${localWanted}!`, '#fbbf24');
        }
      }

      // 6. POWERUPS PICKUP
      for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        const distToPu = Math.hypot(player.x - pu.x, player.y - pu.y);
        if (distToPu < 30) {
          playRetroTone(680, 'square', 0.2, 0.15);
          addFloatingText(pu.x, pu.y, pu.label, '#38bdf8');

          if (pu.type === 'nitro') {
            localNitro = 100;
            setNitro(100);
          } else if (pu.type === 'cash') {
            localScore += 150;
            setScore(localScore);
          } else if (pu.type === 'golden_burger') {
            localScore += 300;
            localDelivered += 1;
            setScore(localScore);
            setBurgersDelivered(localDelivered);
          } else if (pu.type === 'repair') {
            localHealth = Math.min(100, localHealth + 45);
            setHealth(localHealth);
          } else if (pu.type === 'star') {
            localWanted = Math.max(1, localWanted - 1);
            setWantedLevel(localWanted);
          } else if (pu.type === 'ammo') {
            localAmmo = Math.min(99, localAmmo + 20);
            setAmmo(localAmmo);
          }

          powerUps.splice(i, 1);
        }
      }

      // 7. UPDATE PEDESTRIANS
      pedestrians.forEach(ped => {
        ped.x += ped.vx;
        ped.y += ped.vy;
        if (ped.x < 100 || ped.x > MAP_WIDTH - 100) ped.vx *= -1;
        if (ped.y < 100 || ped.y > MAP_HEIGHT - 100) ped.vy *= -1;

        const dist = Math.hypot(player.x - ped.x, player.y - ped.y);
        if (dist < 22) {
          ped.vx *= -1.6;
          ped.vy *= -1.6;
          addFloatingText(ped.x, ped.y, '🏃‍♂️ WOAH!', '#fbbf24');
        }
      });

      // 8. RENDER SCREEN WITH SMOOTH CAMERA SCROLLING (INFINITE MULTI-TILE GRID)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake = Math.max(0, screenShake - 0.5);
      }

      // Align camera centered directly on player car
      const camX = player.x - canvas.width / 2;
      const camY = player.y - canvas.height / 2;

      ctx.translate(-camX, -camY);

      // Determine visible tile grid range around viewport
      const minTileX = Math.floor(camX / MAP_WIDTH);
      const maxTileX = Math.floor((camX + canvas.width) / MAP_WIDTH);
      const minTileY = Math.floor(camY / MAP_HEIGHT);
      const maxTileY = Math.floor((camY + canvas.height) / MAP_HEIGHT);

      // Render seamless infinite grid tiles
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          const ox = tx * MAP_WIDTH;
          const oy = ty * MAP_HEIGHT;

          // Grass Background Grid
          ctx.fillStyle = '#065f46'; // dark forest green
          ctx.fillRect(ox, oy, MAP_WIDTH, MAP_HEIGHT);

          ctx.fillStyle = '#047857'; // lighter spots
          for (let x = 0; x < MAP_WIDTH; x += 120) {
            for (let y = 0; y < MAP_HEIGHT; y += 120) {
              if ((x + y) % 240 === 0) {
                ctx.fillRect(ox + x, oy + y, 60, 60);
              }
            }
          }

          // Draw Roads Grid on tile
          ROADS.forEach(r => {
            ctx.fillStyle = '#1e293b'; // Slate asphalt
            ctx.fillRect(ox + r.x, oy + r.y, r.w, r.h);

            // Center dash lines
            ctx.save();
            ctx.strokeStyle = '#fbbf24'; // Yellow
            ctx.lineWidth = 3;
            ctx.setLineDash([15, 15]);
            ctx.beginPath();
            if (r.w === MAP_WIDTH) {
              ctx.moveTo(ox + r.x, oy + r.y + r.h / 2);
              ctx.lineTo(ox + r.x + r.w, oy + r.y + r.h / 2);
            } else {
              ctx.moveTo(ox + r.x + r.w / 2, oy + r.y);
              ctx.lineTo(ox + r.x + r.w / 2, oy + r.y + r.h);
            }
            ctx.stroke();
            ctx.restore();
          });

          // Draw BUILDINGS on tile
          BUILDINGS.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.fillRect(ox + b.x, oy + b.y, b.width, b.height);

            // Border / Wall shadow
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 4;
            ctx.strokeRect(ox + b.x, oy + b.y, b.width, b.height);

            // Building Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 11px font-mono, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(b.name, ox + b.x + b.width / 2, oy + b.y + b.height / 2);
          });

          // Draw Trees on tile
          trees.forEach(tr => {
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.arc(ox + tr.x + 4, oy + tr.y + 4, tr.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.arc(ox + tr.x, oy + tr.y, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#15803d';
            ctx.beginPath();
            ctx.arc(ox + tr.x, oy + tr.y - 2, tr.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(ox + tr.x - 3, oy + tr.y - 5, tr.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      // Draw Skid Marks
      skidMarks.forEach(sm => {
        ctx.save();
        ctx.translate(sm.x, sm.y);
        ctx.rotate(sm.angle);
        ctx.fillStyle = `rgba(15, 23, 42, ${sm.life * 0.35})`;
        ctx.fillRect(-10, -12, 4, 24);
        ctx.fillRect(6, -12, 4, 24);
        ctx.restore();
        sm.life -= 0.0015;
      });

      // Draw Pedestrians
      pedestrians.forEach(ped => {
        ctx.beginPath();
        ctx.arc(ped.x, ped.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ped.color;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw PowerUps
      powerUps.forEach(pu => {
        ctx.save();
        ctx.translate(pu.x, pu.y);
        const floatOffset = Math.sin(Date.now() / 180) * 5;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.arc(0, floatOffset, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pu.emoji, 0, floatOffset);
        ctx.restore();
      });

      // Draw Delivery Target Zone Ring (at closest wrapped position)
      const tdxTargetDraw = getWrappedDelta(player.x, target.x, MAP_WIDTH);
      const tdyTargetDraw = getWrappedDelta(player.y, target.y, MAP_HEIGHT);
      const targetDrawX = player.x + tdxTargetDraw;
      const targetDrawY = player.y + tdyTargetDraw;

      const pulseRadius = target.radius + Math.sin(Date.now() / 120) * 6;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.beginPath();
      ctx.arc(targetDrawX, targetDrawY, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Target Pin & Text label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'black 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`📍 ${target.name}`, targetDrawX, targetDrawY - 15);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('BESTEL ADRES', targetDrawX, targetDrawY + 15);

      // Draw Bullets
      bullets.forEach(bul => {
        ctx.fillStyle = '#fcd34d'; // glowing ammo
        ctx.beginPath();
        ctx.arc(bul.x, bul.y, 4, 0, Math.PI * 2);
        ctx.fill();

        particles.push({
          x: bul.x,
          y: bul.y,
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 1,
          life: 1,
          maxLife: 0.15,
          color: '#f97316',
          size: 2
        });
      });

      // Draw Cop Cars with health bars
      cops.forEach(cop => {
        if (!cop.active) return;

        ctx.save();
        ctx.translate(cop.x, cop.y);
        ctx.rotate(cop.angle - Math.PI / 2);

        // Cop Car body shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-11, -17, 22, 34);

        // Cop Car body
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(-10, -18, 20, 36);

        // Windshield
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-8, -12, 16, 8);

        // Roof Red/Blue Flasher
        const flashSec = Math.floor(Date.now() / 100) % 2 === 0;
        ctx.fillStyle = flashSec ? '#ef4444' : '#3b82f6';
        ctx.fillRect(-6, -4, 12, 8);

        ctx.restore();

        // Render Cop Health Bar above vehicle
        ctx.fillStyle = '#475569';
        ctx.fillRect(cop.x - 15, cop.y - 28, 30, 4);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(cop.x - 15, cop.y - 28, (cop.health / cop.maxHealth) * 30, 4);
      });

      // Draw Player Car (Flashing if invulnerable)
      let drawPlayer = true;
      if (invulnerableTimer > 0) {
        drawPlayer = Math.floor(invulnerableTimer / 6) % 2 === 0;
      }

      if (drawPlayer) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-player.width / 2 + 2, -player.height / 2 + 2, player.width, player.height);

        // Red Van Body
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);

        // Yellow bumper details
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-player.width / 2, -player.height / 2, player.width, 5);

        // Windshield glass
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(-player.width / 2 + 3, -player.height / 2 + 7, player.width - 6, 9);

        // Back doors / delivery burger icon on roof
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍔', 0, 11);

        // Headlights
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-player.width / 2 + 1, -player.height / 2 - 2, 4, 3);
        ctx.fillRect(player.width / 2 - 5, -player.height / 2 - 2, 4, 3);

        ctx.restore();
      }

      // Draw Navigation pointer towards current target (wrapped direction)
      const navAngle = Math.atan2(tdyTargetDraw, tdxTargetDraw);
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(navAngle);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(24, -6);
      ctx.lineTo(24, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Render Particles
      for (let pIdx = particles.length - 1; pIdx >= 0; pIdx--) {
        const pt = particles[pIdx];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.03;
        if (pt.life <= 0) {
          particles.splice(pIdx, 1);
          continue;
        }
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Floating Texts
      for (let fIdx = floatingTexts.length - 1; fIdx >= 0; fIdx--) {
        const ft = floatingTexts[fIdx];
        ft.y -= 0.7;
        ft.life -= 0.02;
        if (ft.life <= 0) {
          floatingTexts.splice(fIdx, 1);
          continue;
        }
        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 12px font-mono, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = ft.life;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore(); // end camera transformation shake

      // 9. DRAW GORGEOUS MINI-MAP IN BOTTOM-RIGHT (WITH TOROIDAL RADAR)
      const mmRadius = 60; // Slightly larger for better readability
      const mmX = canvas.width - mmRadius - 20;
      const mmY = canvas.height - mmRadius - 20;

      ctx.save();
      // Draw Circular container
      ctx.beginPath();
      ctx.arc(mmX, mmY, mmRadius, 0, Math.PI * 2);
      ctx.clip();

      // Mini map background (grass green)
      ctx.fillStyle = '#14532d'; // Dark forest green for offroad grass areas
      ctx.fillRect(mmX - mmRadius, mmY - mmRadius, mmRadius * 2, mmRadius * 2);

      const mmZoom = 0.08; // Radar zoom factor for local immersion

      // ROADS on minimap
      ctx.fillStyle = '#334155'; // Clean asphalt gray
      ROADS.forEach(r => {
        const rdx = getWrappedDelta(player.x, r.x, MAP_WIDTH);
        const rdy = getWrappedDelta(player.y, r.y, MAP_HEIGHT);
        const rx = mmX + rdx * mmZoom;
        const ry = mmY + rdy * mmZoom;
        const rw = r.w * mmZoom;
        const rh = r.h * mmZoom;
        ctx.fillRect(rx, ry, Math.max(1.5, rw), Math.max(1.5, rh));
      });

      // Draw BUILDINGS on local radar
      BUILDINGS.forEach(b => {
        const bdx = getWrappedDelta(player.x, b.x, MAP_WIDTH);
        const bdy = getWrappedDelta(player.y, b.y, MAP_HEIGHT);
        const bx = mmX + bdx * mmZoom;
        const by = mmY + bdy * mmZoom;
        const bw = b.width * mmZoom;
        const bh = b.height * mmZoom;
        ctx.fillStyle = b.color === '#dc2626' ? '#991b1b' : '#1e293b';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, bw, bh);
      });

      // Target on minimap
      const tdxMm = getWrappedDelta(player.x, target.x, MAP_WIDTH) * mmZoom;
      const tdyMm = getWrappedDelta(player.y, target.y, MAP_HEIGHT) * mmZoom;
      const tDist = Math.hypot(tdxMm, tdyMm);
      let tmx = mmX + tdxMm;
      let tmy = mmY + tdyMm;
      if (tDist > mmRadius - 5) {
        // Clamp to edge
        tmx = mmX + (tdxMm / tDist) * (mmRadius - 5);
        tmy = mmY + (tdyMm / tDist) * (mmRadius - 5);
      }
      const isPulse = Math.floor(Date.now() / 150) % 2 === 0;
      ctx.fillStyle = isPulse ? '#10b981' : '#059669';
      ctx.beginPath();
      ctx.arc(tmx, tmy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Cop(s) on minimap
      cops.forEach(cop => {
        if (!cop.active) return;
        const cdxMm = getWrappedDelta(player.x, cop.x, MAP_WIDTH) * mmZoom;
        const cdyMm = getWrappedDelta(player.y, cop.y, MAP_HEIGHT) * mmZoom;
        const cDist = Math.hypot(cdxMm, cdyMm);
        let cmx = mmX + cdxMm;
        let cmy = mmY + cdyMm;
        if (cDist > mmRadius - 4) {
          // Clamp to edge
          cmx = mmX + (cdxMm / cDist) * (mmRadius - 4);
          cmy = mmY + (cdyMm / cDist) * (mmRadius - 4);
        }
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cmx, cmy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      // Player in the absolute center
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Draw mini triangle showing direction
      ctx.save();
      ctx.translate(mmX, mmY);
      ctx.rotate(player.angle);
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      // Draw Mini Map outline ring & compass
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mmX, mmY, mmRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'black 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('W', mmX - mmRadius - 4, mmY + 3);
      ctx.fillText('E', mmX + mmRadius + 4, mmY + 3);
      ctx.fillText('N', mmX, mmY - mmRadius - 3);
      ctx.fillText('S', mmX, mmY + mmRadius + 9);

      // Loop
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      clearInterval(powerUpTimer);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mousedown', handleMouseDown);
      }
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, restartTrigger]);

  // Revert status message back to original help tip after 2.5 seconds
  useEffect(() => {
    const defaultMsg = '🚨 WERKDONALDS GTA: Rijd naar de groene bezorgzone en schiet op politie met KLIK of F!';
    if (statusMsg !== defaultMsg && !isGameOver) {
      const t = setTimeout(() => {
        setStatusMsg(defaultMsg);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [statusMsg, isGameOver]);

  const handleRestart = () => {
    setIsGameOver(false);
    setHealth(100);
    setNitro(100);
    setScore(0);
    setBurgersDelivered(0);
    setWantedLevel(1);
    setCombo(1);
    setLives(5);
    setAmmo(30);
    setHasClaimedReward(false);
    setClaimStatus('');
    setRestartTrigger(prev => prev + 1); // trigger useEffect fully refresh
    setStatusMsg('🚨 Opnieuw begonnen! Rijd naar de groene bezorgzone en schiet op politie met KLIK of F!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-slate-900 border-4 border-amber-500 rounded-3xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-2xl relative max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 text-white flex items-center justify-center text-3xl font-black shrink-0 animate-pulse">
              🏎️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-lg text-white uppercase tracking-tight">
                  GTA: Werkdonalds City Shootout 🍔💥
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30 animate-pulse flex items-center gap-1">
                  ♾️ ONEINDIGE MAP
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30">
                  VERSION 3.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Bestuur met <strong>WASD / Pijltjes</strong> • <strong>SPATIE / SHIFT = ⚡ NITRO</strong> • <strong>KLIK / F = 🔫 POLITIE NEERSCHIETEN!</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-bold transition flex items-center gap-1.5"
          >
            <X className="w-5 h-5 text-rose-500" />
            <span>Sluiten (ESC)</span>
          </button>
        </div>

        {/* HUD Top Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-[9px] text-slate-500 uppercase font-bold block">Omzet Score</span>
            <span className="text-base font-black text-emerald-400">€ {score},00</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-[9px] text-slate-500 uppercase font-bold block">Top Score</span>
            <span className="text-base font-black text-amber-300">🏆 € {highScore}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-[9px] text-slate-500 uppercase font-bold block">Bestellingen</span>
            <span className="text-base font-black text-amber-400">🍔 {burgersDelivered}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono flex flex-col justify-center items-center">
            <span className="text-[9px] text-slate-500 uppercase font-bold block mb-0.5">Wanted Stars</span>
            <span className="text-sm font-black text-rose-400 leading-none">
              {'⭐'.repeat(wantedLevel)}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-[9px] text-slate-500 uppercase font-bold block">Combo</span>
            <span className="text-base font-black text-cyan-400">{combo}x Boost</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-[9px] text-slate-500 uppercase font-bold block">Magazijn Kogels</span>
            <span className="text-base font-black text-yellow-400">🔫 {ammo}</span>
          </div>
        </div>

        {/* Health, Nitro & Lives Gauge Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          
          {/* LIVES PANEL */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 uppercase font-black text-[10px] tracking-wider flex items-center gap-1.5">
              <Car className="w-4 h-4 text-rose-500" />
              <span>Resterende Auto's</span>
            </span>
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Heart 
                  key={idx} 
                  className={`w-5 h-5 ${idx < lives ? 'text-rose-500 fill-rose-600 animate-pulse' : 'text-slate-800'}`} 
                />
              ))}
            </div>
          </div>

          {/* HEALTH */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between font-bold text-slate-300 text-[11px]">
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Auto Conditie (HP)</span>
              </span>
              <span className={health < 30 ? 'text-rose-400 font-mono animate-pulse font-black' : 'text-emerald-400 font-mono font-black'}>
                {health}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className={`h-full transition-all duration-200 ${health < 30 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${health}%` }}
              />
            </div>
          </div>

          {/* NITRO */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between font-bold text-slate-300 text-[11px]">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400 animate-bounce" />
                <span>Nitro Boost (Spatie)</span>
              </span>
              <span className="text-cyan-400 font-mono font-black">{nitro}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-200"
                style={{ width: `${nitro}%` }}
              />
            </div>
          </div>
        </div>

        {/* Game Canvas container */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-slate-800 bg-slate-950 flex justify-center shadow-inner">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full max-w-[800px] h-auto object-contain block cursor-crosshair"
          />

          {/* Game Over Screen */}
          {isGameOver && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4 animate-fadeIn overflow-y-auto">
              <span className="text-6xl animate-bounce">💥</span>
              <h3 className="text-3xl font-black text-rose-500 uppercase tracking-tight">
                WASTED / BUSTED!
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                Al je bezorgwagens zijn total-loss gereden of in beslag genomen! Je hebt <strong>{burgersDelivered} burgers</strong> geleverd en een totale arcade omzet behaald van:
              </p>
              <div className="px-6 py-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-2xl font-black font-mono">
                € {score},00
              </div>

              {/* WerkPay Winst Claim Box */}
              {score > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 text-emerald-200 max-w-sm w-full space-y-2 text-xs shadow-xl">
                  <div className="font-extrabold flex items-center justify-center gap-1.5 text-emerald-400 text-sm">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>Verdiend WerkPay Saldo: € {Math.min(15.00, Math.max(0.25, Math.round((score * 0.01) * 100) / 100)).toFixed(2)}</span>
                  </div>

                  {currentBankAccount ? (
                    <div>
                      {!hasClaimedReward ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await claimGtaReward(score);
                            setHasClaimedReward(res.success);
                            setClaimStatus(res.message);
                            if (res.success) {
                              showToast(res.message, 'success');
                            } else {
                              showToast(res.message, 'error');
                            }
                          }}
                          className="w-full py-2.5 rounded-xl font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-2 uppercase tracking-wide text-xs"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Keer Winst Uit Op WerkPay ({currentBankAccount.account_holder})</span>
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-center border border-emerald-500/30 text-[11px] flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>{claimStatus || 'Winst overgemaakt op je WerkPay rekening!'}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-300 italic">
                      💡 Tip: Log in bij WerkPay om je verdiende GTA-winst (€ {Math.min(15.00, Math.max(0.25, Math.round((score * 0.01) * 100) / 100)).toFixed(2)}) direct op je bankrekening te storten!
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={handleRestart}
                className="px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-400/20 active:scale-95 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Opnieuw Spelen</span>
              </button>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-amber-400 text-center flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 truncate">
            <span className="px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-black text-[10px] border border-amber-500/30 uppercase shrink-0">Live Radio</span>
            <span className="truncate">{statusMsg}</span>
          </div>
          <div className="flex items-center gap-4 shrink-0 text-slate-400 text-[11px]">
            <span>💡 Pak 🔫 blauwe kistjes voor extra kogels!</span>
          </div>
        </div>

      </div>
    </div>
  );
};
