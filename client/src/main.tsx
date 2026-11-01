
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AuthGate from './AuthGate';
import StartingVillageGate from './StartingVillageGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <StartingVillageGate>
        <App />
      </StartingVillageGate>
    </AuthGate>
  </StrictMode>
);
