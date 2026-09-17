 
  // ================================================================
//  BACKGROUND ANIMACIJA - ROCKET LEAGUE STYLE ČESTICE
// ================================================================

// Prepoznavanje sezone po datumu - vraca 'winter', 'halloween' ili null.
// Zima: 15.12 - 10.1 (preko granice godine). Noc vestica: 24.10 - 31.10.
function detectSeasonTheme(d){
  d = d || new Date();
  const month = d.getMonth() + 1, day = d.getDate();
  if((month === 12 && day >= 15) || (month === 1 && day <= 10)) return 'winter';
  if(month === 10 && day >= 24 && day <= 31) return 'halloween';
  return null;
}

// Primeni suptilan sezonski akcenat na logo-liniju u headeru.
function applySeasonToHeader(season){
  const bar = document.querySelector('.hero-title .bar');
  if(!bar) return;
  bar.classList.remove('season-winter', 'season-halloween');
  if(season) bar.classList.add('season-' + season);
}

class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particles-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: null, y: null };
    this.season = detectSeasonTheme();
    this.count = this.season === 'winter' ? 90 : 80;
    this.connectionDistance = this.season === 'winter' ? 0 : 150; // pahulje se ne povezuju linijama
    this.animationId = null;
    applySeasonToHeader(this.season);

    this.resize();
    this.initParticles();
    this.bindEvents();
    this.animate();
  }
  
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  
  initParticles() {
    this.particles = [];
    const palettes = {
      winter: ['#ffffff', '#E8F4FF', '#BFE7FF', '#8EC9FF'],
      halloween: ['#FF8A2B', '#7C3AED', '#FBBF24', '#C084FC', '#39FF14'],
      default: ['#3DA9FC', '#FF6B35', '#4ADE80', '#FBBF24', '#C084FC', '#F472B6', '#ffffff'],
    };
    const colors = palettes[this.season] || palettes.default;

    for (let i = 0; i < this.count; i++) {
      if(this.season === 'winter'){
        // Prave padajuce pahulje - kreću odozgo, blago se ljuljaju levo-desno, padaju naniže.
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          size: Math.random() * 2.6 + 1.6,
          speedX: 0,
          speedY: Math.random() * 0.5 + 0.35,
          swayPhase: Math.random() * Math.PI * 2,
          swaySpeed: 0.01 + Math.random() * 0.02,
          swayAmount: 0.4 + Math.random() * 0.6,
          color: colors[Math.floor(Math.random() * colors.length)],
          opacity: Math.random() * 0.5 + 0.35,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.01 + Math.random() * 0.02,
          snow: true,
        });
      } else {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          size: Math.random() * 3 + 1.5,
          speedX: (Math.random() - 0.5) * 0.6,
          speedY: (Math.random() - 0.5) * 0.6,
          color: colors[Math.floor(Math.random() * colors.length)],
          opacity: Math.random() * 0.6 + 0.2,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.01 + Math.random() * 0.02,
          snow: false,
        });
      }
    }
  }
  
  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    
    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
    
    // Touch support
    this.canvas.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      this.mouse.x = touch.clientX;
      this.mouse.y = touch.clientY;
    }, { passive: true });
    
    this.canvas.addEventListener('touchend', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
  }
  
  animate() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    
    ctx.clearRect(0, 0, W, H);
    
    // Ažuriraj i nacrtaj čestice
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      if (p.snow) {
        // Prava padajuća pahulja: pada naniže, blago se ljulja levo-desno, vraća se na vrh
        p.swayPhase += p.swaySpeed;
        p.x += Math.sin(p.swayPhase) * p.swayAmount;
        p.y += p.speedY;
        p.pulse += p.pulseSpeed;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
      } else {
        // Pomeranje
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += p.pulseSpeed;

        // Odbijanje od zidova
        if (p.x < 0 || p.x > W) p.speedX *= -1;
        if (p.y < 0 || p.y > H) p.speedY *= -1;

        // Privlačenje ka mišu
        if (this.mouse.x !== null) {
          const dx = this.mouse.x - p.x;
          const dy = this.mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            const force = (200 - dist) / 200 * 0.02;
            p.speedX += dx * force * 0.01;
            p.speedY += dy * force * 0.01;
            // Ograniči brzinu
            const speed = Math.sqrt(p.speedX * p.speedX + p.speedY * p.speedY);
            if (speed > 1.5) {
              p.speedX = (p.speedX / speed) * 1.5;
              p.speedY = (p.speedY / speed) * 1.5;
            }
          }
        }
      }
      
      // Crtanje čestice sa pulsiranjem
      const pulseSize = 1 + Math.sin(p.pulse) * 0.3;
      const size = p.size * pulseSize;
      const opacity = p.opacity * (0.7 + Math.sin(p.pulse) * 0.3);
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = opacity;
      ctx.fill();
      
      // Glow efekat
      if (size > 2) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4);
        gradient.addColorStop(0, p.color + '33');
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }
    
    // Povezivanje čestica linijama (preskoči za pahulje - nema smisla)
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < (this.connectionDistance > 0 ? this.particles.length : 0); i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < this.connectionDistance) {
          const alpha = (1 - dist / this.connectionDistance) * 0.3;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    
    ctx.globalAlpha = 1;
    this.animationId = requestAnimationFrame(() => this.animate());
  }
  
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

// Pokreni čestice nakon što se stranica učita
let particleSystem = null;

function initParticles() {
  if (particleSystem) {
    particleSystem.destroy();
  }
  particleSystem = new ParticleSystem();
}

// Pokreni kada se DOM učita
document.addEventListener('DOMContentLoaded', initParticles);

// Zaustavi čestice kada se stranica zatvori
window.addEventListener('beforeunload', () => {
  if (particleSystem) {
    particleSystem.destroy();
  }
});
const PALETTE = ['#3DA9FC', '#FF6B35', '#4ADE80', '#FBBF24', '#C084FC', '#F472B6'];

// Prevodi naziva statistika (koriste se svuda gde se sirovi kljucevi iz
// core/boost/movement/positioning/demo prikazuju korisniku).
const STAT_LABELS = {
  goals: 'Golovi',
  assists: 'Asistencije',
  saves: 'Odbrane',
  shots: 'Šutevi',
  score: 'Poeni',
  shooting_percentage: 'Preciznost šuta (%)',
  bpm: 'Boost u minuti',
  avg_amount: 'Prosečan boost',
  amount_collected: 'Sakupljeno boosta',
  amount_stolen: 'Ukradeno boosta',
  count_collected_big: 'Veliki boost pokupljen',
  count_collected_small: 'Mali boost pokupljen',
  percent_zero_boost: 'Vreme bez boosta (%)',
  percent_full_boost: 'Vreme sa punim boostom (%)',
  avg_speed: 'Prosečna brzina',
  percent_supersonic_speed: 'Supersonična brzina (%)',
  percent_ground: 'Na zemlji (%)',
  percent_low_air: 'Nizak let (%)',
  percent_high_air: 'Visok let (%)',
  count_powerslide: 'Broj powerslide-ova',
  percent_defensive_third: 'U odbrani (%)',
  percent_offensive_third: 'U napadu (%)',
  percent_behind_ball: 'Iza lopte (%)',
  avg_distance_to_ball: 'Prosečna udaljenost od lopte',
  avg_distance_to_mates: 'Prosečna udaljenost od saigrača',
  inflicted: 'Zadate demolicije',
  taken: 'Primljene demolicije',
};
function statLabel(key){ return STAT_LABELS[key] || key; }

const PLAYER_COLOR_OVERRIDES = {
  'Toške': '#3DA9FC',
  'Cane':  '#E00306',
  'Ivan':  '#4ADE80',
  'Pajke': '#FBBF24',
};

const PLAYER_IMAGE_OVERRIDES = {
  'Toške': 'images/toske.png',
  'Cane': 'images/cane.png',
  'Ivan': 'images/ivan.png',
  'Pajke': 'images/pajke.png',
};

// Ime auta (tacno kao sto dolazi iz ballchasing "car_name" polja) -> slicica.
// Nazivi moraju da se poklapaju TACNO (veliko/malo slovo bitno), npr. "Octane", "Fennec", "Dominus".
// Slike stavi u images/cars/ folder.
const CAR_IMAGE_OVERRIDES = {
  'Octane': 'images/cars/Octane.png',
  'Fennec': 'images/cars/Fennec.png',
  'Takumi RX-T': 'images/cars/Takumi RX-T.png',
  'Batmobile': 'images/cars/batmobile.png',
  'Breakout': 'images/cars/breakout.png',
};

const NAME_MAP_RAW = {
  'ExMirage': 'Toške',
  'ExMirage(1)': 'Cane',
  'ExMirage(2)': 'Ivan',
  'ExMirage(3)': 'Pajke',
  'Zbunjena Inila': 'Toške',
  'Zbunjena Inila(1)': 'Cane',
  'Zbunjena Inila(2)': 'Ivan',
  'Zbunjena Inila(3)': 'Pajke',
  'Rarely_Sober': 'Cane',
};
const NAME_MAP = {};
Object.entries(NAME_MAP_RAW).forEach(([k, v]) => {
  NAME_MAP[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
});

function mapName(raw){
  if(!raw) return raw;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return NAME_MAP[key] || raw;
}

const TREND_METRICS = [
  {key:'core.goals', label:'Golovi'},
  {key:'core.assists', label:'Asistencije'},
  {key:'core.saves', label:'Odbrane'},
  {key:'core.shots', label:'Šutevi'},
  {key:'core.score', label:'Score'},
  {key:'boost.avg_amount', label:'Prosečan boost', isRate:true},
  {key:'boost.bpm', label:'BPM (potrošnja)', isRate:true},
  {key:'positioning.percent_behind_ball', label:'% iza lopte', isRate:true},
  {key:'movement.avg_speed', label:'Prosečna brzina', isRate:true},
  {key:'demo.inflicted', label:'Demo-i zadati'},
];

const RADAR_METRICS = [
  {key:'core.goals', label:'Golovi'},
  {key:'core.assists', label:'Asistencije'},
  {key:'core.saves', label:'Odbrane'},
  {key:'core.shots', label:'Šutevi'},
  {key:'boost.avg_amount', label:'Boost'},
  {key:'positioning.percent_behind_ball', label:'Iza lopte %'},
];

let RAW = [];
let allPlayers = [];
let players = [];
let playerColor = {};
let activePlayers = new Set();
let highlightsViewMode = (function(){
  try{ return localStorage.getItem('rl_highlights_view') || 'shelf'; }catch(e){ return 'shelf'; }
})();
let activeTrophyShelves = [];
let modeFilter = 'offline';
let sortKey = 'date';
let sortDir = -1;
let charts = {};
let wrappedSlides = [];
let wrappedIndex = 0;
let wrappedTimer = null;
let wrappedRows = [];
const WRAPPED_SLIDE_MS = 6000;
  // ===== DODAJ OVO - PAGINACIJA VARIJABLE =====
let currentPage = 1;
let pageSize = 25;
// ===== KRAJ =====

const $ = sel => document.querySelector(sel);
const getPath = (obj, path) => path.split('.').reduce((o,k) => (o == null ? o : o[k]), obj);
const avg = arr => arr.length ? arr.reduce((a,b)=>a+(b||0),0)/arr.length : 0;
const sum = arr => arr.reduce((a,b)=>a+(b||0),0);

function fmtDate(iso){
  if(!iso) return '?';
  const d = new Date(iso);
  return d.toLocaleDateString('sr-RS', {day:'2-digit', month:'2-digit', year:'numeric'});
}

