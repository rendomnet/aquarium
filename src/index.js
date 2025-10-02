import * as THREE from "three";

      // ---------- renderer / scene / camera ----------
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      document.body.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b2233, 0.055);

      const camera = new THREE.PerspectiveCamera(
        55,
        innerWidth / innerHeight,
        0.1,
        200
      );
      camera.position.set(0, 0.5, 10);
      camera.lookAt(0, 0.5, 0);

      // ---------- lights ----------
      scene.add(new THREE.AmbientLight(0x79a8ff, 0.55));
      const key = new THREE.DirectionalLight(0x9ad1ff, 0.7);
      key.position.set(6, 12, 8);
      scene.add(key);

      // ---------- background "tank" ----------
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshPhongMaterial({ color: 0x0a1b27, shininess: 2 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -3;
      scene.add(floor);

      // Low-poly rock silhouette (cheap depth cue)
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(2.2, 0),
        new THREE.MeshStandardMaterial({
          color: 0x0c2030,
          roughness: 1,
          metalness: 0,
        })
      );
      rock.position.set(-2.2, -2.2, -3.5);
      scene.add(rock);

      // ---------- textures ----------
      const loader = new THREE.TextureLoader();
      const causticsTex = loader.load("/images/caustics.jpg");
      causticsTex.wrapS = causticsTex.wrapT = THREE.RepeatWrapping;
      causticsTex.repeat.set(6, 6);

      const bubbleTex = loader.load("/images/bubble.png");
      bubbleTex.wrapS = bubbleTex.wrapT = THREE.ClampToEdgeWrapping;

      // ---------- moving caustics projector (simple quad overhead) ----------
      const caustics = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({
          map: causticsTex,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      caustics.rotation.x = Math.PI / 2;
      caustics.position.y = 4.5;
      scene.add(caustics);

      // ---------- fish shader (plane + sine tail) ----------
      const FISH_SEG_X = 64,
        FISH_SEG_Y = 12;
      const fishGeo = new THREE.PlaneGeometry(2.0, 0.8, FISH_SEG_X, FISH_SEG_Y);
      // Plane starts facing camera (+Z), no rotation needed for proper orientation

      const fishMat = new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {
          uTex: { value: null },
          uTime: { value: 0 },
          uSwimSpeed: { value: 0.0 },  // Fish's actual swimming speed
          // Anatomical part system - up to 6 parts per fish
          uPartCount: { value: 0 },
          // Each part: [minRow, maxRow, minCol, maxCol, flexibility, amplitude, frequency, speed, phaseOffset]
          uParts: { value: new Array(6).fill(0).map(() => [0,0,0,0,0,0,0,0,0]) },
          // Grid proportions: [row1, row2, row3, col1, col2, col3]
          uGridProps: { value: [0.33, 0.33, 0.34, 0.33, 0.34, 0.33] },
        },
        vertexShader: /*glsl*/ `
    uniform float uTime;
    uniform float uSwimSpeed;  // Fish's actual swimming speed
    uniform int uPartCount;
    uniform float uParts[54]; // 6 parts × 9 values each
    uniform float uGridProps[6]; // [row1, row2, row3, col1, col2, col3] proportions
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      
      // PHYSICS-BASED APPROACH:
      // 1. Distance from spine (center) - spine is rigid, edges are flexible
      float distFromSpine = abs(vUv.y - 0.5) * 2.0;  // 0 = spine, 1 = edge
      
      // 2. Position along body - uv.x=0 is tail, uv.x=1 is head (texture faces right)
      float bodyPosition = vUv.x;  // 0 = tail, 1 = head (NO FLIP!)
      
      // 3. Physics constraints
      // Only apply spine constraint - let anatomical parts handle head/tail
      float spineConstraint = 0.15 + distFromSpine * 0.85;  // 0.15 at spine, 1.0 at edges
      
      // 4. Now find which anatomical part we're in and get its properties
      float finalAmplitude = 0.0;
      float finalFrequency = 6.0;
      float finalSpeed = 0.7;
      float finalPhase = 0.0;
      float partModifier = 0.0;
      
      for (int i = 0; i < 6; i++) {
        if (i >= uPartCount) break;
        
        int baseIdx = i * 9;
        float minRow = uParts[baseIdx + 0];
        float maxRow = uParts[baseIdx + 1];
        float minCol = uParts[baseIdx + 2];
        float maxCol = uParts[baseIdx + 3];
        float flexibility = uParts[baseIdx + 4];
        float amplitude = uParts[baseIdx + 5];
        float frequency = uParts[baseIdx + 6];
        float speed = uParts[baseIdx + 7];
        float phaseOffset = uParts[baseIdx + 8];
        
        // Convert row/col to UV space using custom grid proportions
        // Rows: bottom to top (row 3, 2, 1)
        float row1End = uGridProps[0];
        float row2End = row1End + uGridProps[1];
        // Cols: left to right (col 1, 2, 3)
        float col1End = uGridProps[3];
        float col2End = col1End + uGridProps[4];
        
        // Calculate UV bounds for this part
        float rowMin, rowMax, colMin, colMax;
        
        // Row bounds (inverted: row 1=top, row 2=center, row 3=bottom)
        if (maxRow == 1.0) rowMin = row2End;
        else if (maxRow == 2.0) rowMin = row1End;
        else rowMin = 0.0;
        
        if (minRow == 1.0) rowMax = 1.0;
        else if (minRow == 2.0) rowMax = row2End;
        else rowMax = row1End;
        
        // Col bounds
        if (minCol == 1.0) colMin = 0.0;
        else if (minCol == 2.0) colMin = col1End;
        else colMin = col2End;
        
        if (maxCol == 1.0) colMax = col1End;
        else if (maxCol == 2.0) colMax = col2End;
        else colMax = 1.0;
        
        // Check if we're in this part's region (with small margin)
        if (vUv.x >= colMin - 0.05 && vUv.x <= colMax + 0.05 &&
            vUv.y >= rowMin - 0.05 && vUv.y <= rowMax + 0.05) {
          
          // Calculate influence (smooth at edges)
          float xInfluence = smoothstep(colMin - 0.05, colMin + 0.02, vUv.x) * 
                             (1.0 - smoothstep(colMax - 0.02, colMax + 0.05, vUv.x));
          float yInfluence = smoothstep(rowMin - 0.05, rowMin + 0.02, vUv.y) * 
                             (1.0 - smoothstep(rowMax - 0.02, rowMax + 0.05, vUv.y));
          
          float influence = xInfluence * yInfluence;
          
          if (influence > partModifier) {
            // Use the strongest part's properties
            partModifier = influence * flexibility;  // Include part's flexibility
            finalAmplitude = amplitude;
            finalFrequency = frequency;
            finalSpeed = speed;
            finalPhase = phaseOffset;
          }
        }
      }
      
      // 5. Apply physics constraints to part flexibility
      // Part flexibility is PRIMARY, spine constraint prevents center from moving too much
      float totalFlexibility = partModifier * spineConstraint;
      
      // 6. Apply animation modulated by swimming speed
      // Tail moves faster when fish swims faster
      float speedModulator = 0.5 + uSwimSpeed * 1.2;  // Min 0.5, more subtle increase
      float phase = uTime * finalSpeed * speedModulator + vUv.x * finalFrequency + finalPhase;
      
      // Main tail sway - side to side (Z axis)
      // Amplitude also increases slightly with speed
      float amplitudeModulator = 0.7 + uSwimSpeed * 0.8;  // More subtle amplitude change
      float sway = sin(phase) * finalAmplitude * totalFlexibility * amplitudeModulator;
      
      // Small vertical undulation (Y axis) - much less than horizontal
      float verticalBob = cos(phase * 0.6) * finalAmplitude * 0.15 * totalFlexibility;
      
      // Roll for natural movement
      float roll = sin(phase * 0.7) * finalAmplitude * 0.3 * totalFlexibility;
      
      vec3 pos = position;
      pos.z += sway;  // Side-to-side tail movement (main)
      pos.y += verticalBob;  // Small vertical bob
      
      // Apply roll (only to edges, not spine)
      mat3 rZ = mat3(
        cos(roll), -sin(roll), 0.0,
        sin(roll),  cos(roll), 0.0,
        0.0,        0.0,       1.0
      );
      pos = rZ * pos;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
        fragmentShader: /*glsl*/ `
    uniform sampler2D uTex;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(uTex, vUv);
      if (c.a < 0.08) discard;
      gl_FragColor = c;
    }
  `,
      });

      // ---------- school of fish ----------
      const UI = {
        speed: document.getElementById("speed"),
        amp: document.getElementById("amp"),
      };

      // Helper to define anatomical parts with named parameters
      function definePart({ cells, flexibility, amplitude, frequency, speed, phaseOffset = 0 }) {
        return { cells, flexibility, amplitude, frequency, speed, phaseOffset };
      }

      // Fish species definitions
      const FISH_SPECIES = {
        angelfish: {
          texture: '/images/fish/angelfish.png',
          size: { width: 2.2, height: 2.2 },
          baseSpeed: 0.12,
          wanderRange: 2.5,
          preferredDepth: [0.3, 1.2],
          schooling: false,
          gridProportions: {
            rows: [0.35, 0.30, 0.35],    // Tall fins top/bottom, narrow body center
            cols: [0.30, 0.40, 0.30]     // Tail, body, head
          },
          anatomy: {
            tailFin: definePart({
              cells: [[1,1], [2,1], [3,1]],  // TAIL = Col 1 (left side)
              flexibility: 1.0,               // How much this part moves
              amplitude: 0.25,                // Wave strength
              frequency: 5.0,                 // Wave frequency
              speed: 0.8,                     // Animation speed
              phaseOffset: 0.5                // Wave timing offset
            }),
            bodyCore: definePart({
              cells: [[2,2]],                 // BODY = Col 2 (center spine)
              flexibility: 0.01,              // Almost rigid
              amplitude: 0.02,
              frequency: 6.0,
              speed: 0.7
            }),
            dorsalFin: definePart({
              cells: [[1,2], [1,3]],          // Top fin on body+head
              flexibility: 0.7,
              amplitude: 0.18,
              frequency: 6.0,
              speed: 0.7,
              phaseOffset: 0.0
            }),
            ventralFin: definePart({
              cells: [[3,2], [3,3]],          // Bottom fin on body+head
              flexibility: 0.7,
              amplitude: 0.18,
              frequency: 6.0,
              speed: 0.7,
              phaseOffset: Math.PI            // Opposite phase to dorsal
            }),
            headCore: definePart({
              cells: [[2,3]],                 // HEAD = Col 3 (right side)
              flexibility: 0.0,               // Completely rigid
              amplitude: 0.0,
              frequency: 6.0,
              speed: 0.7
            })
          }
        },
        discus: {
          texture: '/images/fish/discus.png',
          size: { width: 1.8, height: 1.8 },
          baseSpeed: 0.15,
          wanderRange: 2.8,
          preferredDepth: [0.2, 1.0],
          schooling: false,
          gridProportions: {
            rows: [0.25, 0.50, 0.25],    // Round disc - large center
            cols: [0.25, 0.50, 0.25]     // Small tail, large body, small head
          },
          anatomy: {
            tailFin: definePart({
              cells: [[1,1], [2,1], [3,1]],
              flexibility: 0.85,
              amplitude: 0.15,
              frequency: 5.0,
              speed: 0.65
            }),
            dorsalFin: definePart({
              cells: [[1,1], [1,2], [1,3]],  // Top fin across tail, body, head
              flexibility: 0.6,
              amplitude: 0.16,
              frequency: 5.0,
              speed: 0.65,
              phaseOffset: 0.0
            }),
            ventralFin: definePart({
              cells: [[3,1], [3,2], [3,3]],  // Bottom fin across tail, body, head
              flexibility: 0.6,
              amplitude: 0.16,
              frequency: 5.0,
              speed: 0.65,
              phaseOffset: Math.PI
            }),
            bodyCore: definePart({
              cells: [[2,2], [2,3]],  // Center spine only
              flexibility: 0.01,
              amplitude: 0.04,
              frequency: 5.0,
              speed: 0.65
            }),
            headCore: definePart({
              cells: [[2,3]],
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
          baseSpeed: 0.18,
          wanderRange: 3.0,
          preferredDepth: [0.5, 1.5],
          schooling: false,
          gridProportions: {
            rows: [0.30, 0.40, 0.30],    // Balanced
            cols: [0.30, 0.40, 0.30]     // Balanced proportions
          },
          anatomy: {
            tailFin: definePart({ cells: [[1,1], [2,1], [3,1]], flexibility: 1.8, amplitude: 0.26, frequency: 6.5, speed: 0.8, phaseOffset: 0.3 }),
            bodyCore: definePart({ cells: [[2,2]], flexibility: 0.05, amplitude: 0.08, frequency: 7.0, speed: 0.75 }),
            dorsalFin: definePart({ cells: [[1,1], [1,2]], flexibility: 0.8, amplitude: 0.20, frequency: 7.0, speed: 0.75, phaseOffset: 0.0 }),
            ventralFin: definePart({ cells: [[3,1], [3,2]], flexibility: 0.8, amplitude: 0.20, frequency: 7.0, speed: 0.75, phaseOffset: Math.PI }),
            headCore: definePart({ cells: [[2,3]], flexibility: 0.0, amplitude: 0.0, frequency: 7.0, speed: 0.75 })
          }
        },
        swordtail: {
          texture: '/images/fish/swordtail.png',
          size: { width: 2, height: 0.6 },
          baseSpeed: 0.25,
          wanderRange: 4.0,
          preferredDepth: [0.0, 1.0],
          schooling: true,
          gridProportions: {
            rows: [0.30, 0.40, 0.30],    // Slim body - more balanced vertical
            cols: [0.35, 0.35, 0.30]     // Longer tail (sword)
          },
          anatomy: {
            tailFin: definePart({ cells: [[1,1], [2,1], [3,1]], flexibility: 2.0, amplitude: 0.30, frequency: 7.0, speed: 0.95, phaseOffset: 0.4 }),
            bodyCore: definePart({ cells: [[2,2]], flexibility: 0.05, amplitude: 0.08, frequency: 7.5, speed: 0.90 }),
            dorsalFin: definePart({ cells: [[1,1], [1,2]], flexibility: 0.8, amplitude: 0.20, frequency: 7.5, speed: 0.90, phaseOffset: 0.0 }),
            ventralFin: definePart({ cells: [[3,1], [3,2]], flexibility: 0.8, amplitude: 0.20, frequency: 7.5, speed: 0.90, phaseOffset: Math.PI }),
            headCore: definePart({ cells: [[2,3]], flexibility: 0.0, amplitude: 0.0, frequency: 7.5, speed: 0.90 })
          }
        },
        platy: {
          texture: '/images/fish/platy.png',
          size: { width: 1.2, height: 0.6 },
          baseSpeed: 0.22,
          wanderRange: 3.5,
          preferredDepth: [-0.2, 0.8],
          schooling: true,
          gridProportions: {
            rows: [0.30, 0.40, 0.30],    // Standard proportions
            cols: [0.30, 0.40, 0.30]
          },
          anatomy: {
            tailFin: definePart({ cells: [[1,1], [2,1], [3,1]], flexibility: 1.8, amplitude: 0.25, frequency: 6.5, speed: 0.85, phaseOffset: 0.3 }),
            bodyCore: definePart({ cells: [[2,2]], flexibility: 0.05, amplitude: 0.08, frequency: 7.0, speed: 0.80 }),
            dorsalFin: definePart({ cells: [[1,1], [1,2]], flexibility: 0.8, amplitude: 0.18, frequency: 7.0, speed: 0.80, phaseOffset: 0.0 }),
            ventralFin: definePart({ cells: [[3,1], [3,2]], flexibility: 0.8, amplitude: 0.18, frequency: 7.0, speed: 0.80, phaseOffset: Math.PI }),
            headCore: definePart({ cells: [[2,3]], flexibility: 0.0, amplitude: 0.0, frequency: 7.0, speed: 0.80 })
          }
        },
        guppy: {
          texture: '/images/fish/guppy.png',
          size: { width: 1.3, height: 0.5 },
          baseSpeed: 0.30,
          wanderRange: 4.5,
          preferredDepth: [0.3, 1.3],
          schooling: true,
          gridProportions: {
            rows: [0.35, 0.30, 0.35],    // Larger fins top/bottom, small body
            cols: [0.30, 0.40, 0.30]     // Tail (30%), body (40%), head (30%)
          },
          anatomy: {
            fancyTail: definePart({
              cells: [[1,1], [2,1], [3,1]],  // Entire tail column
              flexibility: 1.2,               // Reduced flexibility
              amplitude: 0.15,                // Lower base amplitude
              frequency: 7.0,                 // Graceful waves
              speed: 1.0,
              phaseOffset: 0.5
            }),
            bodyCore: definePart({
              cells: [[2,2]],                 // Small body center
              flexibility: 0.08,
              amplitude: 0.10,
              frequency: 8.0,
              speed: 1.0
            }),
            dorsalFin: definePart({
              cells: [[1,2]],                 // Small dorsal on body only
              flexibility: 0.5,
              amplitude: 0.18,
              frequency: 8.0,
              speed: 1.0,
              phaseOffset: 0.0
            }),
            ventralFin: definePart({
              cells: [[3,2]],                 // Small ventral on body only
              flexibility: 0.7,
              amplitude: 0.18,
              frequency: 8.0,
              speed: 1.0,
              phaseOffset: Math.PI
            }),
            headCore: definePart({
              cells: [[2,3]],                 // Tiny head
              flexibility: 0.0,
              amplitude: 0.0,
              frequency: 8.0,
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

      function createFish(speciesName, spawnDelay) {
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
          
          // Pack into array: [minRow, maxRow, minCol, maxCol, flexibility, amplitude, frequency, speed, phaseOffset]
          partsArray.push(
            minRow, maxRow, minCol, maxCol,
            part.flexibility, part.amplitude, part.frequency, part.speed, part.phaseOffset
          );
        });
        
        // Pad to 54 elements (6 parts × 9 values)
        while (partsArray.length < 54) partsArray.push(0);
        
        mat.uniforms.uPartCount.value = parts.length;
        mat.uniforms.uParts.value = partsArray;
        
        // Set custom grid proportions for this species
        const gridProps = species.gridProportions;
        mat.uniforms.uGridProps.value = [
          gridProps.rows[0], gridProps.rows[1], gridProps.rows[2],
          gridProps.cols[0], gridProps.cols[1], gridProps.cols[2]
        ];
        
        const m = new THREE.Mesh(fishGeo, mat);
        
        // Random starting direction
        const startFromLeft = Math.random() < 0.5;
        const facingDir = startFromLeft ? 1 : -1;

        // Vary vertical position more - spread across full tank height
        const height = -0.5 + Math.random() * 2.5; // -0.5 to 2.0
        
        // Spawn position - start off-screen
        const startX = startFromLeft ? -8 : 8;
        const startZ = (Math.random() - 0.5) * 5 - 0.5; // -3 to 2
        
        // Size based on species (using scale) - base geometry is 2.0 x 0.8
        const baseScaleX = species.size.width / 2.0;   // Normalize width to base geometry
        const baseScaleY = species.size.height / 0.8;  // Normalize height to base geometry
        
        m.userData = {
          species: speciesName,
          baseX: (Math.random() - 0.5) * 8, // Random area, not centered
          baseZ: startZ,
          baseY: height,
          wanderSpeed: species.baseSpeed * (0.8 + Math.random() * 0.4),
          wanderRange: species.wanderRange,
          phase: Math.random() * Math.PI * 2,
          spawnTime: spawnDelay,
          spawned: false,
          startX: startX,
          facingDir: facingDir,
          baseScaleX: baseScaleX,
          baseScaleY: baseScaleY,
          // Movement direction
          targetX: (Math.random() - 0.5) * 8,
          targetY: -0.5 + Math.random() * 2.5
        };
        
        m.position.set(startX, height, startZ);
        
        // Set initial scale (will be updated in animation loop)
        const depthScale = 1.0 - (startZ + 3) * 0.08;
        m.scale.set(
          baseScaleX * depthScale * facingDir,
          baseScaleY * depthScale,
          1
        );
        
        return m;
      }

      const fishes = [];
      POPULATION.forEach((speciesName, i) => {
        const spawnDelay = i * 0.8; // Stagger spawns every 0.8 seconds
        const f = createFish(speciesName, spawnDelay);
        scene.add(f);
        fishes.push(f);
      });

      // ---------- bubble particles ----------
      const BUBBLE_COUNT = 120;
      const bubbleGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(BUBBLE_COUNT * 3);
      const vel = new Float32Array(BUBBLE_COUNT);
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        pos[i * 3 + 0] = (Math.random() - 0.5) * 8;
        pos[i * 3 + 1] = -2.5 + Math.random() * 2.5;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
        vel[i] = 0.4 + Math.random() * 0.6;
      }
      bubbleGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      bubbleGeo.setAttribute("aVel", new THREE.BufferAttribute(vel, 1));

      const bubbleMat = new THREE.PointsMaterial({
        map: bubbleTex,
        size: 0.08,
        transparent: true,
        depthWrite: false,
        opacity: 0.8,
      });
      const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
      scene.add(bubbles);

      // ---------- animate ----------
      const clock = new THREE.Clock();
      function tick() {
        const dt = clock.getDelta();
        const t = clock.elapsedTime;

        // caustics drift
        causticsTex.offset.x = (t * 0.03) % 1;
        causticsTex.offset.y = (t * 0.018) % 1;

        // gentle aquarium swimming
        fishes.forEach((f, i) => {
          const brain = f.userData;
          
          // Handle spawn animation
          if (!brain.spawned) {
            if (t < brain.spawnTime) {
              f.visible = false;
              return;
            }
            brain.spawned = true;
            f.visible = true;
          }
          
          // Swim in from off-screen during first few seconds
          const timeSinceSpawn = t - brain.spawnTime;
          const swimInDuration = 3.0;
          let swimInProgress = Math.min(timeSinceSpawn / swimInDuration, 1.0);
          
          // Natural swimming with directional movement
          const wanderX = Math.sin(t * brain.wanderSpeed + brain.phase) * brain.wanderRange;
          const wanderZ = Math.cos(t * brain.wanderSpeed * 0.7 + brain.phase) * 1.2;
          const wanderY = Math.sin(t * brain.wanderSpeed * 0.5 + brain.phase) * 0.4;
          
          const prevX = f.position.x;
          const prevY = f.position.y;
          
          // Swim naturally, not forced to center
          f.position.x = brain.baseX + wanderX;
          f.position.z = brain.baseZ + wanderZ;
          f.position.y = brain.baseY + wanderY;

          // Wrap around if fish goes too far
          if (f.position.x > 7) { 
            f.position.x = -7; 
            brain.baseX = -5 + Math.random() * 2;
          }
          if (f.position.x < -7) { 
            f.position.x = 7; 
            brain.baseX = 3 + Math.random() * 2;
          }
          if (f.position.y > 2.5) {
            brain.baseY = -0.3 + Math.random() * 1.5;
          }
          if (f.position.y < -1.0) {
            brain.baseY = 0.5 + Math.random() * 1.5;
          }
          if (f.position.z > 3) { brain.baseZ = -2; }
          if (f.position.z < -3) { brain.baseZ = 2; }

          // Keep fish facing camera (no rotation) - billboard effect
          f.rotation.set(0, 0, 0);
          
          // Update scale based on depth and direction
          const depthScale = 1.0 - (f.position.z + 3) * 0.08;
          const finalScaleX = brain.baseScaleX * depthScale;
          const finalScaleY = brain.baseScaleY * depthScale;
          
          // Flip fish based on movement direction (texture faces right, so flip logic)
          const dx = f.position.x - prevX;
          const dy = f.position.y - prevY;
          const dz = f.position.z - (brain.prevZ || f.position.z);
          
          // Calculate swimming speed (3D velocity magnitude)
          const swimSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
          brain.prevZ = f.position.z;
          
          // Smooth the speed to avoid jittery animation
          brain.smoothSpeed = brain.smoothSpeed || 0;
          brain.smoothSpeed = brain.smoothSpeed * 0.8 + swimSpeed * 0.2;
          
          if (Math.abs(dx) > 0.001) {
            // Moving horizontally - face direction of movement
            brain.facingDir = dx > 0 ? 1 : -1; // positive X = right = normal, negative X = left = flip
          }
          
          f.scale.set(
            finalScaleX * brain.facingDir,
            finalScaleY,
            1
          );

          // Update shader time and swimming speed
          f.material.uniforms.uTime.value = t;
          f.material.uniforms.uSwimSpeed.value = brain.smoothSpeed;
          
          // Optional: UI controls can override (for debugging)
          // if (UI.speed && UI.amp) {
          //   f.material.uniforms.uSpeed.value = parseFloat(UI.speed.value);
          //   f.material.uniforms.uAmp.value = parseFloat(UI.amp.value);
          // }
        });

        // bubbles rise + respawn
        const pa = bubbles.geometry.attributes.position.array;
        const va = bubbles.geometry.attributes.aVel.array;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          pa[i * 3 + 1] += va[i] * dt; // rise
          pa[i * 3 + 0] += Math.sin(t * 0.8 + i) * 0.001; // tiny drift
          pa[i * 3 + 2] += Math.cos(t * 0.7 + i) * 0.001;

          if (pa[i * 3 + 1] > 3.0) {
            // respawn near “gravel”
            pa[i * 3 + 0] = (Math.random() - 0.5) * 8;
            pa[i * 3 + 1] = -2.5 + Math.random() * 0.5;
            pa[i * 3 + 2] = (Math.random() - 0.5) * 8;
            va[i] = 0.4 + Math.random() * 0.6;
          }
        }
        bubbles.geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      }
      tick();

      // ---------- resize ----------
      addEventListener("resize", () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
      });