import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClass, deleteClass, reorderClasses } from "../../api";
import { useAnnotatorStore } from "../../store";

export default function ClassManager() {
  const { projectId, classes, activeClassId, setActiveClass } = useAnnotatorStore();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#FF0000");
  const dragIdx = useRef(null);

  const add = useMutation({
    mutationFn: () => createClass(projectId, { name, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes", projectId] });
      setName("");
    },
  });

  const remove = useMutation({
    mutationFn: (id) => deleteClass(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes", projectId] }),
  });

  // --- Drag & drop reorder ---
  const handleDragStart = (e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e, targetIdx) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === targetIdx) return;

    const reordered = [...classes];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved);

    const order = reordered.map((cls, i) => ({ id: cls.id, yolo_index: i }));
    await reorderClasses(projectId, order);
    qc.invalidateQueries({ queryKey: ["classes", projectId] });
    dragIdx.current = null;
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  return (
    <div className="p-3 border-t border-gray-700 flex-1 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Classes</p>

      {classes.map((cls, i) => (
        <div
          key={cls.id}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, i)}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer mb-1 text-sm select-none
            ${cls.id === activeClassId ? "bg-accent" : "hover:bg-gray-800"}`}
          onClick={() => setActiveClass(cls.id)}
        >
          {/* Drag handle */}
          <span className="text-gray-600 text-xs cursor-grab">⠿</span>
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cls.color }} />
          <span className="flex-1 truncate">{cls.name}</span>
          <span className="text-gray-500 text-xs">{i + 1}</span>
          <button
            className="text-gray-600 hover:text-red-400 text-xs ml-1"
            onClick={(e) => { e.stopPropagation(); remove.mutate(cls.id); }}
          >
            x
          </button>
        </div>
      ))}

      <div className="mt-3 flex gap-1">
        <input
          className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs"
          placeholder="Class name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && add.mutate()}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer"
        />
      </div>
    </div>
  );
}
