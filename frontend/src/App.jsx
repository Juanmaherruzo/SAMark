import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Projects from "./pages/Projects";
import Annotator from "./pages/Annotator";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId/annotate" element={<Annotator />} />
      </Routes>
    </BrowserRouter>
  );
}
