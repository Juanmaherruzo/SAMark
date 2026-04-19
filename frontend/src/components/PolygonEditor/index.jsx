import { Circle, Line } from "react-konva";

/**
 * Renders vertex handles for a polygon annotation on the Konva Stage.
 * Must be placed inside a <Layer> that inherits the Stage's pan/zoom transform.
 *
 * @param {number[][]} points  - pixel-space [[x,y], ...] (image coordinates)
 * @param {number}     scale   - current stage scale (for constant on-screen handle sizes)
 * @param {function}   onChange - called with updated [[x,y], ...] on any edit
 */
export default function PolygonEditor({ points, scale, onChange }) {
  const VR = 7 / scale;   // vertex circle radius in image coords
  const MR = 4 / scale;   // midpoint circle radius

  const midpoints = points.map((pt, i) => {
    const next = points[(i + 1) % points.length];
    return [(pt[0] + next[0]) / 2, (pt[1] + next[1]) / 2];
  });

  return (
    <>
      {/* Polygon outline */}
      <Line
        points={points.flatMap(([x, y]) => [x, y])}
        closed
        stroke="#FFFFFF"
        strokeWidth={1.5 / scale}
        dash={[6 / scale, 3 / scale]}
        listening={false}
      />

      {/* Midpoint handles — click to insert a vertex */}
      {midpoints.map(([mx, my], i) => (
        <Circle
          key={`mid-${i}`}
          x={mx} y={my}
          radius={MR}
          fill="#888888"
          stroke="#FFFFFF"
          strokeWidth={1 / scale}
          onClick={() => {
            const next = [...points];
            next.splice(i + 1, 0, [mx, my]);
            onChange(next);
          }}
        />
      ))}

      {/* Vertex handles — drag to move, right-click to delete */}
      {points.map(([x, y], i) => (
        <Circle
          key={`v-${i}`}
          x={x} y={y}
          radius={VR}
          fill="#00FF88"
          stroke="#000000"
          strokeWidth={1 / scale}
          draggable
          onDragEnd={(e) => {
            const next = [...points];
            next[i] = [e.target.x(), e.target.y()];
            onChange(next);
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            if (points.length <= 3) return; // keep at least a triangle
            onChange(points.filter((_, j) => j !== i));
          }}
        />
      ))}
    </>
  );
}
