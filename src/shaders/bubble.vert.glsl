uniform float uTime;
uniform float uScreenTop;
uniform float uEmitterY;

attribute vec3 instancePosition;
attribute float instanceScale;
attribute float instanceRiseSpeed;
attribute float instanceWobbleSpeed;
attribute float instanceWobbleAmount;
attribute float instancePhase;
attribute float instanceStartX;

varying float vOpacity;
varying float vScale;
varying vec2 vUv;

void main() {
    float totalHeight = uScreenTop - uEmitterY;
    
    // Calculate elapsed time for this bubble's animation cycle
    float elapsedTime = mod(uTime * instanceRiseSpeed + instancePhase, totalHeight / instanceRiseSpeed);
    
    // Current Y position based on rise speed
    float currentY = uEmitterY + elapsedTime * instanceRiseSpeed;
    
    // Wobble effect
    float wobble = sin(uTime * instanceWobbleSpeed) * instanceWobbleAmount;
    float currentX = instanceStartX + wobble;
    
    // Final position for this instance
    vec3 newPosition = vec3(currentX, currentY, instancePosition.z);
    
    // Calculate opacity based on height (fade in at bottom, fade out at top)
    float heightRatio = (currentY - uEmitterY) / totalHeight;
    vOpacity = sin(heightRatio * 3.14159) * 0.8; // Smooth fade in/out, max opacity 0.8
    
    // Calculate scale - bubbles expand as they rise
    vScale = instanceScale * (1.0 + heightRatio * 0.3);
    
    // Final vertex position
    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    mvPosition.xy += position.xy * vScale; // Apply billboard scaling
    
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
}
