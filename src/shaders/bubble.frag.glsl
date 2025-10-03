uniform sampler2D uBubbleTex;
varying float vOpacity;
varying vec2 vUv;

void main() {
    // Sample bubble texture using quad UVs
    vec4 texColor = texture2D(uBubbleTex, vUv);
    
    // Discard transparent pixels to avoid rendering artifacts
    if (texColor.a < 0.1) {
        discard;
    }
    
    // Apply opacity calculated in vertex shader
    gl_FragColor = vec4(texColor.rgb, texColor.a * vOpacity);
}
