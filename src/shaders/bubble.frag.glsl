uniform sampler2D uBubbleTex;
varying float vOpacity;

void main() {
    // Use texture2D with gl_PointCoord for circular sprites
    vec4 texColor = texture2D(uBubbleTex, gl_PointCoord);
    
    // Discard transparent pixels to avoid rendering artifacts
    if (texColor.a < 0.1) {
        discard;
    }
    
    // Apply opacity calculated in vertex shader
    gl_FragColor = vec4(texColor.rgb, texColor.a * vOpacity);
}
