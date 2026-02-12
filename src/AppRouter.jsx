import { Navigate, Route, Routes } from "react-router-dom";

import HomeApp from "./App.jsx";
import InstructorPage from "./pages/InstructorPage.jsx";
import ParticipantPage from "./pages/ParticipantPage.jsx";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeApp />} />
      <Route path="/instructor" element={<InstructorPage />} />
      <Route path="/participant" element={<ParticipantPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
