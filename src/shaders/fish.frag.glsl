uniform sampler2D uTex;
uniform sampler2D uCaustics;
uniform float uTime;
uniform float uCausticsScale;
uniform float uCausticsDrift;
uniform float uCausticsIntensity;
uniform float uCausticsBase;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec4 c = texture2D(uTex, vUv);
  if (c.a < 0.08) discard;
  
  // Sample caustics based on world position (animated)
  // Note: scale and drift speed are passed as uniforms
  vec2 causticsUV = vWorldPos.xz * uCausticsScale + vec2(uTime * uCausticsDrift * 0.03, uTime * uCausticsDrift * 0.018);
  vec4 caustics = texture2D(uCaustics, causticsUV);
  
  // Apply caustics as a subtle brightness modulation
  float causticsIntensity = caustics.r * uCausticsIntensity + uCausticsBase;
  c.rgb *= causticsIntensity;
  
  gl_FragColor = c;
}
