import React, { useEffect, useState } from 'react';
import {
  getActiveHardwareTerminalId,
  getConfiguredHardwareTerminals,
  HARDWARE_TERMINAL_EVENT,
  HardwareTerminalProfile,
  normalizeHardwareTerminalId,
  removeCustomHardwareTerminal,
  saveCustomHardwareTerminal,
  setActiveHardwareTerminalId,
} from '../../services/firebase';
import { Cpu, Plus, Trash2, Check } from 'lucide-react';

interface TerminalSelectorProps {
  value?: string;
  onChange?: (terminalId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
}

export const TerminalSelector: React.FC<TerminalSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  compact = false,
  label = 'Pinapparaat:',
  className = '',
}) => {
  const [terminals, setTerminals] = useState<HardwareTerminalProfile[]>(() =>
    getConfiguredHardwareTerminals()
  );
  const [internalId, setInternalId] = useState<string>(() =>
    value !== undefined ? normalizeHardwareTerminalId(value) : getActiveHardwareTerminalId()
  );
  const [showAdd, setShowAdd] = useState<boolean>(() => getConfiguredHardwareTerminals().length === 0);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const selectedId =
    value !== undefined ? normalizeHardwareTerminalId(value) : internalId;

  useEffect(() => {
    const sync = () => {
      const list = getConfiguredHardwareTerminals();
      setTerminals(list);
      const nextActive = getActiveHardwareTerminalId();
      setInternalId(nextActive);
      if (value !== undefined && !list.some((t) => t.id === normalizeHardwareTerminalId(value))) {
        onChange?.(nextActive);
      }
      if (list.length === 0) {
        setShowAdd(true);
      }
    };
    window.addEventListener(HARDWARE_TERMINAL_EVENT, sync);
    return () => window.removeEventListener(HARDWARE_TERMINAL_EVENT, sync);
  }, [value, onChange]);

  const handleSelect = (id: string) => {
    const norm = setActiveHardwareTerminalId(id);
    setInternalId(norm);
    onChange?.(norm);
  };

  const handleAddTerminal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeHardwareTerminalId(newId);
    if (!newId.trim() || !cleaned) return;
    const termLabel = newLabel.trim() || cleaned;
    const updated = saveCustomHardwareTerminal(cleaned, termLabel);
    setTerminals(updated);
    handleSelect(cleaned);
    setNewId('');
    setNewLabel('');
    setShowAdd(false);
  };

  const handleRemove = () => {
    if (!selectedId) return;
    const updated = removeCustomHardwareTerminal(selectedId);
    setTerminals(updated);
    const nextActive = getActiveHardwareTerminalId();
    setInternalId(nextActive);
    onChange?.(nextActive);
    if (updated.length === 0) {
      setShowAdd(true);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 shrink-0">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          {!compact && <span>{label}</span>}
        </div>

        {terminals.length > 0 ? (
          <select
            value={selectedId}
            disabled={disabled}
            onChange={(e) => handleSelect(e.target.value)}
            className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            title="Kies welk zelf ingesteld Pico W pinapparaat gebruikt wordt"
          >
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.id})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex-1 min-w-[160px] bg-amber-950/30 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-amber-200">
            Nog geen pinapparaat ingesteld
          </div>
        )}

        {!disabled && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[11px] font-bold flex items-center gap-1 transition"
            title="Pinapparaat zelf toevoegen"
          >
            <Plus className="w-3.5 h-3.5" />
            {terminals.length === 0 && <span>Instellen</span>}
          </button>
        )}

        {!disabled && selectedId && terminals.length > 0 && (
          <button
            type="button"
            onClick={handleRemove}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-rose-400 transition"
            title="Verwijder dit pinapparaat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showAdd && !disabled && (
        <form
          onSubmit={handleAddTerminal}
          className="p-2.5 rounded-xl bg-slate-950 border border-cyan-500/30 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs"
        >
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="Eigen Terminal-ID (bijv. kassa_1)"
            required
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Naam (bijv. Balie Links)"
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black flex items-center justify-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Opslaan</span>
          </button>
        </form>
      )}
    </div>
  );
};
