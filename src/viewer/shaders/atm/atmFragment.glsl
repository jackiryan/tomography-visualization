uniform vec3 uDayColor;
uniform float uAtmFalloff;

varying vec3 vNormal;
varying vec3 vPosition;

const float pi = 3.1415926;

void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(1.0);
    
    float edgeAlpha = dot(viewDirection, normal);
    edgeAlpha = smoothstep(0.0, 0.5, edgeAlpha);
    float alpha = pow(edgeAlpha, uAtmFalloff);

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}