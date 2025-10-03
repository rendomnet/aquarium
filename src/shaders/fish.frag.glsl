uniform sampler2D uTex;
uniform sampler2D uCaustics;
uniform float uTime;
uniform float uCausticsScale;
uniform float uCausticsDrift;
uniform float uCausticsIntensity;
uniform float uCausticsBase;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDepthBlur;
uniform float uMaxBlur;
uniform float uDepthMin;
uniform float uDepthMax;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  // Calculate depth factor using actual depth range (0=far/depthMin, 1=near/depthMax)
  float depth = (vWorldPos.z - uDepthMin) / (uDepthMax - uDepthMin);
  depth = clamp(depth, 0.0, 1.0);
  
  // Apply depth-based blur by sampling multiple times with offset
  // More blur for distant fish (low depth value)
  // Use maxBlur for fish at depthMin, no blur at depthMax
  float blurAmount = (1.0 - depth) * uMaxBlur * 0.01; // Scale blur
  
  vec4 c = vec4(0.0);
  if (blurAmount > 0.001) {
    // Sample texture multiple times with slight offsets for blur effect
    c += texture2D(uTex, vUv) * 0.4;
    c += texture2D(uTex, vUv + vec2(blurAmount, 0.0)) * 0.15;
    c += texture2D(uTex, vUv - vec2(blurAmount, 0.0)) * 0.15;
    c += texture2D(uTex, vUv + vec2(0.0, blurAmount)) * 0.15;
    c += texture2D(uTex, vUv - vec2(0.0, blurAmount)) * 0.15;
  } else {
    // No blur for close fish
    c = texture2D(uTex, vUv);
  }
  
  if (c.a < 0.08) discard;
  
  // Sample caustics based on world position (animated)
  // Use XY for vertical billboards (not XZ which is for horizontal planes)
  vec2 causticsUV = vWorldPos.xy * uCausticsScale + vec2(uTime * uCausticsDrift * 0.03, uTime * uCausticsDrift * 0.018);
  vec4 caustics = texture2D(uCaustics, causticsUV);
  
  // Apply caustics as a subtle brightness modulation
  float causticsIntensity = caustics.r * uCausticsIntensity + uCausticsBase;
  c.rgb *= causticsIntensity;
  
  // Apply depth fog based on Z position
  // Fish at depthMin (far) fade into fog, fish at depthMax (near) stay clear
  // depth already calculated above, reuse it
  float fogFactor = exp(-uFogDensity * (1.0 - depth) * 15.0); // Exponential fog
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  
  // Mix fish color with fog color based on distance
  c.rgb = mix(uFogColor, c.rgb, fogFactor);
  
  gl_FragColor = c;
}
