import React, { useState, useEffect } from 'react';
import { showToast } from '../../services/appToast';

export const LinkCardModal: React.FC<{ onClose: () => void; username: string }> = ({ onClose, username }) => {
  const [status, setStatus] = useState('Terminal activeren...');

  useEffect(() => {
    const startLinkMode = async () => {
      try {
        const response = await fetch('/api/hardware/set-link-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
        
        if (response.ok) {
          setStatus('Scan nu de pas op de terminal...');
        } else {
          setStatus('Fout bij activeren terminal');
          showToast('Kon de terminal niet in koppelmodus zetten.', 'error');
        }
      } catch (e) {
        setStatus('Server verbinding fout');
        showToast('Fout bij verbinden met de server.', 'error');
      }
    };
    startLinkMode();
  }, [username]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-purple-500/50 p-6 rounded-2xl w-full max-w-sm text-white">
        <h2 className="text-xl font-black mb-1">NFC Pas Koppelen</h2>
        <p className="text-sm text-slate-400 mb-6">Voor gebruiker: <b>{username}</b></p>
        
        <div className="bg-slate-950 p-6 rounded-xl mb-4 border border-slate-800 text-center text-md font-mono text-purple-300 animate-pulse">
          {status}
        </div>

        <button onClick={onClose} className="w-full p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition">
          Sluiten
        </button>
      </div>
    </div>
  );
};
