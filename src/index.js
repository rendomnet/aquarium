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
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTex: { value: null },
          uTime: { value: 0 },
          uAmp: { value: 0.22 },
          uFreq: { value: 8.0 },
          uSpeed: { value: 0.85 },
          uRoll: { value: 0.16 },
        },
        vertexShader: /*glsl*/ `
    uniform float uTime, uAmp, uFreq, uSpeed, uRoll;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      float w = smoothstep(0.18, 1.0, vUv.x);            // tail weighting
      float phase = uTime * uSpeed + vUv.x * uFreq;
      float sway  = sin(phase) * uAmp * w;               // lateral wag
      float und   = cos(phase * 0.6) * 0.02 * (0.4 + w); // slight vertical

      vec3 pos = position;
      pos.y += sway;
      pos.z += und;

      float roll = sin(uTime * uSpeed * 0.7) * uRoll * (0.25 + w);
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

      // Fish species definitions
      const FISH_SPECIES = {
        angelfish: {
          texture: '/images/fish/angelfish.png',
          size: { width: 2.2, height: 2.2 },
          baseSpeed: 0.12,
          wanderRange: 2.5,
          preferredDepth: [0.3, 1.2],
          schooling: false
        },
        discus: {
          texture: '/images/fish/discus.png',
          size: { width: 1.8, height: 1.8 },
          baseSpeed: 0.15,
          wanderRange: 2.8,
          preferredDepth: [0.2, 1.0],
          schooling: false
        },
        gourami: {
          texture: '/images/fish/gourami.png',
          size: { width: 1.5, height: 0.9 },
          baseSpeed: 0.18,
          wanderRange: 3.0,
          preferredDepth: [0.5, 1.5],
          schooling: false
        },
        swordtail: {
          texture: '/images/fish/swordtail.png',
          size: { width: 1.6, height: 0.7 },
          baseSpeed: 0.25,
          wanderRange: 4.0,
          preferredDepth: [0.0, 1.0],
          schooling: true
        },
        platy: {
          texture: '/images/fish/platy.png',
          size: { width: 1.2, height: 0.6 },
          baseSpeed: 0.22,
          wanderRange: 3.5,
          preferredDepth: [-0.2, 0.8],
          schooling: true
        },
        guppy: {
          texture: '/images/fish/guppy.png',
          size: { width: 0.9, height: 0.5 },
          baseSpeed: 0.30,
          wanderRange: 4.5,
          preferredDepth: [0.3, 1.3],
          schooling: true
        }
      };

      // Tank population
      const POPULATION = [
        'angelfish', 'angelfish',
        'discus', 'discus',
        'gourami', 'gourami', 'gourami',
        'swordtail', 'swordtail', 'swordtail',
        'platy', 'platy', 'platy', 'platy',
        'guppy', 'guppy', 'guppy', 'guppy', 'guppy'
      ];

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
        const m = new THREE.Mesh(fishGeo, mat);
        
        // Random starting direction
        const startFromLeft = Math.random() < 0.5;
        const facingDir = startFromLeft ? 1 : -1;

        // Vary vertical position more - spread across full tank height
        const height = -0.5 + Math.random() * 2.5; // -0.5 to 2.0
        
        // Spawn position - start off-screen
        const startX = startFromLeft ? -8 : 8;
        const startZ = (Math.random() - 0.5) * 5 - 0.5; // -3 to 2
        
        // Size based on species (using scale)
        const baseScale = species.size.width / 2.0; // Normalize to base geometry size
        
        m.userData = {
          species: speciesName,
          baseX: startFromLeft ? -3 : 3, // Target area
          baseZ: startZ,
          height: height,
          wanderSpeed: species.baseSpeed * (0.8 + Math.random() * 0.4),
          wanderRange: species.wanderRange,
          phase: Math.random() * Math.PI * 2,
          spawnTime: spawnDelay,
          spawned: false,
          startX: startX,
          facingDir: facingDir,
          baseScale: baseScale
        };
        
        m.position.set(startX, height, startZ);
        
        // Set initial scale (will be updated in animation loop)
        const depthScale = 1.0 - (startZ + 3) * 0.08;
        m.scale.set(
          baseScale * depthScale * facingDir,
          baseScale * depthScale,
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
          
          // Lazy side-to-side swimming
          const wanderX = Math.sin(t * brain.wanderSpeed + brain.phase) * brain.wanderRange;
          const wanderZ = Math.cos(t * brain.wanderSpeed * 0.7 + brain.phase) * 1.2;
          
          const prevX = f.position.x;
          
          // Blend from spawn position to wander position
          const targetX = brain.baseX + wanderX;
          f.position.x = brain.startX + (targetX - brain.startX) * swimInProgress;
          f.position.z = brain.baseZ + wanderZ;
          f.position.y = brain.height + Math.sin(t * 0.4 + brain.phase) * 0.15;

          // Wrap around if fish goes too far (only after fully spawned)
          if (swimInProgress >= 1.0) {
            if (f.position.x > 6) { 
              f.position.x = -6; 
              brain.baseX = -4;
              brain.startX = -6;
            }
            if (f.position.x < -6) { 
              f.position.x = 6; 
              brain.baseX = 4;
              brain.startX = 6;
            }
            if (f.position.z > 3) { brain.baseZ = -2; }
            if (f.position.z < -3) { brain.baseZ = 2; }
          }

          // Keep fish facing camera (no rotation) - billboard effect
          f.rotation.set(0, 0, 0);
          
          // Update scale based on depth and direction
          const depthScale = 1.0 - (f.position.z + 3) * 0.08;
          const finalScale = brain.baseScale * depthScale;
          
          // Flip fish horizontally based on movement direction
          if (f.position.x < prevX) {
            brain.facingDir = 1; // swimming left
          } else if (f.position.x > prevX) {
            brain.facingDir = -1; // swimming right
          }
          
          f.scale.set(
            finalScale * brain.facingDir,
            finalScale,
            1
          );

          // live-tune shader
          f.material.uniforms.uTime.value = t;
          if (UI.speed && UI.amp) {
            f.material.uniforms.uSpeed.value = parseFloat(UI.speed.value);
            f.material.uniforms.uAmp.value = parseFloat(UI.amp.value);
          }
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