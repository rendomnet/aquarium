uniform sampler2D uFloorTex;
uniform sampler2D uCaustics;
uniform float uTime;
uniform float uCausticsScale;
uniform float uCausticsDrift;
uniform float uCausticsIntensity;
uniform float uWaveFrequency;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  // Sample floor texture
  vec4 floorColor = texture2D(uFloorTex, vUv);
  
  // Create distortion for caustics using sine waves (similar to vertex waves)
  float distortX = sin(vUv.y * uWaveFrequency * 0.5 + uTime * 0.4) * 0.02;
  float distortY = sin(vUv.x * uWaveFrequency * 0.5 + uTime * 0.3) * 0.02;
  vec2 distortion = vec2(distortX, distortY);
  
  // Sample caustics with distorted UVs for wavy effect
  vec2 causticsUV = vUv * 3.0 + vec2(uTime * uCausticsDrift * 0.03, uTime * uCausticsDrift * 0.018);
  causticsUV += distortion; // Apply wave distortion
  vec4 caustics = texture2D(uCaustics, causticsUV);
  
  // Apply caustics as brightness modulation
  float causticsEffect = caustics.r * uCausticsIntensity + 0.7; // Base brightness 0.7
  floorColor.rgb *= causticsEffect;
  
  // Preserve alpha channel from original texture
  gl_FragColor = vec4(floorColor.rgb, floorColor.a);
}
