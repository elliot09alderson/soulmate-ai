import React, { useState } from 'react';
import VoiceChat from './components/VoiceChat';
import LiveKitVoiceChat from './components/LiveKitVoiceChat';
import Login from './components/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

// Main Application Content
function AppContent() {
  const [useLiveKit, setUseLiveKit] = useState(true);
  const { user, loading, userId, email, logout } = useAuth();

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">Connecting...</div>
      </div>
    );
  }

  // Show login if no user
  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-container">
      <header>
        <h1>Soulmate</h1>
        <p>Always here for you</p>
        <div className="user-info">
          <span className="user-email">{email || ''}</span>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
        <div className="mode-toggle">
          <button
            className={`toggle-btn ${!useLiveKit ? 'active' : ''}`}
            onClick={() => setUseLiveKit(false)}
          >
            Legacy
          </button>
          <button
            className={`toggle-btn ${useLiveKit ? 'active' : ''}`}
            onClick={() => setUseLiveKit(true)}
          >
            LiveKit
          </button>
        </div>
      </header>
      <main>
        {useLiveKit ? <LiveKitVoiceChat /> : <VoiceChat />}
      </main>
    </div>
  );
}

// Main Application Component with Auth Provider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
