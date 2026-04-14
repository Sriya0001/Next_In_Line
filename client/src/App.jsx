import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import CareerPortal from './pages/CareerPortal';
import AdminPortal from './pages/AdminPortal';
import PipelineView from './pages/PipelineView';
import StatusLookup from './pages/StatusLookup';
import ApplicantStatus from './pages/ApplicantStatus';
import './index.css';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jobs" element={<CareerPortal />} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/admin/pipeline/:jobId" element={<PipelineView />} />
          <Route path="/status" element={<StatusLookup />} />
          <Route path="/status/:applicationId" element={<ApplicantStatus />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
