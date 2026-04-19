import { useState } from "react";
import { useAnnotatorStore } from "../../store";
import { exportProject } from "../../api";

const TOOLS = [
  { id: "sam",  label: "SAM",  key: "E" },
  { id: "box",  label: "Box",  key: "B" },
  { id: "hand", label: "Pan",  key: "H" },
];

const FORMATS = [
  { value: "yolo_seg", label: "YOLO-seg" },
  { value: "yolo_det", label: "YOLO-det" },
  { value: "coco",     label: "COCO" },
];

export default function PromptTools({ projectId }) {
  const { tool, setTool, inferring, currentImage, classes, activeClassId } =
    useAnnotatorStore();

  const [exportFormat, setExportFormat] = useState("yolo_seg");
  const [exporting, setExporting] = useState(false);

  const activeCls = classes.find((c) => c.id === activeClassId);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportProject(projectId, exportFormat, { train: 0.7, val: 0.2, test: 0.1 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project_${projectId}_${exportFormat}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Make sure the project has annotated images.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-panel border-b border-gray-700 text-sm flex-shrink-0">
      {/* Tool buttons */}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`px-3 py-1 rounded font-medium transition
            ${tool === t.id ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
          onClick={() => setTool(t.id)}
        >
          {t.label}
          <span className="text-gray-400 text-xs ml-1">[{t.key}]</span>
        </button>
      ))}

      {/* Active class chip */}
      {activeCls && (
        <div className="flex items-center gap-1.5 ml-2 px-2 py-1 bg-gray-800 rounded text-xs">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: activeCls.color }} />
          {activeCls.name}
        </div>
      )}

      {/* SAM spinner */}
      {inferring && (
        <span className="text-yellow-400 text-xs animate-pulse">Running SAM...</span>
      )}

      {/* Image info */}
      {currentImage && (
        <span className="text-gray-500 text-xs">
          {currentImage.filename} {currentImage.width}×{currentImage.height}
        </span>
      )}

      {/* Export controls — right side */}
      <div className="ml-auto flex items-center gap-1">
        <select
          className="bg-gray-700 rounded px-2 py-1 text-xs text-white"
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium disabled:opacity-50"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export"}
        </button>
      </div>
    </div>
  );
}
