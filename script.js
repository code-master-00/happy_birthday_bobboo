/* ==========================================
   CONFIG & TARGET DATE
   ========================================== */
const TARGET_DATE = new Date(2026, 6, 16, 0, 0, 0); // July 16, 2026 at Midnight local time
let isUnlocked = false;

/* ==========================================
   WEB AUDIO API: MUSIC BOX & SYNTHESIZER
   ========================================== */
let audioCtx = null;
let isMusicPlaying = false;
let sequencerTimeout = null;
let noteIndex = 0;

// Notes and frequencies for Hedwig's Theme (transposed to a soft music box key)
const NOTES = {
  'B4': 493.88, 'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 
  'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 
  'A5': 880.00, 'Bb5': 932.33, 'B5': 987.77, 'C6': 1046.50, 'C#6': 1109.73, 
  'D6': 1174.66, 'D#6': 1244.51, 'E6': 1318.51, 'F6': 1396.91, 'F#6': 1479.98,
  'G6': 1567.98, 'B6': 1975.53
};

// Simplified magical score: { note, dur }
// Durations relative to beat time
const HEDWIG_MELODY = [
  { note: 'B4', dur: 0.5 },
  { note: 'E5', dur: 0.75 },
  { note: 'G5', dur: 0.25 },
  { note: 'F#5', dur: 0.5 },
  { note: 'E5', dur: 1.0 },
  { note: 'B5', dur: 0.5 },
  { note: 'A5', dur: 1.5 },
  { note: 'F#5', dur: 1.25 },
  
  { note: 'E5', dur: 0.75 },
  { note: 'G5', dur: 0.25 },
  { note: 'F#5', dur: 0.5 },
  { note: 'D#5', dur: 1.0 },
  { note: 'F5', dur: 0.5 },
  { note: 'B4', dur: 1.5 },
  
  { note: 'B4', dur: 0.5 },
  { note: 'E5', dur: 0.75 },
  { note: 'G5', dur: 0.25 },
  { note: 'F#5', dur: 0.5 },
  { note: 'E5', dur: 1.0 },
  { note: 'B5', dur: 0.5 },
  { note: 'D6', dur: 1.0 },
  { note: 'C#6', dur: 0.5 },
  { note: 'C6', dur: 1.0 },
  { note: 'G#5', dur: 0.5 },
  
  { note: 'C6', dur: 0.75 },
  { note: 'B5', dur: 0.25 },
  { note: 'Bb5', dur: 0.5 },
  { note: 'B4', dur: 1.0 },
  { note: 'G5', dur: 0.5 },
  { note: 'E5', dur: 2.0 }
];

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playMusicBoxNote(freq, startTime, duration) {
  if (!audioCtx) return;
  
  // Principal oscillator (triangle wave for soft bell/music-box tone)
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, startTime);
  
  // Secondary oscillator (higher sine overtone for chime brightness)
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, startTime);

  const gainNode = audioCtx.createGain();
  
  // ADSR Music Box envelope: instant attack, long exponential decay
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration - 0.05);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc1.start(startTime);
  osc1.stop(startTime + duration);
  osc2.start(startTime);
  osc2.stop(startTime + duration);
}

// Background soft atmospheric pad (plays subtle, warm low chords)
let padOscs = [];
let padGain = null;

function playPadChords(startTime, chordType) {
  if (!audioCtx) return;
  
  // Clean up previous chords smoothly
  if (padOscs.length > 0) {
    const fadeOutTime = startTime + 0.5;
    padGain.gain.exponentialRampToValueAtTime(0.0001, fadeOutTime);
    padOscs.forEach(o => {
      try { o.stop(fadeOutTime); } catch(e){}
    });
    padOscs = [];
  }

  // Create new gain for chord pad
  padGain = audioCtx.createGain();
  padGain.gain.setValueAtTime(0, startTime);
  padGain.gain.linearRampToValueAtTime(0.03, startTime + 1.0); // very quiet hum

  let chordFreqs = [];
  if (chordType === 'Em') chordFreqs = [164.81, 196.00, 246.94]; // E3, G3, B3
  else if (chordType === 'Am') chordFreqs = [220.00, 261.63, 329.63]; // A3, C4, E4
  else if (chordType === 'B7') chordFreqs = [246.94, 311.13, 369.99]; // B3, D#4, F#4
  else chordFreqs = [196.00, 246.94, 293.66]; // G3, B3, D4 (G Major default)

  chordFreqs.forEach(freq => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.connect(padGain);
    padOscs.push(osc);
    osc.start(startTime);
  });

  padGain.connect(audioCtx.destination);
}

function runSequencer() {
  const tempo = 115; // BPM
  const beatTime = 60 / tempo;
  const lookAhead = 0.1;
  const now = audioCtx.currentTime;

  if (noteIndex === 0) {
    // Play chord updates matching the melody flow
    playPadChords(now, 'Em');
  } else if (noteIndex === 8) {
    playPadChords(now, 'Am');
  } else if (noteIndex === 14) {
    playPadChords(now, 'B7');
  } else if (noteIndex === 22) {
    playPadChords(now, 'Em');
  }

  // Schedule notes
  const noteData = HEDWIG_MELODY[noteIndex];
  const freq = NOTES[noteData.note];
  const duration = noteData.dur * beatTime * 2.2;

  if (freq) {
    playMusicBoxNote(freq, now, duration);
  }

  noteIndex = (noteIndex + 1) % HEDWIG_MELODY.length;
  
  const timeToNextNote = noteData.dur * beatTime * 2.2 * 1000;
  sequencerTimeout = setTimeout(runSequencer, timeToNextNote);
}

function startMusic() {
  initAudio();
  isMusicPlaying = true;
  noteIndex = 0;
  runSequencer();
  
  const btn = document.getElementById('music-btn');
  btn.classList.add('playing');
  btn.querySelector('.music-text').innerText = "Mute Music";
}

function stopMusic() {
  isMusicPlaying = false;
  clearTimeout(sequencerTimeout);
  if (padOscs.length > 0) {
    padOscs.forEach(o => {
      try { o.stop(); } catch(e){}
    });
    padOscs = [];
  }
  const btn = document.getElementById('music-btn');
  btn.classList.remove('playing');
  btn.querySelector('.music-text').innerText = "Play Magic Music";
}

function toggleMusic() {
  if (isMusicPlaying) {
    stopMusic();
  } else {
    startMusic();
  }
}

// Magical Wind Chimes effect when envelope opens
function playMagicalChimes() {
  initAudio();
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const arpeggio = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51, 1567.98, 1975.53, 2093.00];
  
  arpeggio.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.06);
    
    gain.gain.setValueAtTime(0, now + idx * 0.06);
    gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.06 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.8);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now + idx * 0.06);
    osc.stop(now + idx * 0.06 + 0.9);
  });
}


/* ==========================================
   CANVAS PARTICLE SYSTEM
   ========================================== */
const canvas = document.getElementById('magic-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
let mouse = { x: null, y: null, active: false };

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Particle Class
class Particle {
  constructor(x, y, type = 'star') {
    this.x = x;
    this.y = y;
    this.type = type; // 'star' | 'heart' | 'sparkle' | 'panda'
    
    this.size = Math.random() * 3 + 1;
    this.speedX = Math.random() * 1.5 - 0.75;
    this.speedY = Math.random() * -1.5 - 0.5; // default float up
    
    if (this.type === 'sparkle') {
      this.size = Math.random() * 4 + 2;
      this.speedX = Math.random() * 4 - 2;
      this.speedY = Math.random() * 4 - 2;
      this.gravity = 0.05;
    } else if (this.type === 'heart') {
      this.size = Math.random() * 8 + 6;
      this.speedX = Math.random() * 1.2 - 0.6;
      this.speedY = Math.random() * -1.2 - 0.4;
      this.swingSpeed = Math.random() * 0.02 + 0.01;
      this.swingRange = Math.random() * 1.5 + 0.5;
      this.angle = Math.random() * Math.PI;
    } else if (this.type === 'panda') {
      this.size = Math.random() * 20 + 15;
      this.speedX = Math.random() * 6 - 3;
      this.speedY = Math.random() * -6 - 2;
      this.gravity = 0.15;
      this.rotation = Math.random() * 0.2 - 0.1;
      this.angle = 0;
    }
    
    this.opacity = 1;
    this.fade = Math.random() * 0.01 + 0.005;
    if (this.type === 'sparkle') this.fade = Math.random() * 0.03 + 0.02;
    if (this.type === 'panda') this.fade = Math.random() * 0.015 + 0.01;
    
    // Choose beautiful magical colors
    const colors = ['#e2ba43', '#ffdf7a', '#741b27', '#e85d75', '#ffffff'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    
    if (this.type === 'sparkle') {
      this.speedY += this.gravity;
    } else if (this.type === 'heart') {
      this.angle += this.swingSpeed;
      this.x += Math.sin(this.angle) * this.swingRange;
    } else if (this.type === 'panda') {
      this.speedY += this.gravity;
      this.angle += this.rotation;
    }
    
    this.opacity -= this.fade;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    
    if (this.type === 'star') {
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#fff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'sparkle') {
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      
      // Star flare/sparkle shape
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.size);
      ctx.lineTo(this.x + this.size*0.3, this.y - this.size*0.3);
      ctx.lineTo(this.x + this.size, this.y);
      ctx.lineTo(this.x + this.size*0.3, this.y + this.size*0.3);
      ctx.lineTo(this.x, this.y + this.size);
      ctx.lineTo(this.x - this.size*0.3, this.y + this.size*0.3);
      ctx.lineTo(this.x - this.size, this.y);
      ctx.lineTo(this.x - this.size*0.3, this.y - this.size*0.3);
      ctx.closePath();
      ctx.fill();
    } 
    else if (this.type === 'heart') {
      ctx.fillStyle = '#e85d75'; // Romantic soft rose/red
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#e85d75';
      drawHeart(ctx, this.x, this.y, this.size, this.size);
    } 
    else if (this.type === 'panda') {
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.font = `${this.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐼', 0, 0);
    }
    
    ctx.restore();
  }
}

// Draw Heart helper for Canvas
function drawHeart(c, x, y, width, height) {
  c.beginPath();
  const topCurveHeight = height * 0.3;
  c.moveTo(x, y + topCurveHeight);
  // Left curve
  c.bezierCurveTo(
    x - width / 2, y - topCurveHeight, 
    x - width, y + height / 3, 
    x, y + height
  );
  // Right curve
  c.bezierCurveTo(
    x + width, y + height / 3, 
    x + width / 2, y - topCurveHeight, 
    x, y + topCurveHeight
  );
  c.closePath();
  c.fill();
}

function handleParticles() {
  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
    
    // Remove faded particles
    if (particles[i].opacity <= 0) {
      particles.splice(i, 1);
      i--;
    }
  }
  
  // Ambient stars generation
  if (Math.random() < 0.08 && particles.filter(p => p.type === 'star').length < 60) {
    particles.push(new Particle(Math.random() * canvas.width, Math.random() * canvas.height, 'star'));
  }
  
  // Ambient hearts generation (higher chance on letter screens)
  const isLetterScreen = document.getElementById('letter-screen').classList.contains('active');
  const maxHearts = isLetterScreen ? 20 : 6;
  const hearts = particles.filter(p => p.type === 'heart');
  if (Math.random() < (isLetterScreen ? 0.05 : 0.015) && hearts.length < maxHearts) {
    particles.push(new Particle(Math.random() * canvas.width, canvas.height + 20, 'heart'));
  }
}

// Sparkles trail on mouse movement
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  
  if (Math.random() < 0.4) {
    particles.push(new Particle(mouse.x, mouse.y, 'sparkle'));
  }
});

// Sparkles on touch movement
window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    
    if (Math.random() < 0.4) {
      particles.push(new Particle(mouse.x, mouse.y, 'sparkle'));
    }
  }
});

// Particle system loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  handleParticles();
  requestAnimationFrame(animate);
}
animate();


/* ==========================================
   SCREENS & TIMERS LOGIC
   ========================================== */

function showScreen(screenId) {
  const currentActive = document.querySelector('.screen-section.active');
  if (currentActive) {
    currentActive.classList.remove('active');
    currentActive.style.display = 'none';
  }
  
  const targetScreen = document.getElementById(screenId);
  targetScreen.style.display = 'flex';
  
  // Force reflow
  void targetScreen.offsetWidth;
  
  targetScreen.classList.add('active');
}

function updateCountdown() {
  const now = new Date();
  const timeDifference = TARGET_DATE - now;

  // Check URL query parameters for bypass preview
  const urlParams = new URLSearchParams(window.location.search);
  const isPreview = urlParams.get('preview') === 'true' || window.location.hash === '#preview';

  if ((timeDifference <= 0 || isPreview) && !isUnlocked) {
    isUnlocked = true;
    clearInterval(countdownTimer);
    showScreen('envelope-screen');
    return;
  }

  // Calculate times
  const d = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
  const h = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((timeDifference % (1000 * 60)) / 1000);

  // Update elements
  document.getElementById('days').innerText = String(d).padStart(2, '0');
  document.getElementById('hours').innerText = String(h).padStart(2, '0');
  document.getElementById('minutes').innerText = String(m).padStart(2, '0');
  document.getElementById('seconds').innerText = String(s).padStart(2, '0');
}

// Initial update and set interval
const countdownTimer = setInterval(updateCountdown, 1000);
updateCountdown();


/* ==========================================
   INTERACTION TRIGGERS
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Envelope Open trigger
  const envelope = document.getElementById('envelope');
  if (envelope) {
    envelope.addEventListener('click', () => {
      if (envelope.classList.contains('open')) return;
      
      // 1. Break wax seal & trigger chimes
      envelope.classList.add('open');
      playMagicalChimes();
      
      // Trigger music autoplay safely on user interaction
      if (!isMusicPlaying) {
        startMusic();
      }

      // 2. Generate a fountain of magical sparkles and hearts
      const rect = envelope.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      for (let i = 0; i < 50; i++) {
        particles.push(new Particle(centerX, centerY, 'sparkle'));
        if (i % 2 === 0) particles.push(new Particle(centerX, centerY, 'heart'));
      }

      // 3. Transition to the full parchment letter screen
      setTimeout(() => {
        showScreen('letter-screen');
      }, 1600);
    });
  }

  // Panda Shower button trigger
  const pandaBtn = document.getElementById('panda-shower-btn');
  if (pandaBtn) {
    pandaBtn.addEventListener('click', () => {
      const x = window.innerWidth / 2;
      const y = window.innerHeight * 0.7;
      
      // Shower pandas and hearts
      for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, 'panda'));
      }
      for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, 'heart'));
      }
    });
  }

  // Cast Lumos button trigger (shower of gold sparkles)
  const sparkleBtn = document.getElementById('magic-sparkle-btn');
  if (sparkleBtn) {
    sparkleBtn.addEventListener('click', () => {
      const x = window.innerWidth / 2;
      const y = window.innerHeight / 2;
      
      playMagicalChimes();
      
      for (let i = 0; i < 50; i++) {
        particles.push(new Particle(x, y, 'sparkle'));
      }
    });
  }

  // Music toggle button
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      toggleMusic();
    });
  }
});
