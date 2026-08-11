import React, { useState } from 'react';
import { useInstantCategories } from '@/hooks/useInstantCategories';
import { useInstantProducts } from '@/hooks/useInstantProducts';
import { useInstantEmployees } from '@/hooks/useInstantEmployees';
import { useInstantFloorPlan } from '@/hooks/useInstantFloorPlan';
import { useInstantChecks } from '@/hooks/useInstantChecks';
import { useInstantShifts } from '@/hooks/useInstantShifts';
import { useInstantCashMovements } from '@/hooks/useInstantCashMovements';
import {
  useInstantCreateCategory,
  useInstantRenameCategory,
  useInstantDeleteCategory,
} from '@/hooks/useInstantCategoryMutations';

const s = (o: Record<string, unknown>) => JSON.stringify(o, null, 2);

export function InstantDbTest() {
  const cats = useInstantCategories();
  const prods = useInstantProducts();
  const emp = useInstantEmployees();
  const fp = useInstantFloorPlan();
  const checks = useInstantChecks();
  const shifts = useInstantShifts();
  const cash = useInstantCashMovements();
  const { create, loading: createLoading } = useInstantCreateCategory();
  const { rename, loading: renameLoading } = useInstantRenameCategory();
  const { remove, loading: deleteLoading } = useInstantDeleteCategory();

  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');

  return (
    <div style={{ padding: 24, color: '#fff', background: '#1A1A1A', minHeight: '100vh', fontFamily: 'monospace', fontSize: 13 }}>
      <h2 style={{ color: '#00C853', margin: '0 0 16px' }}>InstantDB — Sun Bar</h2>
      <p style={{ marginBottom: 16 }}><a href="/menu/categories" style={{ color: "#00C853" }}>→ Категории (реальная страница)</a></p>

      {/* ── CREATE ── */}
      <div style={{ marginBottom: 16, padding: 12, background: '#2C2C2C', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 8px', color: '#00C853' }}>Create Category</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create(newName).then(() => setNewName('')).catch(() => {})}
            placeholder="Name" disabled={createLoading}
            style={{ flex: 1, padding: '6px 10px', background: '#1A1A1A', color: '#fff', border: '1px solid #444', borderRadius: 4 }} />
          <button onClick={() => create(newName).then(() => setNewName('')).catch(() => {})}
            disabled={createLoading || !newName.trim()}
            style={{ padding: '6px 16px', background: '#00C853', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
            {createLoading ? '...' : 'Create'}
          </button>
        </div>
      </div>

      {/* ── LIST + EDIT/DELETE ── */}
      <div style={{ marginBottom: 16, padding: 12, background: '#2C2C2C', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 8px', color: '#00C853' }}>Categories ({cats.data.length})</h3>
        {cats.data.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #333' }}>
            {editId === c.id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && rename(c.id, editName).then(() => setEditId('')).catch(() => {})}
                  style={{ flex: 1, padding: '4px 8px', background: '#1A1A1A', color: '#fff', border: '1px solid #00C853', borderRadius: 4 }} />
                <button onClick={() => rename(c.id, editName).then(() => setEditId('')).catch(() => {})}
                  style={{ padding: '4px 10px', background: '#00C853', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Save
                </button>
                <button onClick={() => setEditId('')}
                  style={{ padding: '4px 10px', background: '#555', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{c.name}</span>
                <button onClick={() => { setEditId(c.id); setEditName(c.name); }}
                  style={{ padding: '2px 8px', background: '#444', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
                  Edit
                </button>
                <button onClick={() => remove(c.id).catch(() => {})}
                  disabled={deleteLoading}
                  style={{ padding: '2px 8px', background: '#D32F2F', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── STATS ── */}
      <pre style={{ color: '#999', fontSize: 11 }}>
        {s({ products: prods.data.length, dishes: prods.data.filter(p => p.kind === 'dish').length, ingredients: prods.data.filter(p => p.kind === 'ingredient').length, employees: emp.data.length, zones: fp.data.length, checks: checks.data.length, shifts: shifts.data.length, cash: cash.data.length })}
      </pre>
    </div>
  );
}
