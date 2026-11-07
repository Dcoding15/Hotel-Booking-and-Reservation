import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Header from './components/Header.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import Home from './pages/Home.jsx';
import HotelPage from './pages/HotelPage.jsx';
import Wallet from './pages/Wallet.jsx';
import Bookings from './pages/Bookings.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function Guard({ role, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="page muted">Loading…</p>;
  if (!user || user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/hotels/:hotelId" element={<HotelPage />} />
          <Route path="/wallet" element={<Guard role="customer"><Wallet /></Guard>} />
          <Route path="/bookings" element={<Guard role="customer"><Bookings /></Guard>} />
          <Route path="/admin/login" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<Guard role="admin"><AdminDashboard /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ChatWidget />
    </>
  );
}
