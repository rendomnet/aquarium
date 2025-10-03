uniform sampler2D uFloorTex;
uniform sampler2D uCaustics;
uniform float uTime;
uniform float uCausticsScale;
uniform float uCausticsDrift;
uniform float uCausticsIntensity;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  // Sample floor texture
  vec4 floorColor = texture2D(uFloorTex, vUv);
  
  // Sample caustics based on UV coordinates (for billboard)
  // Scale UV to create larger caustics pattern
  vec2 causticsUV = vUv * 3.0 + vec2(uTime * uCausticsDrift * 0.03, uTime * uCausticsDrift * 0.018);
  vec4 caustics = texture2D(uCaustics, causticsUV);
  
  // Apply caustics as brightness modulation
  float causticsEffect = caustics.r * uCausticsIntensity + 0.7; // Base brightness 0.7
  floorColor.rgb *= causticsEffect;
  
  // Preserve alpha channel from original texture
  gl_FragColor = vec4(floorColor.rgb, floorColor.a);
}
