in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;

out vec3 vOrigin;
out vec3 vDirection;

#if NUM_CLIPPING_PLANES > 0 && ! defined(PHYSICAL) && ! defined(PHONG)
	out vec3 vViewPosition;
#endif

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    vOrigin = vec3(inverse(modelMatrix) * vec4(uCameraPos, 1.0)).xyz;
    vDirection = position - vOrigin;

    gl_Position = projectionMatrix * mvPosition;

    #if NUM_CLIPPING_PLANES > 0 && ! defined(PHYSICAL) && ! defined(PHONG)
        vViewPosition = -mvPosition.xyz;
    #endif
}