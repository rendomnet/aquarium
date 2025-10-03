uniform float uTime;
uniform float uWaveIntensity;
uniform float uWaveFrequency;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  
  // Create wave distortion on the floor
  // Use multiple sine waves at different frequencies for natural look
  // Higher frequency = shorter, tighter waves (more ripples)
  float wave1 = sin(uv.x * uWaveFrequency + uTime * 0.5) * 0.1;
  float wave2 = sin(uv.y * (uWaveFrequency * 0.83) + uTime * 0.3) * 0.08;
  float wave3 = sin((uv.x + uv.y) * (uWaveFrequency * 0.67) - uTime * 0.4) * 0.05;
  
  // Combine waves for complex ripple pattern
  float displacement = (wave1 + wave2 + wave3) * uWaveIntensity;
  
  // Apply displacement in Z direction (toward/away from camera)
  vec3 newPosition = position;
  newPosition.z += displacement;
  
  vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
