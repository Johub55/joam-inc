import React, { useState } from 'react';
import { ProductOption } from '../../types';
import { Sparkles, Plus, Trash2, CheckSquare, ListChecks } from 'lucide-react';

interface ProductOptionsEditorProps {
  options: ProductOption[];
  onChange: (nextOptions: ProductOption[]) => void;
  compact?: boolean;
}

interface KeuzemenuPreset {
  id: string;
  label: string;
  emoji: string;
  groupName: string;
  multipleSelection: boolean;
  choices: { name: string; priceAdjustment: number }[];
}

export const KEUZEMENU_PRESETS: KeuzemenuPreset[] = [
  {
    id: 'shake_smaken',
    label: 'WerkShake Smaken',
    emoji: '🥤',
    groupName: 'Kies je Shake Smaak',
    multipleSelection: false,
    choices: [
      { name: 'Aardbei', priceAdjustment: 0 },
      { name: 'Vanille', priceAdjustment: 0 },
      { name: 'Chocolade', priceAdjustment: 0 },
      { name: 'Banaan', priceAdjustment: 0 },
      { name: 'Oreo Special', priceAdjustment: 0.5 }
    ]
  },
  {
    id: 'mogu_smaken',
    label: 'Mogu Mogu / Frisdrank Smaken',
    emoji: '🧃',
    groupName: 'Kies Smaak',
    multipleSelection: false,
    choices: [
      { name: 'Lychee', priceAdjustment: 0 },
      { name: 'Aardbei', priceAdjustment: 0 },
      { name: 'Mango', priceAdjustment: 0 },
      { name: 'Druif', priceAdjustment: 0 },
      { name: 'Meloen', priceAdjustment: 0 }
    ]
  },
  {
    id: 'formaat',
    label: 'Formaat (Klein / Medium / Groot)',
    emoji: '📏',
    groupName: 'Kies Formaat',
    multipleSelection: false,
    choices: [
      { name: 'Klein', priceAdjustment: -0.5 },
      { name: 'Medium (Standaard)', priceAdjustment: 0 },
      { name: 'Groot (XL)', priceAdjustment: 0.9 }
    ]
  },
  {
    id: 'sauzen',
    label: 'Kies Saus',
    emoji: '🍟',
    groupName: 'Kies je Saus',
    multipleSelection: false,
    choices: [
      { name: 'WerkFritessaus', priceAdjustment: 0 },
      { name: 'Tomaten Ketchup', priceAdjustment: 0 },
      { name: 'Curry Saus', priceAdjustment: 0 },
      { name: 'Speciaal (Mayo + Curry + Uitjes)', priceAdjustment: 0.4 },
      { name: 'Truffel Mayo', priceAdjustment: 0.6 },
      { name: 'Zonder Saus', priceAdjustment: 0 }
    ]
  },
  {
    id: 'koffie_opties',
    label: 'Koffie & Melk Opties',
    emoji: '☕',
    groupName: 'Koffie & Melk Opties',
    multipleSelection: true,
    choices: [
      { name: 'Havermelk', priceAdjustment: 0.5 },
      { name: 'Extra Shot Espresso', priceAdjustment: 0.75 },
      { name: 'Karamel Siroop', priceAdjustment: 0.4 },
      { name: 'Slagroom', priceAdjustment: 0.5 }
    ]
  },
  {
    id: 'toppings',
    label: 'Extra Toppings (Meerdere)',
    emoji: '🧇',
    groupName: 'Extra Toppings',
    multipleSelection: true,
    choices: [
      { name: 'Warme Karamel', priceAdjustment: 0.6 },
      { name: 'Belgische Chocolade', priceAdjustment: 0.7 },
      { name: 'Slagroom', priceAdjustment: 0.5 },
      { name: 'Oreo Crumble', priceAdjustment: 0.6 }
    ]
  }
];

export const ProductOptionsEditor: React.FC<ProductOptionsEditorProps> = ({
  options,
  onChange,
  compact = false
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  // Keep raw text draft per choice so typing "0." or clearing to empty shows the translucent placeholder cleanly
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const makeUniqueId = () =>
    `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const handleAddEmptyGroup = () => {
    onChange([
      ...options,
      {
        id: makeUniqueId(),
        name: '',
        choices: [
          { name: '', priceAdjustment: 0 },
          { name: '', priceAdjustment: 0 }
        ],
        multipleSelection: false
      }
    ]);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = KEUZEMENU_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    onChange([
      ...options,
      {
        id: makeUniqueId(),
        name: preset.groupName,
        multipleSelection: preset.multipleSelection,
        choices: preset.choices.map(c => ({ ...c }))
      }
    ]);
    setSelectedPresetId('');
  };

  const getPriceInputValue = (optId: string, cIdx: number, val: number) => {
    const key = `${optId}_${cIdx}`;
    if (Object.prototype.hasOwnProperty.call(priceDrafts, key)) {
      return priceDrafts[key];
    }
    if (!val || val === 0) return '';
    return String(val);
  };

  const handlePriceInputChange = (optIdx: number, optId: string, cIdx: number, raw: string) => {
    const key = `${optId}_${cIdx}`;
    setPriceDrafts(prev => ({ ...prev, [key]: raw }));
    const normalized = raw.replace(',', '.').trim();
    const parsed = normalized === '' || normalized === '-' || normalized === '.' ? 0 : parseFloat(normalized);
    const safeNum = Number.isFinite(parsed) ? parsed : 0;

    onChange(
      options.map((g, idx) =>
        idx === optIdx
          ? {
              ...g,
              choices: g.choices.map((c, ci) =>
                ci === cIdx ? { ...c, priceAdjustment: safeNum } : c
              )
            }
          : g
      )
    );
  };

  return (
    <div className="space-y-3">
      {/* Header & Voorgemaakt Keuzemenu Kiezer */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-cyan-400" />
            <span>Keuzemenu &amp; Opties</span>
          </span>
          <p className="text-[11px] text-slate-400">
            Kies een voorgemaakt keuzemenu of maak zelf een nieuw keuzemenu aan.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddEmptyGroup}
          className="text-xs px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-black flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Lege Keuzegroep</span>
        </button>
      </div>

      {/* Voorgemaakt Keuzemenu Kiezen */}
      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Voorgemaakt Keuzemenu Toevoegen:</span>
          </span>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[220px]">
            <select
              value={selectedPresetId}
              onChange={e => {
                const val = e.target.value;
                if (val) handleApplyPreset(val);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="">-- Kies een voorgemaakt keuzemenu --</option>
              {KEUZEMENU_PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.label} ({p.choices.length} opties)
                </option>
              ))}
            </select>
          </div>
        </div>

        {!compact && (
          <div className="flex flex-wrap gap-1.5">
            {KEUZEMENU_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-[11px] font-bold text-slate-300 hover:text-cyan-200 transition flex items-center gap-1"
              >
                <span>{preset.emoji}</span>
                <span>+ {preset.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Optie Groepen Lijst */}
      {options.length === 0 ? (
        <div className="p-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-[11px] text-slate-500 text-center">
          Nog geen keuzemenu ingesteld. Kies hierboven een voorgemaakt keuzemenu of klik op &ldquo;Lege Keuzegroep&rdquo;.
        </div>
      ) : (
        <div className="space-y-3">
          {options.map((opt, oIdx) => (
            <div
              key={opt.id}
              className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/25 space-y-3 shadow-inner"
            >
              {/* Groep Instellingen Header */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pb-2.5 border-b border-slate-800/80">
                <div className="sm:col-span-6">
                  <label className="text-[10px] font-black uppercase tracking-wider text-cyan-300 block mb-1">
                    Titel van de keuzegroep (wat ziet de klant?)
                  </label>
                  <input
                    type="text"
                    value={opt.name}
                    onChange={e =>
                      onChange(
                        options.map((g, idx) =>
                          idx === oIdx ? { ...g, name: e.target.value } : g
                        )
                      )
                    }
                    placeholder="Bijv. Kies je smaak, Formaat of Saus..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white placeholder:text-slate-400/50 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Aantal keuzes
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 cursor-pointer hover:border-cyan-500/40 transition">
                    <input
                      type="checkbox"
                      checked={opt.multipleSelection}
                      onChange={e =>
                        onChange(
                          options.map((g, idx) =>
                            idx === oIdx ? { ...g, multipleSelection: e.target.checked } : g
                          )
                        )
                      }
                      className="rounded border-slate-600 bg-slate-950 text-cyan-400"
                    />
                    <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate font-semibold">
                      {opt.multipleSelection ? 'Meerdere kiezen' : '1 keuze tegelijk'}
                    </span>
                  </label>
                </div>

                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onChange(options.filter((_, idx) => idx !== oIdx))}
                    className="w-full sm:w-auto px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold flex items-center justify-center gap-1 transition"
                    title="Verwijder hele keuzegroep"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Verwijder</span>
                  </button>
                </div>
              </div>

              {/* Keuze Opties Kolomkoppen */}
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <div className="col-span-7">Naam van keuze-optie</div>
                  <div className="col-span-4">Meerprijs in € (leeg = gratis)</div>
                  <div className="col-span-1 text-center">Wis</div>
                </div>

                {opt.choices.map((ch, cIdx) => (
                  <div key={cIdx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <input
                        type="text"
                        value={ch.name}
                        onChange={e =>
                          onChange(
                            options.map((g, idx) =>
                              idx === oIdx
                                ? {
                                    ...g,
                                    choices: g.choices.map((c, ci) =>
                                      ci === cIdx ? { ...c, name: e.target.value } : c
                                    )
                                  }
                                : g
                            )
                          )
                        }
                        placeholder={
                          cIdx === 0
                            ? 'Bijv. Aardbei of Klein'
                            : cIdx === 1
                            ? 'Bijv. Vanille of Medium'
                            : 'Bijv. Chocolade of Groot'
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400/50 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="col-span-4 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-500 pointer-events-none">
                        €
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getPriceInputValue(opt.id, cIdx, ch.priceAdjustment)}
                        onChange={e => handlePriceInputChange(oIdx, opt.id, cIdx, e.target.value)}
                        placeholder="0.00 (bijv. 0.50)"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-6 pr-2 py-1.5 text-xs text-amber-300 font-mono placeholder:text-slate-400/45 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            options.map((g, idx) =>
                              idx === oIdx
                                ? { ...g, choices: g.choices.filter((_, ci) => ci !== cIdx) }
                                : g
                            )
                          )
                        }
                        className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded-lg transition"
                        title="Keuze verwijderen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      options.map((g, idx) =>
                        idx === oIdx
                          ? { ...g, choices: [...g.choices, { name: '', priceAdjustment: 0 }] }
                          : g
                      )
                    )
                  }
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold inline-flex items-center gap-1 transition mt-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Extra keuze toevoegen</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
