import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
      camera.position.set(0, 1.3, 6.5);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

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
      const fishTex = loader.load("fish.png");
      const causticsTex = loader.load("caustics.jpg");
      causticsTex.wrapS = causticsTex.wrapT = THREE.RepeatWrapping;
      causticsTex.repeat.set(6, 6);

      const bubbleTex = loader.load("bubble.png");
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
      fishGeo.rotateY(Math.PI); // uv.x = 0 (nose) -> 1 (tail) when facing +Z

      const fishMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTex: { value: fishTex },
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

      function createFish() {
        const m = new THREE.Mesh(fishGeo, fishMat.clone());
        m.material.uniforms.uTex.value = fishTex;
        m.scale.x = Math.random() < 0.5 ? -1 : 1;

        m.userData = {
          theta: Math.random() * Math.PI * 2,
          radius: 3.8 + Math.random() * 3.2,
          height: -0.4 + Math.random() * 1.0,
          turn: 0.1 + Math.random() * 0.16,
          phase: Math.random() * Math.PI * 2,
        };
        return m;
      }

      const fishes = [];
      for (let i = 0; i < 12; i++) {
        const f = createFish();
        f.position.set(
          (Math.random() - 0.5) * 8,
          -0.2 + Math.random() * 1.2,
          (Math.random() - 0.5) * 6
        );
        scene.add(f);
        fishes.push(f);
      }

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

        // school swim + shader controls
        fishes.forEach((f, i) => {
          const brain = f.userData;
          brain.theta += brain.turn * dt;

          const r = brain.radius + Math.sin(t * 0.5 + i) * 0.35;
          f.position.x = Math.cos(brain.theta + i * 0.35) * r * 0.65;
          f.position.z = Math.sin(brain.theta + i * 0.35) * r;
          f.position.y = brain.height + Math.sin(t * 0.9 + brain.phase) * 0.22;

          const ahead = new THREE.Vector3(
            Math.cos(brain.theta + 0.05 + i * 0.35) * r * 0.65,
            f.position.y,
            Math.sin(brain.theta + 0.05 + i * 0.35) * r
          );
          f.lookAt(ahead);
          f.rotation.z = 0; // keep upright; roll is in shader

          // live-tune shader
          f.material.uniforms.uTime.value = t;
          f.material.uniforms.uSpeed.value = parseFloat(UI.speed.value);
          f.material.uniforms.uAmp.value = parseFloat(UI.amp.value);
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

        controls.update();
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