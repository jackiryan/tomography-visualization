uniform vec3 uSunDirection;
uniform vec3 uAtmColor;
uniform vec3 uAmbientColor;
uniform vec3 uSpecularColor;
uniform float uShininess;

varying vec3 vPosition;
varying vec3 vNormal;

const float pi = 3.1415926;

void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(0.0);
    // used for blinn-phong
    vec3 lightDir = normalize(uSunDirection - vPosition);
    // used for fresnel
    float sunOrientation = max(dot(uSunDirection, normal), 0.0);

    // Phong lighting components
    vec3 ambient = uAmbientColor;

    // Diffuse component (Lambertian reflectance)
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = uAtmColor * diff;

    // Specular component (Blinn-Phong reflection model)
    vec3 halfwayDir = normalize(lightDir + viewDirection);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
    vec3 specular = uSpecularColor * spec;

    // Combine Phong components
    vec3 phongColor = ambient + diffuse + specular;

    // create a sharp boundary between the lit/unlit halves of the sphere to act 
    // as a starting point for the radial atmospheric effect
    float dayMix = smoothstep(0.0, 0.01, sunOrientation);
    vec3 oceanColor = phongColor; // perhaps add some waviness at a later point if desired.
    color = mix(vec3(0.0), oceanColor, dayMix);

    // Fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 10.0);
    color = mix(color, uAtmColor, fresnel * dayMix / 2.0);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}