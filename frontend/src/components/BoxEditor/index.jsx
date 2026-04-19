import { Circle, Rect } from "react-konva";

/**
 * Renders 8 resize handles for a bounding-box annotation on the Konva Stage.
 * Must be placed inside a <Layer> that inherits the Stage's pan/zoom transform.
 *
 * @param {number[][]} points  - [[x1,y1],[x2,y2]] in image pixel coords
 * @param {number}     scale   - current stage scale
 * @param {function}   onChange - called with updated [[x1,y1],[x2,y2]]
 */
export default function BoxEditor({ points, scale, onChange }) {
  const HR = 7 / scale; // handle radius

  const [[rx1, ry1], [rx2, ry2]] = [
    [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1])],
    [Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1])],
  ];
  const cx = (rx1 + rx2) / 2;
  const cy = (ry1 + ry2) / 2;

  const handles = [
    { id: "tl", x: rx1, y: ry1 },
    { id: "tm", x: cx,  y: ry1 },
    { id: "tr", x: rx2, y: ry1 },
    { id: "ml", x: rx1, y: cy  },
    { id: "mr", x: rx2, y: cy  },
    { id: "bl", x: rx1, y: ry2 },
    { id: "bm", x: cx,  y: ry2 },
    { id: "br", x: rx2, y: ry2 },
  ];

  const applyDrag = (id, nx, ny) => {
    let [x1, y1, x2, y2] = [rx1, ry1, rx2, ry2];
    if (id === "tl") { x1 = nx; y1 = ny; }
    else if (id === "tm") { y1 = ny; }
    else if (id === "tr") { x2 = nx; y1 = ny; }
    else if (id === "ml") { x1 = nx; }
    else if (id === "mr") { x2 = nx; }
    else if (id === "bl") { x1 = nx; y2 = ny; }
    else if (id === "bm") { y2 = ny; }
    else if (id === "br") { x2 = nx; y2 = ny; }
    onChange([[Math.min(x1, x2), Math.min(y1, y2)], [Math.max(x1, x2), Math.max(y1, y2)]]);
  };

  return (
    <>
      <Rect
        x={rx1} y={ry1}
        width={rx2 - rx1}
        height={ry2 - ry1}
        stroke="#FFFFFF"
        strokeWidth={1.5 / scale}
        dash={[6 / scale, 3 / scale]}
        fill="rgba(255,255,255,0.07)"
        listening={false}
      />
      {handles.map((h) => (
        <Circle
          key={h.id}
          x={h.x} y={h.y}
          radius={HR}
          fill="#4488FF"
          stroke="#000000"
          strokeWidth={1 / scale}
          draggable
          onDragEnd={(e) => applyDrag(h.id, e.target.x(), e.target.y())}
        />
      ))}
    </>
  );
}
