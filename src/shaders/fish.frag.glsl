uniform sampler2D uTex;
uniform sampler2D uCaustics;
uniform float uTime;
uniform float uCausticsScale;
uniform float uCausticsDrift;
uniform float uCausticsIntensity;
uniform float uCausticsBase;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec4 c = texture2D(uTex, vUv);
  if (c.a < 0.08) discard;
  
  // Sample caustics based on world position (animated)
  // Use XY for vertical billboards (not XZ which is for horizontal planes)
  vec2 causticsUV = vWorldPos.xy * uCausticsScale + vec2(uTime * uCausticsDrift * 0.03, uTime * uCausticsDrift * 0.018);
  vec4 caustics = texture2D(uCaustics, causticsUV);
  
  // Apply caustics as a subtle brightness modulation
  float causticsIntensity = caustics.r * uCausticsIntensity + uCausticsBase;
  c.rgb *= causticsIntensity;
  
  // Apply depth fog based on Z position
  // Fish at z=-3 (far) fade into fog, fish at z=3 (near) stay clear
  float depth = (vWorldPos.z + 3.0) / 6.0; // Normalize to 0-1 (0=far, 1=near)
  float fogFactor = exp(-uFogDensity * (1.0 - depth) * 15.0); // Exponential fog
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  
  // Mix fish color with fog color based on distance
  c.rgb = mix(uFogColor, c.rgb, fogFactor);
  
  gl_FragColor = c;
}
