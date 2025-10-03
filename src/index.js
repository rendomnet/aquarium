import * as THREE from "three";
import { GUI } from "lil-gui";
import fishVertexShader from "./shaders/fish.vert.glsl?raw";
import fishFragmentShader from "./shaders/fish.frag.glsl?raw";
import floorVertexShader from "./shaders/floor.vert.glsl?raw";
import floorFragmentShader from "./shaders/floor.frag.glsl?raw";
import bubbleVertexShader from "./shaders/bubble.vert.glsl?raw";
import bubbleFragmentShader from "./shaders/bubble.frag.glsl?raw";

// ========== AQUARIUM CONFIGURATION ==========
// Adjust these values to customize the aquarium appearance and behavior
const CONFIG = {
  // Caustics settings (light ripples from water surface on fish)
  caustics: {
    fishIntensity: 0.25,          // Caustics brightness on fish (0.0 = none, 0.5 = strong)
    fishBaseLight: 0.85,          // Base lighting on fish (0.8 = darker, 1.0 = no darkening)
    scale: 0.15,                  // Caustics pattern scale on fish (smaller = tighter pattern)
    driftSpeed: 0.7,              // Caustics animation speed (1.0 = normal, 0.5 = slower)
    distortionAmount: 0.05,       // Caustics wave distortion amount (0 = no distortion, 0.05 = strong)
  },
  
  // Fish animation settings
  animation: {
    tailDragStrength: 0.3,        // How much tail lags when turning (0.0-1.0)
    speedResponseMin: 0.6,        // Minimum animation speed when stationary
    speedResponseMax: 1.8,        // Maximum animation speed when swimming fast
    amplitudeMin: 0.7,            // Minimum tail amplitude
    amplitudeMax: 1.6,            // Maximum tail amplitude
    smoothingSpeed: 0.85,         // Speed smoothing (0.0-1.0, higher = smoother)
    smoothingTurn: 0.7,           // Turn smoothing (0.0-1.0, higher = smoother)
  },
  
  // Visual settings
  scene: {
    fogColor: 0x0b2233,           // Underwater fog color (affects fish at distance)
    fogDensity: 0.055,            // Underwater fog density
    ambientLight: 0.55,           // Ambient light intensity
    directionalLight: 0.7,        // Directional light intensity
    depthBlur: 2.0,               // Depth-based blur intensity (0 = no blur, 5 = strong blur)
    maxBlur: 0.5,                 // Maximum blur for fish at depthRange[0] (far end)
  },
  
  // Fish movement bounds
  movement: {
    depthRange: [0, 2],          // Z-axis range [min, max] for fish depth (distance from camera)
  },
  
  // Floor settings
  floor: {
    positionX: 0,                // Horizontal position (0 = center)
    positionY: 0.0,              // Vertical position from screen bottom (0 = bottom edge, 1 = one unit up)
    waveIntensity: 0,            // Wave distortion intensity (0 = flat, 1 = normal, 2 = strong)
    waveFrequency: 0.0,          // Wave frequency (higher = shorter/tighter waves, lower = longer waves)
    tintAmount: 0.2,             // How much to tint the floor (0 = no tint, 1 = full tint)
    tintColor: 0x0b2233,         // Color to tint the floor with (matches scene fog color)
  },
  
  // Bubble system settings
  bubbles: {
    count: 40,                   // Number of bubbles
    emitterX: 85,                // Horizontal position (0-100%, 0=left, 100=right)
    emitterY: 10,                 // Vertical position (0-100%, 0=bottom, 100=top)
    emitterWidth: 0.15,          // Width of emitter (spread of bubbles)
    depthRange: [-0.5, 0],      // Z-depth range [min, max] for bubbles
  }
};

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.scene.fogColor, CONFIG.scene.fogDensity);

const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  200
);
camera.position.set(0, 0.5, 10);
camera.lookAt(0, 0.5, 0);

// Calculate visible screen bounds at camera's lookAt distance
let vFOV = THREE.MathUtils.degToRad(camera.fov);
let distance = 10; // Distance from camera to scene center (camera.position.z)
let visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
let visibleWidth = visibleHeight * camera.aspect;
let screenBottom = camera.position.y - visibleHeight / 2; // Bottom edge of visible screen
let screenTop = camera.position.y + visibleHeight / 2;    // Top edge of visible screen

console.log("Screen bounds - Bottom:", screenBottom, "Top:", screenTop, "Height:", visibleHeight);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x79a8ff, CONFIG.scene.ambientLight));
const key = new THREE.DirectionalLight(0x9ad1ff, CONFIG.scene.directionalLight);
key.position.set(6, 12, 8);
scene.add(key);

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const BASE_URL = import.meta.env.BASE_URL;
const causticsTex = loader.load(BASE_URL + "images/caustics.jpg");
causticsTex.wrapS = causticsTex.wrapT = THREE.RepeatWrapping;
causticsTex.repeat.set(6, 6);

const bubbleTex = loader.load(BASE_URL + "images/bubble.png");
const floorTex = loader.load(
  BASE_URL + "images/floor1.webp",
  (texture) => {
    console.log("Floor texture loaded:", texture.image.width, "x", texture.image.height);
    // For billboard sprite, just use the image once (no tiling)
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
    
    // Resize floor geometry to match image aspect ratio
    const imgAspect = texture.image.width / texture.image.height;
    const desiredWidth = visibleWidth; // Always match screen width
    const desiredHeight = desiredWidth / imgAspect; // Maintain aspect ratio
    
    // Update floor geometry with segments for wave deformation
    floorGeo.dispose(); // Clean up old geometry
    floorGeo = new THREE.PlaneGeometry(desiredWidth, desiredHeight, 32, 16); // Keep segments
    floor.geometry = floorGeo;
    
    // Update floor position (align bottom edge to screen bottom + offset)
    const floorBottomY = screenBottom + CONFIG.floor.positionY;
    floor.position.set(CONFIG.floor.positionX, floorBottomY + desiredHeight / 2, 0); // Always at Z=0
    
    console.log("Floor resized to:", desiredWidth, "x", desiredHeight, "aspect:", imgAspect);
    console.log("Floor bottom edge at Y:", floorBottomY, "(screen bottom:", screenBottom, "+ offset:", CONFIG.floor.positionY, ")");
  },
  undefined,
  (error) => {
    console.error("Error loading floor texture:", error);
  }
);
// No wrapping needed for single sprite
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;

// ---------- fish shader (plane + sine tail) ----------
const FISH_SEG_X = 64,
  FISH_SEG_Y = 12;
const fishGeo = new THREE.PlaneGeometry(2.0, 0.8, FISH_SEG_X, FISH_SEG_Y);

// ---------- floor (billboard sprite) ----------
// Will be resized based on actual image aspect ratio
// Use more segments for smooth wave deformation
let floorGeo = new THREE.PlaneGeometry(20, 5, 32, 16); // 32x16 segments for waves
const floorMat = new THREE.ShaderMaterial({
  uniforms: {
    uFloorTex: { value: floorTex },
    uCaustics: { value: causticsTex },
    uTime: { value: 0 },
    uCausticsScale: { value: CONFIG.caustics.scale },
    uCausticsDrift: { value: CONFIG.caustics.driftSpeed },
    uCausticsIntensity: { value: 0.3 }, // Subtle caustics on floor
    uCausticsDistortion: { value: CONFIG.caustics.distortionAmount },
    uWaveIntensity: { value: CONFIG.floor.waveIntensity },
    uWaveFrequency: { value: CONFIG.floor.waveFrequency },
    uTintAmount: { value: CONFIG.floor.tintAmount },
    uTintColor: { value: new THREE.Color(CONFIG.floor.tintColor) },
  },
  vertexShader: floorVertexShader,
  fragmentShader: floorFragmentShader,
  transparent: true,  // Enable transparency for WebP alpha
  depthWrite: false,  // Don't write to depth buffer for transparency
  side: THREE.DoubleSide,
});

const floor = new THREE.Mesh(floorGeo, floorMat);
// Initial position (will be updated when texture loads to align bottom edge)
floor.position.set(CONFIG.floor.positionX, CONFIG.floor.positionY, 0); // Always at Z=0
// No rotation - it's a billboard facing the camera
scene.add(floor);

// ---------- school of fish ----------
const UI = {
  speed: document.getElementById("speed"),
  amp: document.getElementById("amp"),
};

// Helper to define anatomical parts with named parameters
// movementResponse: 'propulsion' | 'passive' | 'stabilizer' | 'none'
function definePart({ 
  cells, 
  flexibility, 
  amplitude, 
  frequency, 
  speed, 
  phaseOffset = 0,
  movementResponse = 'none'  // How this part responds to swimming speed
}) {
  return { cells, flexibility, amplitude, frequency, speed, phaseOffset, movementResponse };
}

// Fish species definitions
const FISH_SPECIES = {
  angelfish: {
    texture: BASE_URL + 'images/fish/angelfish.webp',
    size: { width: 2.2, height: 2.2 },
    baseSpeed: 0.05,
    wanderRange: 1.5,
    preferredDepth: [0.4, 0.7],  // Mid-tank (0=bottom, 1=top)
    schooling: false,
    gridProportions: {
      rows: [0.35, 0.30, 0.35],        // Tall fins top/bottom, narrow body center
      cols: [0.30, 0.15, 0.40, 0.15]   // TailFin, TailBase, Body, Head
    },
    anatomy: {
      tailFin: definePart({
        cells: [[2,1], [3,1]],  // Col 1: Flowing tail fin
        flexibility: 1.2,
        amplitude: 0.28,
        frequency: 5.0,
        speed: 0.8,
        phaseOffset: 0.5,
        movementResponse: 'passive'     // Flows passively, minimal speed response
      }),
      tailBase: definePart({
        cells: [[2,2]],                 // Col 2: Tail peduncle (muscular base)
        flexibility: 0.4,
        amplitude: 0.12,
        frequency: 5.5,
        speed: 0.75,
        movementResponse: 'propulsion'  // Drives swimming, strong speed response
      }),
      bodyCore: definePart({
        cells: [[2,3]],                 // Col 3: Body spine (rigid)
        flexibility: 0.01,
        amplitude: 0.02,
        frequency: 6.0,
        speed: 0.7,
        movementResponse: 'none'        // Rigid, no movement response
      }),
      dorsalFin: definePart({
        cells: [[1,2], [1,3], [1,4]],  // Top fin across tail base, body, head
        flexibility: 0.7,
        amplitude: 0.18,
        frequency: 6.0,
        speed: 0.7,
        phaseOffset: 0.0,
        // movementResponse: 'passive'  // Responds to turning only
      }),
      ventralFin: definePart({
        cells: [[3,2], [3,3], [3,4]],  // Bottom fin across tail base, body, head
        flexibility: 0.7,
        amplitude: 0.18,
        frequency: 6.0,
        speed: 0.7,
        phaseOffset: Math.PI,
        movementResponse: 'passive'  // Responds to turning only
      }),
      headCore: definePart({
        cells: [[2,4]],                 // Col 4: Head (completely rigid)
        flexibility: 0.0,
        amplitude: 0.0,
        frequency: 6.0,
        speed: 0.7
      })
    }
  },
  discus: {
    texture: BASE_URL + 'images/fish/discus.webp',
    size: { width: 1.8, height: 1.8 },
    baseSpeed: 0.1,
    wanderRange: 2.8,
    preferredDepth: [0.2, 1.0],
    schooling: false,
    gridProportions: {
      rows: [0.25, 0.50, 0.25],
      cols: [0.15, 0.10, 0.55, 0.20]  // TailFin, TailBase, Body (large disc), Head
    },
    anatomy: {
      tailFin: definePart({
        cells: [[1,1], [2,1], [3,1]],
        flexibility: 0.9,
        amplitude: 0.16,
        frequency: 5.0,
        speed: 0.65,
        movementResponse: 'passive'
      }),
      tailBase: definePart({
        cells: [[2,2]],
        flexibility: 0.3,
        amplitude: 0.08,
        frequency: 5.0,
        speed: 0.65,
        movementResponse: 'passive'
      }),
      dorsalFin: definePart({
        cells: [[1,1], [1,2], [1,3], [1,4]],  // Top fin across all
        flexibility: 0.6,
        amplitude: 0.16,
        frequency: 5.0,
        speed: 0.65,
        phaseOffset: 0.0,
        movementResponse: 'propulsion'
      }),
      ventralFin: definePart({
        cells: [[3,1], [3,2], [3,3], [3,4]],  // Bottom fin across all
        flexibility: 0.6,
        amplitude: 0.16,
        frequency: 5.0,
        speed: 0.65,
        phaseOffset: Math.PI,
        movementResponse: 'propulsion'
      }),
      bodyCore: definePart({
        cells: [[2,3]],  // Large disc body
        flexibility: 0.01,
        amplitude: 0.04,
        frequency: 5.0,
        speed: 0.65
      }),
      headCore: definePart({
        cells: [[2,4]],
        flexibility: 0.0,
        amplitude: 0.0,
        frequency: 5.0,
        speed: 0.65
      })
    }
  },
  gourami: {
    texture: BASE_URL + 'images/fish/gourami.webp',
    size: { width: 1.5, height: 0.9 },
    baseSpeed: 0.45,
    wanderRange: 3.0,
    preferredDepth: [0.5, 0.8],  // Upper-mid tank
    schooling: false,
    gridProportions: {
      rows: [0.25, 0.50, 0.25],
      cols: [0.20, 0.15, 0.40, 0.25]  // TailFin, TailBase, Body, Head
    },
    anatomy: {
      tailFin: definePart({ cells: [[1,1], [2,1], [3,1]], 
        flexibility: 1.0, amplitude: 0.26, frequency: 6.5, speed: 0.8, 
        phaseOffset: 0.3,
        movementResponse: 'propulsion'
      }),
      tailBase: definePart({ cells: [[2,2]], flexibility: 0.3, amplitude: 0.12, frequency: 6.5, speed: 0.75 }),
      bodyCore: definePart({ cells: [[2,3]], flexibility: 0.05, amplitude: 0.08, frequency: 7.0, speed: 0.75 }),
      dorsalFin: definePart({ cells: [[1,1], [1,2], [1,3]], flexibility: 0.3, amplitude: 0.20, frequency: 7.0, speed: 0.75, phaseOffset: 0.0 }),
      ventralFin: definePart({ cells: [[3,1], [3,2], [3,3]], flexibility: 0.8, amplitude: 0.40, frequency: 5.0, speed: 0.75, phaseOffset: Math.PI }),
      headCore: definePart({ cells: [[2,4]], flexibility: 0.0, amplitude: 0.0, frequency: 7.0, speed: 0.75 })
    }
  },
  swordtail: {
    texture: BASE_URL + 'images/fish/swordtail.webp',
    size: { width: 2, height: 0.6 },
    baseSpeed: 0.25,
    wanderRange: 4.0,
    preferredDepth: [0.3, 0.6],  // Mid tank
    schooling: true,
    gridProportions: {
      rows: [0.30, 0.40, 0.30],
      cols: [0.25, 0.15, 0.35, 0.25]  // TailFin (sword!), TailBase, Body, Head
    },
    anatomy: {
      tailFin: definePart({ cells: [[1,1], [2,1], [3,1]], 
        flexibility: 1.8, 
        amplitude: 0.28, 
        frequency: 4.0, 
        speed: 0.95, 
        phaseOffset: 0.4,
        movementResponse: 'passive'
      }),  // Lower frequency for smooth sword movement
      tailBase: definePart({ cells: [[2,2]], 
        flexibility: 0.5, 
        amplitude: 0.15,
        frequency: 5.0, 
        speed: 0.90,
        movementResponse: 'propulsion'
      }),
      bodyCore: definePart({ cells: [[2,3]], flexibility: 0.05, amplitude: 0.08, frequency: 5.5, speed: 0.90 }),
      dorsalFin: definePart({ cells: [[1,2], [1,3]], flexibility: 0.8, amplitude: 0.20, frequency: 5.5, speed: 0.90, phaseOffset: 0.0 }),
      ventralFin: definePart({ cells: [[3,2], [3,3]], flexibility: 0.8, amplitude: 0.20, frequency: 5.5, speed: 0.90, phaseOffset: Math.PI }),
      headCore: definePart({ cells: [[2,4]], flexibility: 0.0, amplitude: 0.0, frequency: 5.5, speed: 0.90 })
    }
  },
  platy: {
    texture: BASE_URL + 'images/fish/platy.webp',
    size: { width: 1, height: 0.5 },
    baseSpeed: 0.22,
    wanderRange: 3.5,
    preferredDepth: [0.1, 0.2],  // Lower-mid tank
    schooling: true,
    gridProportions: {
      rows: [0.20, 0.50, 0.30],
      cols: [0.15, 0.10, 0.45, 0.20]  // TailFin, TailBase, Body, Head
    },
    anatomy: {
      tailFin: definePart({ 
        cells: [[1,1], [2,1], [3,1]], 
        flexibility: 1.1, 
        amplitude: 0.24, 
        frequency: 6.5, 
        speed: 0.85, 
        phaseOffset: 0.3, 
        movementResponse: 'propulsion' 
      }),
      tailBase: definePart({ 
        cells: [[2,2]], flexibility: 0.4, amplitude: 0.12, 
        frequency: 6.5, speed: 0.80 }),
      headCore: definePart({ 
        cells: [[2,4]], 
        flexibility: 0.0, 
        amplitude: 0.0, frequency: 7.0, 
        speed: 0.80 
      }),
      bodyCore: definePart({ 
        cells: [[2,3]], 
        flexibility: 0.2, 
        amplitude: 0.08, frequency: 7.0, 
        speed: 0.80 
      }),
      dorsalFin: definePart({ 
        cells: [[1,2], [1,3]], 
        flexibility: 0.8, 
        amplitude: 0.18, 
        frequency: 7.0, 
        speed: 0.80, 
        movementResponse: 'passive',
        phaseOffset: 0.0
      }),
      ventralFin: definePart({ cells: [[3,2], [3,3]], flexibility: 0.8, 
        amplitude: 0.18, 
        frequency: 7.0, 
        speed: 0.80, 
        phaseOffset: Math.PI,
        movementResponse: 'passive'
      }),
      
    }
  },
  guppy: {
    texture: BASE_URL + 'images/fish/guppy.webp',
    size: { width: 1, height: 0.4 },
    baseSpeed: 0.4,
    wanderRange: 4.5,
    preferredDepth: [0.6, 0.9],  // Upper tank (surface swimmers)
    schooling: true,
    gridProportions: {
      rows: [0.20, 0.50, 0.30],
      cols: [0.30, 0.10, 0.40, 0.15]  // FancyTail, TailBase, Body, Head
    },
    anatomy: {
      fancyTail: definePart({
        cells: [[1,1], [2,1], [3,1]],  // Big fancy tail
        flexibility: 1.2,
        amplitude: 0.15,
        frequency: 5.5,
        speed: 1.0,
        phaseOffset: 0.5,
        movementResponse: 'passive'
      }),
      tailBase: definePart({
        cells: [[2,2]],                 // Small tail base
        flexibility: 0.3,
        amplitude: 0.08,
        frequency: 6.0,
        speed: 1.0,
        movementResponse: 'propulsion'
      }),
      bodyCore: definePart({
        cells: [[2,3]],                 // Body center
        flexibility: 0.08,
        amplitude: 0.10,
        frequency: 6.0,
        speed: 1.0
      }),
      dorsalFin: definePart({
        cells: [[1,3]],                 // Small dorsal on body
        flexibility: 0.5,
        amplitude: 0.18,
        frequency: 6.0,
        speed: 1.0,
        phaseOffset: 0.0
      }),
      ventralFin: definePart({
        cells: [[3,3]],                 // Small ventral on body
        flexibility: 0.7,
        amplitude: 0.18,
        frequency: 6.0,
        speed: 1.0,
        phaseOffset: Math.PI
      }),
      headCore: definePart({
        cells: [[2,4]],                 // Tiny head
        flexibility: 0.0,
        amplitude: 0.0,
        frequency: 6.0,
        speed: 1.0
      })
    }
  }
};

// Tank population
const POPULATION = [
  'angelfish', 'discus', 'gourami',  'swordtail',  'platy', 'guppy'  ];

// Load all fish textures
const fishTextures = {};
Object.keys(FISH_SPECIES).forEach(species => {
  fishTextures[species] = loader.load(FISH_SPECIES[species].texture);
});

const fishes = [];
const fishMeshes = {};

const populationBySpecies = POPULATION.reduce((acc, speciesName) => {
  if (!acc[speciesName]) {
    acc[speciesName] = [];
  }
  acc[speciesName].push(speciesName);
  return acc;
}, {});

Object.keys(populationBySpecies).forEach(speciesName => {
  const species = FISH_SPECIES[speciesName];
  const count = populationBySpecies[speciesName].length;

  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTex: { value: fishTextures[speciesName] },
      uCaustics: { value: causticsTex },
      uCausticsScale: { value: CONFIG.caustics.scale },
      uCausticsDrift: { value: CONFIG.caustics.driftSpeed },
      uCausticsIntensity: { value: CONFIG.caustics.fishIntensity },
      uCausticsBase: { value: CONFIG.caustics.fishBaseLight },
      uFogColor: { value: new THREE.Color(CONFIG.scene.fogColor) },
      uFogDensity: { value: CONFIG.scene.fogDensity },
      uDepthBlur: { value: CONFIG.scene.depthBlur },
      uMaxBlur: { value: CONFIG.scene.maxBlur },
      uDepthMin: { value: CONFIG.movement.depthRange[0] },
      uDepthMax: { value: CONFIG.movement.depthRange[1] },
      uTime: { value: 0 },
      uSwimSpeed: { value: 0.0 },
      uTurnAmount: { value: 0.0 },
      uDragStrength: { value: CONFIG.animation.tailDragStrength },
      uSpeedMin: { value: CONFIG.animation.speedResponseMin },
      uSpeedMax: { value: CONFIG.animation.speedResponseMax },
      uAmpMin: { value: CONFIG.animation.amplitudeMin },
      uAmpMax: { value: CONFIG.animation.amplitudeMax },
      uPartCount: { value: 0 },
      uParts: { value: new Array(6).fill(0).map(() => [0,0,0,0,0,0,0,0,0,0]) },
      uGridProps: { value: [0.33, 0.33, 0.34, 0.25, 0.25, 0.25, 0.25] },
    },
    vertexShader: fishVertexShader,
    fragmentShader: fishFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const parts = Object.values(species.anatomy);
  const partsArray = [];
  
  parts.forEach(part => {
    const rows = part.cells.map(c => c[0]);
    const cols = part.cells.map(c => c[1]);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    
    const responseMap = { 'none': 0, 'passive': 1, 'propulsion': 2, 'stabilizer': 3 };
    const responseCode = responseMap[part.movementResponse] || 0;
    
    partsArray.push(
      minRow, maxRow, minCol, maxCol,
      part.flexibility, part.amplitude, part.frequency, part.speed, part.phaseOffset,
      responseCode
    );
  });
  
  while (partsArray.length < 60) partsArray.push(0);
  
  mat.uniforms.uPartCount.value = parts.length;
  mat.uniforms.uParts.value = partsArray;
  
  const gridProps = species.gridProportions;
  mat.uniforms.uGridProps.value = [
    gridProps.rows[0], gridProps.rows[1], gridProps.rows[2],
    gridProps.cols[0], gridProps.cols[1], gridProps.cols[2], gridProps.cols[3]
  ];

  const mesh = new THREE.InstancedMesh(fishGeo, mat, count);
  scene.add(mesh);
  fishMeshes[speciesName] = mesh;

  for (let i = 0; i < count; i++) {
    const facingDir = Math.random() < 0.5 ? 1 : -1;
    const startX = (Math.random() - 0.5) * 12;
    const height = -0.5 + Math.random() * 2.5;
    const depthMin = CONFIG.movement.depthRange[0];
    const depthMax = CONFIG.movement.depthRange[1];
    const startZ = depthMin + Math.random() * (depthMax - depthMin);
    
    const baseScaleX = species.size.width / 2.0;
    const baseScaleY = species.size.height / 0.8;

    const fishData = {
      species: speciesName,
      mesh: mesh,
      instanceId: i,
      baseX: startX,
      baseZ: startZ,
      baseY: height,
      wanderSpeed: species.baseSpeed * (0.8 + Math.random() * 0.4),
      wanderRange: species.wanderRange,
      phase: Math.random() * Math.PI * 2,
      facingDir: facingDir,
      baseScaleX: baseScaleX,
      baseScaleY: baseScaleY,
      preferredDepth: species.preferredDepth,
      targetDepth: height,
      depthChangeTime: 0,
      depthChangeDuration: 3 + Math.random() * 4,
      targetZ: startZ,
      zChangeTime: 0,
      zChangeDuration: 4 + Math.random() * 5,
      position: new THREE.Vector3(startX, height, startZ),
      material: mat,
    };
    fishes.push(fishData);
  }
});


// ---------- bubble stream ----------
let screenLeft = -visibleWidth / 2;
let BUBBLE_SOURCE_X = screenLeft + (visibleWidth * CONFIG.bubbles.emitterX / 100);
let BUBBLE_SOURCE_Y = screenBottom + (visibleHeight * CONFIG.bubbles.emitterY / 100);

const bubbleGeo = new THREE.PlaneGeometry(0.1, 0.1);
const bubbleMat = new THREE.ShaderMaterial({
  uniforms: {
    uBubbleTex: { value: bubbleTex },
    uTime: { value: 0 },
    uScreenTop: { value: screenTop },
    uEmitterY: { value: BUBBLE_SOURCE_Y },
  },
  vertexShader: bubbleVertexShader,
  fragmentShader: bubbleFragmentShader,
  transparent: true,
  depthWrite: false,
});

const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, CONFIG.bubbles.count);
scene.add(bubbles);

const instancePositions = new Float32Array(CONFIG.bubbles.count * 3);
const instanceScales = new Float32Array(CONFIG.bubbles.count);
const instanceRiseSpeeds = new Float32Array(CONFIG.bubbles.count);
const instanceWobbleSpeeds = new Float32Array(CONFIG.bubbles.count);
const instanceWobbleAmounts = new Float32Array(CONFIG.bubbles.count);
const instancePhases = new Float32Array(CONFIG.bubbles.count);
const instanceStartXs = new Float32Array(CONFIG.bubbles.count);

for (let i = 0; i < CONFIG.bubbles.count; i++) {
  const depthMin = CONFIG.bubbles.depthRange[0];
  const depthMax = CONFIG.bubbles.depthRange[1];
  const z = depthMin + Math.random() * (depthMax - depthMin);
  instancePositions.set([0, 0, z], i * 3);

  instanceScales[i] = 0.05 + Math.random() * 0.08;
  instanceRiseSpeeds[i] = 0.8 + Math.random() * 0.6;
  instanceWobbleSpeeds[i] = 2 + Math.random() * 3;
  instanceWobbleAmounts[i] = 0.05 + Math.random() * 0.08;
  instancePhases[i] = Math.random() * Math.PI * 2;
  instanceStartXs[i] = BUBBLE_SOURCE_X + (Math.random() - 0.5) * CONFIG.bubbles.emitterWidth;
}

bubbles.geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositions, 3));
bubbles.geometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(instanceScales, 1));
bubbles.geometry.setAttribute('instanceRiseSpeed', new THREE.InstancedBufferAttribute(instanceRiseSpeeds, 1));
bubbles.geometry.setAttribute('instanceWobbleSpeed', new THREE.InstancedBufferAttribute(instanceWobbleSpeeds, 1));
bubbles.geometry.setAttribute('instanceWobbleAmount', new THREE.InstancedBufferAttribute(instanceWobbleAmounts, 1));
bubbles.geometry.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(instancePhases, 1));
bubbles.geometry.setAttribute('instanceStartX', new THREE.InstancedBufferAttribute(instanceStartXs, 1));


// ---------- animate ----------
const clock = new THREE.Clock();
const matrix = new THREE.Matrix4();
function tick() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // caustics drift
  causticsTex.offset.x = (t * 0.03) % 1;
  causticsTex.offset.y = (t * 0.018) % 1;

  // update floor time
  floorMat.uniforms.uTime.value = t;

  // update bubble time
  bubbleMat.uniforms.uTime.value = t;

  // gentle aquarium swimming
  fishes.forEach((brain, i) => {
    // Check if it's time to change Y depth target
    if (t - brain.depthChangeTime > brain.depthChangeDuration) {
      brain.depthChangeTime = t;
      brain.depthChangeDuration = 3 + Math.random() * 4;
      const minDepth = brain.preferredDepth[0];
      const maxDepth = brain.preferredDepth[1];
      const depthRange = maxDepth - minDepth;
      const normalizedDepth = minDepth + Math.random() * depthRange;
      brain.targetDepth = -2.0 + normalizedDepth * 4.8;
    }
    
    if (t - brain.zChangeTime > brain.zChangeDuration) {
      brain.zChangeTime = t;
      brain.zChangeDuration = 4 + Math.random() * 5;
      const depthMin = CONFIG.movement.depthRange[0];
      const depthMax = CONFIG.movement.depthRange[1];
      brain.targetZ = depthMin + Math.random() * (depthMax - depthMin);
    }
    
    brain.baseY += (brain.targetDepth - brain.baseY) * 0.3 * dt;
    brain.baseZ += (brain.targetZ - brain.baseZ) * 0.2 * dt;
    
    const prevX = brain.position.x;
    const prevY = brain.position.y;
    
    brain.position.x += brain.facingDir * brain.wanderSpeed * 2.0 * dt;
    
    const wanderZ = Math.cos(t * brain.wanderSpeed * 0.7 + brain.phase) * 0.2;
    const wanderY = Math.sin(t * brain.wanderSpeed * 0.5 + brain.phase) * 0.3;
    
    brain.position.z = brain.baseZ + wanderZ;
    brain.position.y = brain.baseY + wanderY;

    if (brain.position.x > 12) { 
      brain.facingDir = -1;
      brain.position.x = 12;
    }
    if (brain.position.x < -12) { 
      brain.facingDir = 1;
      brain.position.x = -12;
    }
    
    const zMin = CONFIG.movement.depthRange[0] - 0.5;
    const zMax = CONFIG.movement.depthRange[1] + 0.5;
    brain.position.z = Math.max(zMin, Math.min(zMax, brain.position.z));
    
    brain.position.y = Math.max(-2.0, Math.min(2.8, brain.position.y));

    const depthMin = CONFIG.movement.depthRange[0];
    const depthMax = CONFIG.movement.depthRange[1];
    const depthRange = depthMax - depthMin;
    const depthScale = 0.85 + (brain.position.z - depthMin) / depthRange * 0.15;
    const finalScaleX = brain.baseScaleX * depthScale;
    const finalScaleY = brain.baseScaleY * depthScale;
    
    const dx = brain.position.x - prevX;
    const dy = brain.position.y - prevY;
    const dz = brain.position.z - (brain.prevZ || brain.position.z);
    
    const verticalSpeed = dy / dt;
    const horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / dt;
    
    brain.smoothPitch = brain.smoothPitch || 0;
    
    let targetPitch = 0;
    
    const minSpeed = 0.05;
    const totalSpeed = Math.sqrt(verticalSpeed * verticalSpeed + horizontalSpeed * horizontalSpeed);
    
    if (totalSpeed > minSpeed) {
      targetPitch = Math.atan2(verticalSpeed, horizontalSpeed) * 0.5;
      
      if (brain.facingDir < 0) {
        targetPitch = -targetPitch;
      }
      
      targetPitch = Math.max(-0.3, Math.min(0.3, targetPitch));
    }
    
    brain.smoothPitch = brain.smoothPitch * 0.92 + targetPitch * 0.08;
    
    const swimSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
    brain.prevZ = brain.position.z;
    
    const normalizedSpeed = swimSpeed / (brain.wanderSpeed * 2.0);
    
    brain.smoothSpeed = brain.smoothSpeed || 0;
    brain.smoothSpeed = brain.smoothSpeed * CONFIG.animation.smoothingSpeed + normalizedSpeed * (1.0 - CONFIG.animation.smoothingSpeed);
    
    const currentDir = Math.atan2(dy, dx);
    brain.prevDir = brain.prevDir || currentDir;
    let dirChange = currentDir - brain.prevDir;
    
    while (dirChange > Math.PI) dirChange -= Math.PI * 2;
    while (dirChange < -Math.PI) dirChange += Math.PI * 2;
    
    brain.smoothTurn = brain.smoothTurn || 0;
    brain.smoothTurn = brain.smoothTurn * CONFIG.animation.smoothingTurn + dirChange * (1.0 - CONFIG.animation.smoothingTurn);
    brain.prevDir = currentDir;
    
    matrix.compose(
      brain.position,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, brain.smoothPitch)),
      new THREE.Vector3(finalScaleX * brain.facingDir, finalScaleY, 1)
    );
    brain.mesh.setMatrixAt(brain.instanceId, matrix);

    brain.material.uniforms.uTime.value = t;
    brain.material.uniforms.uSwimSpeed.value = brain.smoothSpeed;
    brain.material.uniforms.uTurnAmount.value = brain.smoothTurn;
  });

  Object.values(fishMeshes).forEach(mesh => {
    mesh.instanceMatrix.needsUpdate = true;
  });

  // Render the scene
  renderer.render(scene, camera);

  requestAnimationFrame(tick);
}
tick();

// ---------- resize handler ----------
addEventListener("resize", () => {
  // Update camera
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  
  // Recalculate screen bounds
  vFOV = THREE.MathUtils.degToRad(camera.fov);
  distance = 10;
  visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
  visibleWidth = visibleHeight * camera.aspect;
  screenBottom = camera.position.y - visibleHeight / 2;
  screenTop = camera.position.y + visibleHeight / 2;
  
  // Update floor size and position
  if (floorTex.image) {
    const imgAspect = floorTex.image.width / floorTex.image.height;
    const desiredWidth = visibleWidth;
    const desiredHeight = desiredWidth / imgAspect;
    
    floorGeo.dispose();
    floorGeo = new THREE.PlaneGeometry(desiredWidth, desiredHeight, 32, 16);
    floor.geometry = floorGeo;
    
    const floorBottomY = screenBottom + CONFIG.floor.positionY;
    floor.position.set(CONFIG.floor.positionX, floorBottomY + desiredHeight / 2, 0);
  }
  
  // Update bubble emitter position
  screenLeft = -visibleWidth / 2;
  BUBBLE_SOURCE_X = screenLeft + (visibleWidth * CONFIG.bubbles.emitterX / 100);
  BUBBLE_SOURCE_Y = screenBottom + (visibleHeight * CONFIG.bubbles.emitterY / 100);

  // Update bubble shader uniforms
  bubbleMat.uniforms.uScreenTop.value = screenTop;
  bubbleMat.uniforms.uEmitterY.value = BUBBLE_SOURCE_Y;

  // Update bubble instance start positions
  for (let i = 0; i < CONFIG.bubbles.count; i++) {
    instanceStartXs[i] = BUBBLE_SOURCE_X + (Math.random() - 0.5) * CONFIG.bubbles.emitterWidth;
  }
  bubbles.geometry.attributes.instanceStartX.needsUpdate = true;
  
  console.log("Resized - Screen:", visibleWidth, "x", visibleHeight);
});
