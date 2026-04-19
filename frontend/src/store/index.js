import { create } from "zustand";

export const useAnnotatorStore = create((set, get) => ({
  // --- Project & image context ---
  projectId: null,
  taskType: "instance_segmentation",
  currentImage: null,
  setProject: (id) => set({ projectId: id }),
  setTaskType: (t) => set({ taskType: t }),
  setCurrentImage: (img) => {
    set({
      currentImage: img,
      pendingPoints: [], pendingMask: null, pendingScore: null, pendingBox: null, negativeBoxes: [],
      annotations: [],
      editingAnnotationId: null, editingData: null,
    });
  },

  // --- Image list (for gallery + keyboard navigation) ---
  images: [],
  setImages: (imgs) => set({ images: imgs }),
  navigateImage: (direction) => {
    const { images, currentImage } = get();
    if (!images.length) return;
    const idx = images.findIndex((i) => i.id === currentImage?.id);
    const next = images[(idx + direction + images.length) % images.length];
    get().setCurrentImage(next);
  },

  // --- Classes ---
  classes: [],
  activeClassId: null,
  setClasses: (cls) => {
    const update = { classes: cls };
    if (!get().activeClassId && cls.length) update.activeClassId = cls[0].id;
    set(update);
  },
  setActiveClass: (id) => set({ activeClassId: id }),

  // --- Annotations for the current image ---
  annotations: [],
  setAnnotations: (ann) => set({ annotations: ann }),
  addAnnotation: (ann) => set((s) => ({ annotations: [...s.annotations, ann] })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  updateAnnotation: (id, patch) =>
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  // --- Active tool ---
  tool: "sam",
  setTool: (t) => set({ tool: t }),

  // --- Pending SAM session (points + preview polygon) ---
  pendingPoints: [],
  pendingMask: null,   // pixel-space polygon [[x,y], ...]
  pendingScore: null,
  addPendingPoint: (pt) => set((s) => ({ pendingPoints: [...s.pendingPoints, pt] })),
  setPendingPoints: (pts) => set({ pendingPoints: pts }),
  setPendingMask: (polygon, score) => set({ pendingMask: polygon, pendingScore: score }),

  // --- Pending manual box (normalized [[x1,y1],[x2,y2]]) ---
  pendingBox: null,
  setPendingBox: (pts) => set({ pendingBox: pts }),

  // --- Negative boxes: pixel-space [{x1,y1,x2,y2}, ...] drawn with X tool ---
  negativeBoxes: [],
  addNegativeBox: (box) => set((s) => ({ negativeBoxes: [...s.negativeBoxes, box] })),
  clearNegativeBoxes: () => set({ negativeBoxes: [] }),

  clearPending: () =>
    set({ pendingPoints: [], pendingMask: null, pendingScore: null, pendingBox: null, negativeBoxes: [] }),

  // --- Editing an existing annotation ---
  editingAnnotationId: null,
  editingData: null,  // pixel-space points being edited
  setEditing: (id, pixelData) =>
    set({
      editingAnnotationId: id,
      editingData: pixelData,
      pendingPoints: [], pendingMask: null, pendingScore: null, pendingBox: null,
    }),
  updateEditingData: (data) => set({ editingData: data }),
  clearEditing: () => set({ editingAnnotationId: null, editingData: null }),

  // --- UI ---
  inferring: false,
  setInferring: (v) => set({ inferring: v }),
  selectedAnnotationId: null,
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
}));
