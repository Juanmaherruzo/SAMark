import { useRef, useEffect, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from "react-konva";
import useImage from "use-image";
import { useQueryClient } from "@tanstack/react-query";
import { useAnnotatorStore } from "../../store";
import {
  predictFromPoints,
  createAnnotation,
  updateAnnotation as apiUpdateAnnotation,
  deleteAnnotation as apiDeleteAnnotation,
  getAnnotations,
} from "../../api";
import PolygonEditor from "../PolygonEditor";
import BoxEditor from "../BoxEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if annotation data represents a 2-point box [[x1,y1],[x2,y2]]. */
const isBox = (ann) => ann.data.length === 2;

/** Convert stage pointer to image pixel coords (undo pan + zoom). */
const toImageCoords = (stage, pointer) => ({
  x: (pointer.x - stage.x()) / stage.scaleX(),
  y: (pointer.y - stage.y()) / stage.scaleY(),
});

/**
 * Expand each negative point into a cross of 5 points (center + N/S/E/W).
 * Negative boxes are expanded into a 5×5 dense grid of 25 points.
 */
const NEG_GRID = 5; // grid dimension for negative boxes (5×5 = 25 points)

const buildSAMPoints = (points, negBoxes = []) => {
  const expanded = points.flatMap(({ x, y, label }) => [{ x, y, label }]);

  // Each negative box → 5×5 grid of negative points covering the rectangle
  for (const { x1, y1, x2, y2 } of negBoxes) {
    for (let row = 0; row < NEG_GRID; row++) {
      for (let col = 0; col < NEG_GRID; col++) {
        expanded.push({
          x: x1 + (x2 - x1) * (col / (NEG_GRID - 1)),
          y: y1 + (y2 - y1) * (row / (NEG_GRID - 1)),
          label: 0,
        });
      }
    }
  }

  return expanded;
};

// ---------------------------------------------------------------------------
// AnnotationOverlay — one confirmed annotation
// ---------------------------------------------------------------------------
function AnnotationOverlay({ annotation, classes, imgW, imgH, isSelected, onSelect, onEdit }) {
  const cls = classes.find((c) => c.id === annotation.class_id);
  const color = cls?.color ?? "#FF0000";

  if (isBox(annotation)) {
    const [[nx1, ny1], [nx2, ny2]] = annotation.data;
    return (
      <Rect
        x={nx1 * imgW} y={ny1 * imgH}
        width={(nx2 - nx1) * imgW}
        height={(ny2 - ny1) * imgH}
        fill={color + "33"}
        stroke={color}
        strokeWidth={isSelected ? 2.5 : 1.5}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onEdit}
      />
    );
  }

  const points = annotation.data.flatMap(([nx, ny]) => [nx * imgW, ny * imgH]);
  return (
    <Line
      points={points}
      closed
      fill={color + "55"}
      stroke={color}
      strokeWidth={isSelected ? 2.5 : 1.5}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
    />
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------
export default function AnnotatorCanvas() {
  const qc = useQueryClient();

  const {
    projectId, currentImage, taskType,
    tool, setTool,
    classes, activeClassId, setActiveClass,
    annotations, setAnnotations, addAnnotation, removeAnnotation,
    updateAnnotation: storeUpdateAnnotation,
    pendingPoints, pendingMask, pendingScore,
    addPendingPoint, setPendingPoints, setPendingMask, clearPending,
    pendingBox, setPendingBox,
    negativeBoxes, addNegativeBox,
    inferring, setInferring,
    selectedAnnotationId, setSelectedAnnotation,
    editingAnnotationId, editingData, setEditing, updateEditingData, clearEditing,
    navigateImage,
  } = useAnnotatorStore();

  const containerRef = useRef(null);
  const samAbortRef = useRef(null); // cancel in-flight SAM request when a new one starts
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [samError, setSamError] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Box drawing local state (tool="box" positive SAM constraint)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);

  // Negative box drawing local state (tool="neg-box")
  const [isNegDrawing, setIsNegDrawing] = useState(false);
  const [negDrawStart, setNegDrawStart] = useState(null);
  const [negDrawEnd, setNegDrawEnd] = useState(null);

  // --- Resize observer ---
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // --- Load background image ---
  const imageUrl = currentImage
    ? `/api/projects/${projectId}/images/${currentImage.id}/file`
    : null;
  const [bgImage] = useImage(imageUrl, "anonymous");

  // Fit image on load
  useEffect(() => {
    if (!bgImage || !currentImage) return;
    const fitScale = Math.min(stageSize.w / currentImage.width, stageSize.h / currentImage.height, 1) * 0.92;
    setScale(fitScale);
    setPos({
      x: (stageSize.w - currentImage.width * fitScale) / 2,
      y: (stageSize.h - currentImage.height * fitScale) / 2,
    });
  }, [bgImage, currentImage, stageSize.w, stageSize.h]);

  // --- Load annotations on image change ---
  useEffect(() => {
    if (!currentImage || !projectId) return;
    getAnnotations(projectId, currentImage.id).then(setAnnotations).catch(console.error);
  }, [currentImage?.id, projectId, setAnnotations]);

  // --- Wheel zoom ---
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const oldScale = stage.scaleX();
    const newScale = Math.max(0.1, Math.min(oldScale * factor, 20));
    setScale(newScale);
    setPos({
      x: pointer.x - ((pointer.x - stage.x()) / oldScale) * newScale,
      y: pointer.y - ((pointer.y - stage.y()) / oldScale) * newScale,
    });
  }, []);

  // --- Shared SAM runner (cancels previous in-flight request) ---
  const runSAM = useCallback(
    async (points) => {
      if (!currentImage) return;
      // Cancel any pending request
      if (samAbortRef.current) samAbortRef.current.abort();
      const controller = new AbortController();
      samAbortRef.current = controller;

      setInferring(true);
      try {
        const box = pendingBox ? [...pendingBox[0], ...pendingBox[1]] : null;
        const result = await predictFromPoints(currentImage.id, buildSAMPoints(points, negativeBoxes), box, controller.signal);
        const pixelPoly = result.polygon.map(([nx, ny]) => [nx * currentImage.width, ny * currentImage.height]);
        setPendingMask(pixelPoly, result.score);
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return; // expected on abort
        const detail = err?.response?.data?.detail ?? err?.message ?? "unknown error";
        console.error("SAM inference failed:", err);
        setPendingMask(null, null);
        setSamError(detail);
        setTimeout(() => setSamError(null), 4000);
      } finally {
        setInferring(false);
      }
    },
    [currentImage, pendingBox, negativeBoxes, setInferring, setPendingMask]
  );

  // --- SAM click handler ---
  const handleStageClick = useCallback(
    async (e) => {
      if (tool !== "sam" || !currentImage || editingAnnotationId) return;
      e.evt.preventDefault();

      const stage = e.target.getStage();
      const { x, y } = toImageCoords(stage, stage.getPointerPosition());
      const px = Math.max(0, Math.min(x, currentImage.width));
      const py = Math.max(0, Math.min(y, currentImage.height));

      const label = e.evt.button === 2 ? 0 : 1;
      const newPt = { x: px, y: py, label };
      addPendingPoint(newPt);
      await runSAM([...pendingPoints, newPt]);
    },
    [tool, currentImage, editingAnnotationId, pendingPoints, addPendingPoint, runSAM]
  );

  // --- Box drawing mouse handlers ---
  const handleMouseDown = useCallback(
    (e) => {
      if (!currentImage || editingAnnotationId || e.evt.button !== 0) return;
      const stage = e.target.getStage();
      const { x, y } = toImageCoords(stage, stage.getPointerPosition());
      if (tool === "box") {
        setIsDrawing(true);
        setDrawStart({ x, y });
        setDrawEnd({ x, y });
        clearPending();
      } else if (tool === "neg-box") {
        setIsNegDrawing(true);
        setNegDrawStart({ x, y });
        setNegDrawEnd({ x, y });
      }
    },
    [tool, currentImage, editingAnnotationId, clearPending]
  );

  const handleMouseMove = useCallback(
    (e) => {
      const stage = e.target.getStage();
      const { x, y } = toImageCoords(stage, stage.getPointerPosition());
      if (isDrawing && tool === "box") setDrawEnd({ x, y });
      if (isNegDrawing && tool === "neg-box") setNegDrawEnd({ x, y });
    },
    [isDrawing, isNegDrawing, tool]
  );

  const handleMouseUp = useCallback(
    async (e) => {
      const stage = e.target.getStage();
      const { x, y } = toImageCoords(stage, stage.getPointerPosition());

      if (isDrawing && tool === "box" && currentImage) {
        setIsDrawing(false);
        const x1 = Math.min(drawStart.x, x) / currentImage.width;
        const y1 = Math.min(drawStart.y, y) / currentImage.height;
        const x2 = Math.max(drawStart.x, x) / currentImage.width;
        const y2 = Math.max(drawStart.y, y) / currentImage.height;
        setDrawStart(null); setDrawEnd(null);
        if (Math.abs(x2 - x1) < 0.005 || Math.abs(y2 - y1) < 0.005) return;
        setPendingBox([[x1, y1], [x2, y2]]);
      }

      if (isNegDrawing && tool === "neg-box" && currentImage) {
        setIsNegDrawing(false);
        const x1 = Math.min(negDrawStart.x, x);
        const y1 = Math.min(negDrawStart.y, y);
        const x2 = Math.max(negDrawStart.x, x);
        const y2 = Math.max(negDrawStart.y, y);
        setNegDrawStart(null); setNegDrawEnd(null);
        if (Math.abs(x2 - x1) < 5 || Math.abs(y2 - y1) < 5) return;
        addNegativeBox({ x1, y1, x2, y2 });
        // Re-run SAM immediately with the new negative box
        if (pendingPoints.length > 0) {
          const updatedBoxes = [...negativeBoxes, { x1, y1, x2, y2 }];
          if (samAbortRef.current) samAbortRef.current.abort();
          const controller = new AbortController();
          samAbortRef.current = controller;
          setInferring(true);
          try {
            const box = pendingBox ? [...pendingBox[0], ...pendingBox[1]] : null;
            const result = await predictFromPoints(
              currentImage.id,
              buildSAMPoints(pendingPoints, updatedBoxes),
              box,
              controller.signal
            );
            const pixelPoly = result.polygon.map(([nx, ny]) => [nx * currentImage.width, ny * currentImage.height]);
            setPendingMask(pixelPoly, result.score);
          } catch (err) {
            if (err?.code !== "ERR_CANCELED" && err?.name !== "CanceledError") console.error(err);
          } finally {
            setInferring(false);
          }
        }
      }
    },
    [
      isDrawing, isNegDrawing, tool, currentImage,
      drawStart, negDrawStart, negativeBoxes, pendingPoints, pendingBox,
      setPendingBox, addNegativeBox, setInferring, setPendingMask,
    ]
  );

  // --- Edit annotation helper ---
  const handleEditAnnotation = useCallback(
    (ann) => {
      if (!currentImage) return;
      const pixelData = ann.data.map(([nx, ny]) => [nx * currentImage.width, ny * currentImage.height]);
      setEditing(ann.id, pixelData);
      setSelectedAnnotation(ann.id);
    },
    [currentImage, setEditing, setSelectedAnnotation]
  );

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = async (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      // --- Enter ---
      if (e.key === "Enter") {
        if (editingAnnotationId && editingData && currentImage) {
          // Save edited annotation
          const normData = editingData.map(([x, y]) => [
            x / currentImage.width,
            y / currentImage.height,
          ]);
          try {
            await apiUpdateAnnotation(projectId, currentImage.id, editingAnnotationId, { data: normData });
            storeUpdateAnnotation(editingAnnotationId, { data: normData });
          } catch (err) {
            console.error("Failed to save edit:", err);
          }
          clearEditing();
          return;
        }

        if (pendingBox && activeClassId && currentImage) {
          try {
            const ann = await createAnnotation(projectId, currentImage.id, {
              class_id: activeClassId,
              data: pendingBox,
            });
            addAnnotation(ann);
            qc.invalidateQueries({ queryKey: ["images"] });
            clearPending();
          } catch (err) {
            console.error("Failed to save box:", err);
            setSamError(err?.response?.data?.detail ?? "Failed to save box");
            setTimeout(() => setSamError(null), 4000);
          }
          return;
        }

        if (pendingMask && activeClassId && currentImage) {
          const normPoly = pendingMask.map(([x, y]) => [
            x / currentImage.width,
            y / currentImage.height,
          ]);
          const data =
            taskType === "object_detection"
              ? [[Math.min(...normPoly.map((p) => p[0])), Math.min(...normPoly.map((p) => p[1]))],
                 [Math.max(...normPoly.map((p) => p[0])), Math.max(...normPoly.map((p) => p[1]))]]
              : normPoly;
          try {
            const ann = await createAnnotation(projectId, currentImage.id, { class_id: activeClassId, data });
            addAnnotation(ann);
            qc.invalidateQueries({ queryKey: ["images"] });
            clearPending();
          } catch (err) {
            console.error("Failed to save annotation:", err);
            setSamError(err?.response?.data?.detail ?? "Failed to save annotation");
            setTimeout(() => setSamError(null), 4000);
          }
          return;
        }
        return;
      }

      // --- Undo last SAM point (Ctrl+Z or ArrowLeft) ---
      if ((e.key === "z" && e.ctrlKey) || e.key === "ArrowLeft") {
        if (pendingPoints.length === 0) return;
        e.preventDefault();
        const newPoints = pendingPoints.slice(0, -1);
        setPendingPoints(newPoints);
        if (newPoints.length === 0) {
          setPendingMask(null, null);
          return;
        }
        await runSAM(newPoints);
        return;
      }

      // --- Escape ---
      if (e.key === "Escape") {
        if (editingAnnotationId) { clearEditing(); return; }
        clearPending();
        setIsDrawing(false); setDrawStart(null); setDrawEnd(null);
        setIsNegDrawing(false); setNegDrawStart(null); setNegDrawEnd(null);
        return;
      }

      // --- Delete selected annotation ---
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId && currentImage) {
        try {
          await apiDeleteAnnotation(projectId, currentImage.id, selectedAnnotationId);
          removeAnnotation(selectedAnnotationId);
          setSelectedAnnotation(null);
          qc.invalidateQueries({ queryKey: ["images"] });
        } catch (err) {
          console.error("Failed to delete annotation:", err);
        }
        return;
      }

      // --- Navigation ---
      if (e.key === " ") { e.preventDefault(); navigateImage(e.shiftKey ? -1 : 1); return; }

      // --- Class shortcuts ---
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        const { classes: cls } = useAnnotatorStore.getState();
        if (cls[idx]) setActiveClass(cls[idx].id);
        return;
      }

      // --- Tool shortcuts ---
      if (e.key === "h" || e.key === "H") { setTool("hand");    return; }
      if (e.key === "e" || e.key === "E") { setTool("sam");     return; }
      if (e.key === "b" || e.key === "B") { setTool("box");     return; }
      if (e.key === "x" || e.key === "X") { setTool("neg-box"); return; }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    editingAnnotationId, editingData, currentImage, projectId, qc,
    pendingPoints, pendingBox, pendingMask, pendingScore, activeClassId, taskType,
    selectedAnnotationId,
    addAnnotation, removeAnnotation, storeUpdateAnnotation, clearPending, clearEditing,
    setPendingPoints, setPendingMask, setInferring, runSAM,
    navigateImage, setActiveClass, setTool, setSelectedAnnotation,
  ]);

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (!currentImage) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-500">Select an image from the gallery below</p>
      </div>
    );
  }

  // Compute pending box rect in pixel space for preview
  const pendingBoxPixel = (() => {
    if (isDrawing && drawStart && drawEnd) {
      return { x: drawStart.x, y: drawStart.y, w: drawEnd.x - drawStart.x, h: drawEnd.y - drawStart.y };
    }
    if (pendingBox) {
      const [[x1, y1], [x2, y2]] = pendingBox;
      return {
        x: x1 * currentImage.width,
        y: y1 * currentImage.height,
        w: (x2 - x1) * currentImage.width,
        h: (y2 - y1) * currentImage.height,
      };
    }
    return null;
  })();

  // Negative box preview while dragging
  const negBoxPreview = isNegDrawing && negDrawStart && negDrawEnd
    ? {
        x: Math.min(negDrawStart.x, negDrawEnd.x),
        y: Math.min(negDrawStart.y, negDrawEnd.y),
        w: Math.abs(negDrawEnd.x - negDrawStart.x),
        h: Math.abs(negDrawEnd.y - negDrawStart.y),
      }
    : null;

  const activeCls = classes.find((c) => c.id === activeClassId);
  const activeColor = activeCls?.color ?? "#FFFFFF";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900 relative overflow-hidden"
      style={{ cursor: tool === "neg-box" ? "crosshair" : undefined }}>
      {inferring && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="bg-yellow-500 text-black text-xs font-medium px-3 py-1 rounded-full animate-pulse">
            Running SAM...
          </span>
        </div>
      )}

      {samError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="bg-red-600 text-white text-xs font-medium px-3 py-1 rounded-full">
            SAM error: {samError}
          </span>
        </div>
      )}

      {/* Hint badge for pending SAM mask or pending box */}
      {(pendingMask || pendingBox) && !editingAnnotationId && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          {activeClassId ? (
            <span className="bg-black bg-opacity-70 text-green-400 text-xs px-2 py-1 rounded">
              {pendingMask && `score ${pendingScore?.toFixed(3)} · `}
              Enter to confirm · Esc to cancel
            </span>
          ) : (
            <span className="bg-orange-600 text-white text-xs font-medium px-2 py-1 rounded">
              No class selected — create one in the left panel first
            </span>
          )}
        </div>
      )}

      {/* Hint badge for editing mode */}
      {editingAnnotationId && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <span className="bg-black bg-opacity-70 text-blue-400 text-xs px-2 py-1 rounded">
            Editing · drag vertices · right-click to delete vertex · Enter save · Esc cancel
          </span>
        </div>
      )}

      <Stage
        width={stageSize.w}
        height={stageSize.h}
        scaleX={scale}
        scaleY={scale}
        x={pos.x}
        y={pos.y}
        draggable={tool === "hand" && !editingAnnotationId && !isNegDrawing}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onContextMenu={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
      >
        <Layer>
          {/* Background image */}
          {bgImage && <KonvaImage image={bgImage} />}

          {/* Confirmed annotations — skip the one currently being edited */}
          {annotations
            .filter((ann) => ann.id !== editingAnnotationId)
            .map((ann) => (
              <AnnotationOverlay
                key={ann.id}
                annotation={ann}
                classes={classes}
                imgW={currentImage.width}
                imgH={currentImage.height}
                isSelected={ann.id === selectedAnnotationId}
                onSelect={() => setSelectedAnnotation(ann.id)}
                onEdit={() => handleEditAnnotation(ann)}
              />
            ))}

          {/* Polygon editor overlay */}
          {editingAnnotationId && editingData && !isBox({ data: editingData }) && (
            <PolygonEditor
              points={editingData}
              scale={scale}
              onChange={updateEditingData}
            />
          )}

          {/* Box editor overlay */}
          {editingAnnotationId && editingData && isBox({ data: editingData }) && (
            <BoxEditor
              points={editingData}
              scale={scale}
              onChange={updateEditingData}
            />
          )}

          {/* SAM pending mask preview */}
          {pendingMask && (
            <Line
              points={pendingMask.flatMap(([x, y]) => [x, y])}
              closed
              fill={activeColor + "44"}
              stroke={activeColor}
              strokeWidth={1.5 / scale}
              dash={[6 / scale, 3 / scale]}
            />
          )}

          {/* SAM click prompt points */}
          {pendingPoints.map((pt, i) => (
            <Circle
              key={i}
              x={pt.x} y={pt.y}
              radius={5 / scale}
              fill={pt.label === 1 ? "#00FF88" : "#FF4444"}
              stroke="#000"
              strokeWidth={1 / scale}
            />
          ))}

          {/* Box draw preview (while dragging or pending confirmation) */}
          {pendingBoxPixel && (
            <Rect
              x={Math.min(pendingBoxPixel.x, pendingBoxPixel.x + pendingBoxPixel.w)}
              y={Math.min(pendingBoxPixel.y, pendingBoxPixel.y + pendingBoxPixel.h)}
              width={Math.abs(pendingBoxPixel.w)}
              height={Math.abs(pendingBoxPixel.h)}
              fill={activeColor + "33"}
              stroke={activeColor}
              strokeWidth={1.5 / scale}
              dash={[6 / scale, 3 / scale]}
            />
          )}

          {/* Confirmed negative boxes (red dashed) */}
          {negativeBoxes.map((nb, i) => (
            <Rect
              key={i}
              x={nb.x1} y={nb.y1}
              width={nb.x2 - nb.x1} height={nb.y2 - nb.y1}
              fill="#FF000022"
              stroke="#FF4444"
              strokeWidth={1.5 / scale}
              dash={[6 / scale, 3 / scale]}
            />
          ))}

          {/* Negative box drag preview */}
          {negBoxPreview && (
            <Rect
              x={negBoxPreview.x} y={negBoxPreview.y}
              width={negBoxPreview.w} height={negBoxPreview.h}
              fill="#FF000033"
              stroke="#FF4444"
              strokeWidth={1.5 / scale}
              dash={[4 / scale, 4 / scale]}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
