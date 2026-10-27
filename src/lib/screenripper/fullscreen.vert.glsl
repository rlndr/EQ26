#version 300 es
// One triangle that covers the whole viewport, generated from gl_VertexID so no vertex buffer
// is needed. Vertices land at (-1,-1), (3,-1), (-1,3); the parts outside clip away.
out vec2 vUv;

void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
