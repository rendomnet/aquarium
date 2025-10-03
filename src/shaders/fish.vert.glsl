uniform float uTime;
uniform float uSwimSpeed;
uniform float uTurnAmount;
uniform float uDragStrength;
uniform float uSpeedMin, uSpeedMax;
uniform float uAmpMin, uAmpMax;
uniform int uPartCount;
uniform float uParts[60];
uniform float uGridProps[7];

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;

  // Same animation logic as before
  float distFromSpine = abs(vUv.y - 0.5) * 2.0;
  float bodyPosition = vUv.x;
  float spineConstraint = distFromSpine;

  float partModifier = 0.0;
  float finalSpeed = 1.0;
  float finalAmplitude = 0.0;
  float finalFrequency = 1.0;
  float finalPhase = 0.0;
  float finalMovementResponse = 0.0;

  for (int i = 0; i < 6; i++) {
    if (i >= uPartCount) break;
    
    int baseIdx = i * 10;
    float minRow = uParts[baseIdx + 0];
    float maxRow = uParts[baseIdx + 1];
    float minCol = uParts[baseIdx + 2];
    float maxCol = uParts[baseIdx + 3];
    float flexibility = uParts[baseIdx + 4];
    float amplitude = uParts[baseIdx + 5];
    float frequency = uParts[baseIdx + 6];
    float speed = uParts[baseIdx + 7];
    float phaseOffset = uParts[baseIdx + 8];
    float movementResponse = uParts[baseIdx + 9];
    
    float row1End = uGridProps[0];
    float row2End = row1End + uGridProps[1];
    float col1End = uGridProps[3];
    float col2End = col1End + uGridProps[4];
    float col3End = col2End + uGridProps[5];
    
    float rowMin, rowMax, colMin, colMax;
    
    if (maxRow == 1.0) rowMin = row2End;
    else if (maxRow == 2.0) rowMin = row1End;
    else rowMin = 0.0;
    
    if (minRow == 1.0) rowMax = 1.0;
    else if (minRow == 2.0) rowMax = row2End;
    else rowMax = row1End;
    
    if (minCol == 1.0) colMin = 0.0;
    else if (minCol == 2.0) colMin = col1End;
    else if (minCol == 3.0) colMin = col2End;
    else colMin = col3End;
    
    if (maxCol == 1.0) colMax = col1End;
    else if (maxCol == 2.0) colMax = col2End;
    else if (maxCol == 3.0) colMax = col3End;
    else colMax = 1.0;
    
    if (vUv.x >= colMin - 0.05 && vUv.x <= colMax + 0.05 &&
        vUv.y >= rowMin - 0.05 && vUv.y <= rowMax + 0.05) {
      
      float xInfluence = smoothstep(colMin - 0.05, colMin + 0.02, vUv.x) * 
                         (1.0 - smoothstep(colMax - 0.02, colMax + 0.05, vUv.x));
      float yInfluence = smoothstep(rowMin - 0.05, rowMin + 0.02, vUv.y) * 
                         (1.0 - smoothstep(rowMax - 0.02, rowMax + 0.05, vUv.y));
      float influence = xInfluence * yInfluence;

        if (influence > partModifier) {
          partModifier = flexibility * influence;
          finalSpeed = speed;
          finalAmplitude = amplitude;
          finalFrequency = frequency;
          finalPhase = phaseOffset;
          finalMovementResponse = movementResponse;
        }
    }
  }
  
  float totalFlexibility = partModifier * spineConstraint;
  
  float speedModulator = 1.0;
  float amplitudeModulator = 1.0;
  
  if (finalMovementResponse > 1.5) {
    speedModulator = clamp(uSpeedMin + uSwimSpeed * 1.5, uSpeedMin, uSpeedMax);
    amplitudeModulator = clamp(uAmpMin + uSwimSpeed * 1.0, uAmpMin, uAmpMax);
  } else if (finalMovementResponse > 0.5) {
    speedModulator = clamp(0.8 + uSwimSpeed * 0.3, 0.8, 1.2);
    amplitudeModulator = 1.0;
  }
  
  float phase = uTime * finalSpeed * speedModulator + vUv.x * finalFrequency + finalPhase;
  float sway = sin(phase) * finalAmplitude * totalFlexibility * amplitudeModulator;
  
  float dragAmount = (1.0 - vUv.x) * uTurnAmount * totalFlexibility * uDragStrength;
  
  sway += dragAmount;
  
  float verticalBob = cos(phase * 0.6) * finalAmplitude * 0.15 * totalFlexibility;
  float roll = sin(phase * 0.7) * finalAmplitude * 0.3 * totalFlexibility;
  
  vec3 pos = position;
  pos.z += sway;
  pos.y += verticalBob;
  
  mat3 rZ = mat3(
    cos(roll), -sin(roll), 0.0,
    sin(roll),  cos(roll), 0.0,
    0.0,        0.0,       1.0
  );
  pos = rZ * pos;

  // Apply the instance matrix
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}