import * as THREE from "three";
import { GUI } from "lil-gui";
import fishVertexShader from "./shaders/fish.vert.glsl?raw";
import fishFragmentShader from "./shaders/fish.frag.glsl?raw";
import floorVertexShader from "./shaders/floor.vert.glsl?raw";
import floorFragmentShader from "./shaders/floor.frag.glsl?raw";

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
    waveIntensity: 0,          // Wave distortion intensity (0 = flat, 1 = normal, 2 = strong)
    waveFrequency: 20.0,         // Wave frequency (higher = shorter/tighter waves, lower = longer waves)
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
const vFOV = THREE.MathUtils.degToRad(camera.fov);
const distance = 10; // Distance from camera to scene center (camera.position.z)
const visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
const visibleWidth = visibleHeight * camera.aspect;
const screenBottom = camera.position.y - visibleHeight / 2; // Bottom edge of visible screen
const screenTop = camera.position.y + visibleHeight / 2;    // Top edge of visible screen

console.log("Screen bounds - Bottom:", screenBottom, "Top:", screenTop, "Height:", visibleHeight);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x79a8ff, CONFIG.scene.ambientLight));
const key = new THREE.DirectionalLight(0x9ad1ff, CONFIG.scene.directionalLight);
key.position.set(6, 12, 8);
scene.add(key);

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const causticsTex = loader.load("/images/caustics.jpg");
causticsTex.wrapS = causticsTex.wrapT = THREE.RepeatWrapping;
causticsTex.repeat.set(6, 6);

const bubbleTex = loader.load("/images/bubble.png");
const floorTex = loader.load(
  "/images/floor1.webp",
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
// Plane starts facing camera (+Z), no rotation needed for proper orientation

const fishMat = new THREE.ShaderMaterial({
  depthWrite: false,
  uniforms: {
    uTex: { value: null },
    uCaustics: { value: causticsTex },  // Caustics texture
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
    uSwimSpeed: { value: 0.0 },  // Fish's actual swimming speed
    uTurnAmount: { value: 0.0 },  // How much the fish is turning (for drag effect)
    uDragStrength: { value: CONFIG.animation.tailDragStrength },
    uSpeedMin: { value: CONFIG.animation.speedResponseMin },
    uSpeedMax: { value: CONFIG.animation.speedResponseMax },
    uAmpMin: { value: CONFIG.animation.amplitudeMin },
    uAmpMax: { value: CONFIG.animation.amplitudeMax },
    // Anatomical part system - up to 6 parts per fish
    uPartCount: { value: 0 },
    // Each part: [minRow, maxRow, minCol, maxCol, flexibility, amplitude, frequency, speed, phaseOffset, movementResponse]
    uParts: { value: new Array(6).fill(0).map(() => [0,0,0,0,0,0,0,0,0,0]) },
    // Grid proportions: [row1, row2, row3, col1, col2, col3, col4]
    uGridProps: { value: [0.33, 0.33, 0.34, 0.25, 0.25, 0.25, 0.25] },
  },
  vertexShader: fishVertexShader,
  fragmentShader: fishFragmentShader,
  transparent: true,
  side: THREE.DoubleSide,
});

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
    texture: '/images/fish/angelfish.png',
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
    texture: '/images/fish/discus.png',
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
    texture: '/images/fish/gourami.png',
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
    texture: '/images/fish/swordtail.png',
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
    texture: '/images/fish/platy.png',
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
    texture: '/images/fish/guppy.png',
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

function createFish(speciesName) {
  const species = FISH_SPECIES[speciesName];
  
  // Use shared geometry, scale the mesh instead
  const mat = fishMat.clone();
  mat.uniforms.uTex.value = fishTextures[speciesName];
  
  // Convert anatomy to shader format
  const parts = Object.values(species.anatomy);
  const partsArray = [];
  
  parts.forEach(part => {
    // Find min/max row and col from cells
    const rows = part.cells.map(c => c[0]);
    const cols = part.cells.map(c => c[1]);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    
    // Encode movementResponse: none=0, passive=1, propulsion=2, stabilizer=3
    const responseMap = { 'none': 0, 'passive': 1, 'propulsion': 2, 'stabilizer': 3 };
    const responseCode = responseMap[part.movementResponse] || 0;
    
    // Pack into array: [minRow, maxRow, minCol, maxCol, flexibility, amplitude, frequency, speed, phaseOffset, movementResponse]
    partsArray.push(
      minRow, maxRow, minCol, maxCol,
      part.flexibility, part.amplitude, part.frequency, part.speed, part.phaseOffset,
      responseCode
    );
  });
  
  // Pad to 60 elements (6 parts × 10 values)
  while (partsArray.length < 60) partsArray.push(0);
  
  mat.uniforms.uPartCount.value = parts.length;
  mat.uniforms.uParts.value = partsArray;
  
  // Set custom grid proportions for this species
  const gridProps = species.gridProportions;
  mat.uniforms.uGridProps.value = [
    gridProps.rows[0], gridProps.rows[1], gridProps.rows[2],
    gridProps.cols[0], gridProps.cols[1], gridProps.cols[2], gridProps.cols[3]
  ];
  
  const m = new THREE.Mesh(fishGeo, mat);
  
  // Random starting direction
  const facingDir = Math.random() < 0.5 ? 1 : -1;

  // Random position across the tank (instant spawn)
  const startX = (Math.random() - 0.5) * 12; // -6 to 6
  const height = -0.5 + Math.random() * 2.5; // -0.5 to 2.0
  const depthMin = CONFIG.movement.depthRange[0];
  const depthMax = CONFIG.movement.depthRange[1];
  const startZ = depthMin + Math.random() * (depthMax - depthMin);
  
  // Size based on species (using scale) - base geometry is 2.0 x 0.8
  const baseScaleX = species.size.width / 2.0;   // Normalize width to base geometry
  const baseScaleY = species.size.height / 0.8;  // Normalize height to base geometry
  
  m.userData = {
    species: speciesName,
    baseX: startX,
    baseZ: startZ,
    baseY: height,
    wanderSpeed: species.baseSpeed * (0.8 + Math.random() * 0.4),
    wanderRange: species.wanderRange,
    phase: Math.random() * Math.PI * 2,
    facingDir: facingDir,
    baseScaleX: baseScaleX,
    baseScaleY: baseScaleY,
    // Vertical movement targets
    preferredDepth: species.preferredDepth, // [min, max] where 0=bottom, 1=top
    targetDepth: height,
    depthChangeTime: 0,
    depthChangeDuration: 3 + Math.random() * 4, // Change depth every 3-7 seconds
    // Z-axis (distance from camera) movement
    targetZ: startZ,
    zChangeTime: 0,
    zChangeDuration: 4 + Math.random() * 5, // Change Z every 4-9 seconds
  };
  
  m.position.set(startX, height, startZ);
  m.visible = true; // Visible immediately
  
  // Set initial scale (will be updated in animation loop)
  const depthRange = depthMax - depthMin;
  const depthScale = 0.85 + (startZ - depthMin) / depthRange * 0.15;  // 0.85 (far) to 1.0 (near)
  m.scale.set(
    baseScaleX * depthScale * facingDir,
    baseScaleY * depthScale,
    1
  );
  
  return m;
}

const fishes = [];
POPULATION.forEach((speciesName) => {
  const f = createFish(speciesName);
  scene.add(f);
  fishes.push(f);
});

// ---------- bubble stream ----------
const bubbles = [];

// Calculate bubble emitter position from screen percentages (will be updated on resize)
let screenLeft = -visibleWidth / 2;
let screenRight = visibleWidth / 2;
let BUBBLE_SOURCE_X = screenLeft + (visibleWidth * CONFIG.bubbles.emitterX / 100);
let BUBBLE_SOURCE_Y = screenBottom + (visibleHeight * CONFIG.bubbles.emitterY / 100);

console.log("Bubble emitter at:", BUBBLE_SOURCE_X, BUBBLE_SOURCE_Y, 
            `(${CONFIG.bubbles.emitterX}%, ${CONFIG.bubbles.emitterY}%)`);

function createBubble() {
  const size = 0.05 + Math.random() * 0.08; // Smaller bubbles: 0.05 to 0.13
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshBasicMaterial({
    map: bubbleTex,
    transparent: true,
    opacity: 0.7 + Math.random() * 0.2, // 0.7 to 0.9
    depthWrite: false,
  });
  
  const bubble = new THREE.Mesh(geometry, material);
  
  // Start position: narrow stream at emitter
  bubble.position.x = BUBBLE_SOURCE_X + (Math.random() - 0.5) * CONFIG.bubbles.emitterWidth;
  bubble.position.y = BUBBLE_SOURCE_Y;
  const depthMin = CONFIG.bubbles.depthRange[0];
  const depthMax = CONFIG.bubbles.depthRange[1];
  bubble.position.z = depthMin + Math.random() * (depthMax - depthMin);
  
  // Bubble properties
  bubble.userData = {
    riseSpeed: 0.8 + Math.random() * 0.6, // Faster: 0.8 to 1.4
    wobbleSpeed: 2 + Math.random() * 3, // Faster wobble
    wobbleAmount: 0.05 + Math.random() * 0.08, // Subtle wobble: 0.05 to 0.13
    phase: Math.random() * Math.PI * 2,
    startX: bubble.position.x,
    startDelay: Math.random() * 2, // Stagger spawning
  };
  
  scene.add(bubble);
  return bubble;
}

// Create initial bubbles
for (let i = 0; i < CONFIG.bubbles.count; i++) {
  const bubble = createBubble();
  // Distribute along the rise path
  bubble.position.y = BUBBLE_SOURCE_Y + Math.random() * 5;
  bubbles.push(bubble);
}

// ---------- animate ----------
const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // caustics drift
  causticsTex.offset.x = (t * 0.03) % 1;
  causticsTex.offset.y = (t * 0.018) % 1;

  // update floor time
  floorMat.uniforms.uTime.value = t;

  // animate bubbles
  bubbles.forEach((bubble) => {
    const data = bubble.userData;
    
    // Rise upward quickly
    bubble.position.y += data.riseSpeed * dt;
    
    // Subtle wobble side to side
    const wobble = Math.sin(t * data.wobbleSpeed + data.phase) * data.wobbleAmount;
    bubble.position.x = data.startX + wobble;
    
    // Slight expansion as bubble rises (buoyancy effect)
    const heightRatio = (bubble.position.y - BUBBLE_SOURCE_Y) / 5;
    const scale = 1 + heightRatio * 0.3; // Grow up to 30% larger
    bubble.scale.set(scale, scale, 1);
    
    // Reset when bubble reaches top of screen
    if (bubble.position.y > screenTop) {
      bubble.position.y = BUBBLE_SOURCE_Y;
      bubble.position.x = BUBBLE_SOURCE_X + (Math.random() - 0.5) * CONFIG.bubbles.emitterWidth;
      const depthMin = CONFIG.bubbles.depthRange[0];
      const depthMax = CONFIG.bubbles.depthRange[1];
      bubble.position.z = depthMin + Math.random() * (depthMax - depthMin);
      data.startX = bubble.position.x;
      bubble.scale.set(1, 1, 1);
    }
  });

  // gentle aquarium swimming
  fishes.forEach((f, i) => {
    const brain = f.userData;
    
    // Check if it's time to change Y depth target
    if (t - brain.depthChangeTime > brain.depthChangeDuration) {
      brain.depthChangeTime = t;
      brain.depthChangeDuration = 3 + Math.random() * 4;
      // Pick a new target depth within species' preferred range
      // preferredDepth is [min, max] where 0=bottom, 1=top
      const minDepth = brain.preferredDepth[0];
      const maxDepth = brain.preferredDepth[1];
      const depthRange = maxDepth - minDepth;
      const normalizedDepth = minDepth + Math.random() * depthRange; // 0-1 range
      
      // Convert to world coordinates: 0 -> -2.0 (bottom), 1 -> 2.8 (top)
      brain.targetDepth = -2.0 + normalizedDepth * 4.8;
    }
    
    // Check if it's time to change Z position (distance from camera)
    if (t - brain.zChangeTime > brain.zChangeDuration) {
      brain.zChangeTime = t;
      brain.zChangeDuration = 4 + Math.random() * 5;
      // Pick new Z target within configured depth range
      const depthMin = CONFIG.movement.depthRange[0];
      const depthMax = CONFIG.movement.depthRange[1];
      brain.targetZ = depthMin + Math.random() * (depthMax - depthMin);
    }
    
    // Smoothly move toward target depth and Z position
    brain.baseY += (brain.targetDepth - brain.baseY) * 0.3 * dt;
    brain.baseZ += (brain.targetZ - brain.baseZ) * 0.2 * dt;  // Slower Z movement
    
    // Swim in current direction (don't turn around on screen)
    const prevX = f.position.x;
    const prevY = f.position.y;
    
    // Move in facing direction
    f.position.x += brain.facingDir * brain.wanderSpeed * 2.0 * dt;
    
    // Add gentle vertical and depth variation (small oscillations)
    const wanderZ = Math.cos(t * brain.wanderSpeed * 0.7 + brain.phase) * 0.2;  // Minimal Z oscillation
    const wanderY = Math.sin(t * brain.wanderSpeed * 0.5 + brain.phase) * 0.3;
    
    f.position.z = brain.baseZ + wanderZ;
    f.position.y = brain.baseY + wanderY;

    // When fish leaves screen, turn around off-screen
    if (f.position.x > 12) { 
      brain.facingDir = -1;  // Turn to face left
      f.position.x = 12;
    }
    if (f.position.x < -12) { 
      brain.facingDir = 1;   // Turn to face right
      f.position.x = -12;
    }
    
    // Keep fish within tank depth bounds (Z axis)
    const zMin = CONFIG.movement.depthRange[0] - 0.5; // Allow small oscillation beyond range
    const zMax = CONFIG.movement.depthRange[1] + 0.5;
    f.position.z = Math.max(zMin, Math.min(zMax, f.position.z));
    
    // Clamp vertical position to tank bounds
    f.position.y = Math.max(-2.0, Math.min(2.8, f.position.y));

    // Update scale based on depth and direction
    // Formula: scale increases as Z increases (closer = bigger)
    const depthMin = CONFIG.movement.depthRange[0];
    const depthMax = CONFIG.movement.depthRange[1];
    const depthRange = depthMax - depthMin;
    const depthScale = 0.85 + (f.position.z - depthMin) / depthRange * 0.15;  // 0.85 (far) to 1.0 (near)
    const finalScaleX = brain.baseScaleX * depthScale;
    const finalScaleY = brain.baseScaleY * depthScale;
    
    // Calculate movement for animation
    const dx = f.position.x - prevX;
    const dy = f.position.y - prevY;
    const dz = f.position.z - (brain.prevZ || f.position.z);
    
    // Calculate pitch (tilt up/down) based on vertical movement
    // For billboard fish, we need to rotate around Z axis
    const verticalSpeed = dy / dt; // Convert to velocity
    const horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / dt;
    
    brain.smoothPitch = brain.smoothPitch || 0;
    
    // Calculate angle: positive dy (up) should tilt head up, negative dy (down) should tilt head down
    let targetPitch = 0;
    
    // Deadzone to prevent jittering when fish is barely moving
    const minSpeed = 0.05; // Minimum speed threshold
    const totalSpeed = Math.sqrt(verticalSpeed * verticalSpeed + horizontalSpeed * horizontalSpeed);
    
    if (totalSpeed > minSpeed) {
      // Only calculate pitch if fish is moving significantly
      targetPitch = Math.atan2(verticalSpeed, horizontalSpeed) * 0.5; // Reduced from 0.6
      
      // If fish is facing left (flipped), we need to flip the rotation
      if (brain.facingDir < 0) {
        targetPitch = -targetPitch;
      }
      
      // Clamp pitch to prevent extreme angles
      targetPitch = Math.max(-0.3, Math.min(0.3, targetPitch));
    }
    
    // Stronger smoothing to reduce jitter
    brain.smoothPitch = brain.smoothPitch * 0.92 + targetPitch * 0.08; // Increased from 0.85/0.15
    
    // Apply rotation: Z axis for billboard tilt up/down
    f.rotation.set(0, 0, brain.smoothPitch);
    
    // Calculate swimming speed (3D velocity magnitude)
    const swimSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
    brain.prevZ = f.position.z;
    
    // Normalize speed relative to this fish's base speed
    // This makes fast swimmers (guppy) and slow swimmers (angelfish) both animate correctly
    const normalizedSpeed = swimSpeed / (brain.wanderSpeed * 2.0);  // Normalize to 0-1 range
    
    // Smooth the speed to avoid jittery animation
    brain.smoothSpeed = brain.smoothSpeed || 0;
    brain.smoothSpeed = brain.smoothSpeed * CONFIG.animation.smoothingSpeed + normalizedSpeed * (1.0 - CONFIG.animation.smoothingSpeed);
    
    // Calculate turn amount (change in direction)
    const currentDir = Math.atan2(dy, dx);
    brain.prevDir = brain.prevDir || currentDir;
    let dirChange = currentDir - brain.prevDir;
    
    // Normalize angle difference to -PI to PI
    while (dirChange > Math.PI) dirChange -= Math.PI * 2;
    while (dirChange < -Math.PI) dirChange += Math.PI * 2;
    
    // Smooth turn amount
    brain.smoothTurn = brain.smoothTurn || 0;
    brain.smoothTurn = brain.smoothTurn * CONFIG.animation.smoothingTurn + dirChange * (1.0 - CONFIG.animation.smoothingTurn);
    brain.prevDir = currentDir;
    
    // Apply scale with facing direction
    f.scale.set(
      finalScaleX * brain.facingDir,
      finalScaleY,
      1
    );

    // Update shader time, swimming speed, and turn amount
    f.material.uniforms.uTime.value = t;
    f.material.uniforms.uSwimSpeed.value = brain.smoothSpeed;
    f.material.uniforms.uTurnAmount.value = brain.smoothTurn;
    
    // Optional: UI controls can override (for debugging)
    // if (UI.speed && UI.amp) {
    //   f.material.uniforms.uSpeed.value = parseFloat(UI.speed.value);
    //   f.material.uniforms.uAmp.value = parseFloat(UI.amp.value);
    // }
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
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const distance = 10;
  const newVisibleHeight = 2 * Math.tan(vFOV / 2) * distance;
  const newVisibleWidth = newVisibleHeight * camera.aspect;
  const newScreenBottom = camera.position.y - newVisibleHeight / 2;
  const newScreenTop = camera.position.y + newVisibleHeight / 2;
  
  // Update floor size and position
  if (floorTex.image) {
    const imgAspect = floorTex.image.width / floorTex.image.height;
    const desiredWidth = newVisibleWidth;
    const desiredHeight = desiredWidth / imgAspect;
    
    floorGeo.dispose();
    floorGeo = new THREE.PlaneGeometry(desiredWidth, desiredHeight, 32, 16);
    floor.geometry = floorGeo;
    
    const floorBottomY = newScreenBottom + CONFIG.floor.positionY;
    floor.position.set(CONFIG.floor.positionX, floorBottomY + desiredHeight / 2, 0);
  }
  
  // Update bubble emitter position
  screenLeft = -newVisibleWidth / 2;
  screenRight = newVisibleWidth / 2;
  const BUBBLE_SOURCE_X_NEW = screenLeft + (newVisibleWidth * CONFIG.bubbles.emitterX / 100);
  const BUBBLE_SOURCE_Y_NEW = newScreenBottom + (newVisibleHeight * CONFIG.bubbles.emitterY / 100);
  
  // Update all bubble positions to new emitter location
  bubbles.forEach((bubble) => {
    const offsetX = bubble.position.x - BUBBLE_SOURCE_X;
    const offsetY = bubble.position.y - BUBBLE_SOURCE_Y;
    bubble.position.x = BUBBLE_SOURCE_X_NEW + offsetX;
    bubble.position.y = BUBBLE_SOURCE_Y_NEW + offsetY;
    bubble.userData.startX = BUBBLE_SOURCE_X_NEW + (Math.random() - 0.5) * CONFIG.bubbles.emitterWidth;
  });
  
  // Update global bubble source variables
  BUBBLE_SOURCE_X = BUBBLE_SOURCE_X_NEW;
  BUBBLE_SOURCE_Y = BUBBLE_SOURCE_Y_NEW;
  
  console.log("Resized - Screen:", newVisibleWidth, "x", newVisibleHeight);
});