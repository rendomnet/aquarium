uniform float uTime;
uniform float uSwimSpeed;  // Fish's actual swimming speed
uniform float uTurnAmount;  // How much the fish is turning
uniform float uDragStrength;  // Drag strength from config
uniform float uSpeedMin, uSpeedMax;  // Speed response range
uniform float uAmpMin, uAmpMax;  // Amplitude range
uniform int uPartCount;
uniform float uParts[54]; // 6 parts × 9 values each
uniform float uGridProps[7]; // [row1, row2, row3, col1, col2, col3, col4] proportions
varying vec2 vUv;
varying vec3 vWorldPos;  // World position for caustics

void main() {
  vUv = uv;
  
  // PHYSICS-BASED APPROACH:
  // 1. Distance from spine (center) - spine is rigid, edges are flexible
  float distFromSpine = abs(vUv.y - 0.5) * 2.0;  // 0 = spine, 1 = edge
  
  // 2. Position along body - uv.x=0 is tail, uv.x=1 is head (texture faces right)
  float bodyPosition = vUv.x;  // 0 = tail, 1 = head (NO FLIP!)
  
  // 3. Spine constraint - center line stays rigid
  float spineConstraint = distFromSpine;  // 0 at spine, 1 at edges
  
  // 4. Anatomical part system - check which part this vertex belongs to
  float partModifier = 0.0;
  float finalSpeed = 1.0;
  float finalAmplitude = 0.0;
  float finalFrequency = 1.0;
  float finalPhase = 0.0;
  
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
    // Cols: left to right (col 1, 2, 3, 4)
    float col1End = uGridProps[3];
    float col2End = col1End + uGridProps[4];
    float col3End = col2End + uGridProps[5];
    
    // Calculate UV bounds for this part
    float rowMin, rowMax, colMin, colMax;
    
    // Row bounds (inverted: row 1=top, row 2=center, row 3=bottom)
    if (maxRow == 1.0) rowMin = row2End;
    else if (maxRow == 2.0) rowMin = row1End;
    else rowMin = 0.0;
    
    if (minRow == 1.0) rowMax = 1.0;
    else if (minRow == 2.0) rowMax = row2End;
    else rowMax = row1End;
    
    // Col bounds (4 columns now)
    if (minCol == 1.0) colMin = 0.0;
    else if (minCol == 2.0) colMin = col1End;
    else if (minCol == 3.0) colMin = col2End;
    else colMin = col3End;
    
    if (maxCol == 1.0) colMax = col1End;
    else if (maxCol == 2.0) colMax = col2End;
    else if (maxCol == 3.0) colMax = col3End;
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
      
      // Accumulate part properties (weighted by influence)
      if (influence > partModifier) {
        partModifier = flexibility * influence;
        finalSpeed = speed;
        finalAmplitude = amplitude;
        finalFrequency = frequency;
        finalPhase = phaseOffset;
      }
    }
  }
  
  // 5. Apply physics constraints to part flexibility
  // Part flexibility is PRIMARY, spine constraint prevents center from moving too much
  float totalFlexibility = partModifier * spineConstraint;
  
  // 6. Apply animation modulated by swimming speed
  // Tail base (muscular) responds MORE to speed, tail fin (passive) responds LESS
  // Calculate grid boundaries for tail detection
  float gridCol1End = uGridProps[3];
  float gridCol2End = gridCol1End + uGridProps[4];
  
  // Determine if this is tail base (col 2) or tail fin (col 1) based on position
  float isTailBase = (vUv.x > gridCol1End && vUv.x < gridCol2End) ? 1.0 : 0.0;
  float isTailFin = (vUv.x < gridCol1End) ? 1.0 : 0.0;
  
  // Tail base gets strong speed modulation, tail fin gets weak modulation
  // Use config values for min/max ranges
  float speedModulator = clamp(uSpeedMin + uSwimSpeed * (0.5 + isTailBase * 0.8), uSpeedMin, uSpeedMax);
  float phase = uTime * finalSpeed * speedModulator + vUv.x * finalFrequency + finalPhase;
  
  // Main tail sway - side to side (Z axis)
  // Tail base amplitude increases with speed, tail fin stays more constant
  float amplitudeModulator = clamp(uAmpMin + uSwimSpeed * (0.4 + isTailBase * 0.6), uAmpMin, uAmpMax);
  float sway = sin(phase) * finalAmplitude * totalFlexibility * amplitudeModulator;
  
  // Add drag/lag effect - tail lags behind when turning
  // The farther from the head (lower vUv.x), the more lag
  float dragAmount = (1.0 - vUv.x) * uTurnAmount * totalFlexibility * uDragStrength;
  sway += dragAmount;
  
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

  // Calculate world position for caustics
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
