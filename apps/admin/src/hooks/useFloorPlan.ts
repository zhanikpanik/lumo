import { useCallback, useEffect, useMemo, useState } from 'react';
import { getInstantClient } from '@/data/instant';
import { useInstantFloorPlan } from './useInstantFloorPlan';
import { useVenueId } from './useVenueId';
import type { FloorTable } from '../../types/floor-plan';

const GRID_COLS = 24;
const GRID_ROWS = 14;

interface ZoneItem {
  id: string;
  name: string;
}

export function useFloorPlan(zoneId: string | null) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const floorPlan = useInstantFloorPlan();
  const [tables, setTables] = useState<FloorTable[]>([]);

  const zones: ZoneItem[] = useMemo(
    () => floorPlan.data.map(({ id, name }) => ({ id, name })),
    [floorPlan.data],
  );
  const selectedZone = floorPlan.data.find((zone) => zone.id === zoneId);

  useEffect(() => {
    setTables((selectedZone?.tables ?? []).map((table) => ({
      id: table.id,
      name: table.number,
      shape: table.size.toLowerCase() === 'circle' ? 'circle' : 'square',
      x: table.col,
      y: table.row,
      width: table.colSpan,
      height: table.rowSpan,
      seats: table.capacity,
    })));
  }, [selectedZone]);

  const moveTable = useCallback((id: string, x: number, y: number) => {
    setTables((current) => current.map((table) => table.id === id ? { ...table, x, y } : table));
    void db.transact(db.tx.tables[id].update({ col: x, row: y }));
  }, [db]);

  const resizeTable = useCallback((id: string, width: number, height: number) => {
    const colSpan = Math.max(2, width);
    const rowSpan = Math.max(2, height);
    setTables((current) => current.map((table) => table.id === id
      ? { ...table, width: colSpan, height: rowSpan }
      : table));
    void db.transact(db.tx.tables[id].update({ colSpan, rowSpan }));
  }, [db]);

  const findEmptySpot = useCallback((currentTables: FloorTable[]) => {
    for (let y = 0; y <= GRID_ROWS - 2; y += 1) {
      for (let x = 0; x <= GRID_COLS - 2; x += 1) {
        const isOccupied = currentTables.some((table) => (
          x < table.x + (table.width || 2)
          && x + 2 > table.x
          && y < table.y + (table.height || 2)
          && y + 2 > table.y
        ));
        if (!isOccupied) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }, []);

  const getNextTableNumber = useCallback(() => {
    const numbers = tables.map((table) => Number.parseInt(table.name, 10)).filter(Number.isFinite);
    return String((numbers.length > 0 ? Math.max(...numbers) : 0) + 1);
  }, [tables]);

  const addTable = useCallback((name: string, shape: FloorTable['shape'], seats = 0) => {
    if (!zoneId) return;
    setTables((current) => {
      const spot = findEmptySpot(current);
      const numbers = current.map((table) => Number.parseInt(table.name, 10)).filter(Number.isFinite);
      const number = name.trim() || String((numbers.length > 0 ? Math.max(...numbers) : 0) + 1);
      const id = crypto.randomUUID();
      const table: FloorTable = {
        id,
        name: number,
        shape,
        x: spot.x,
        y: spot.y,
        width: 2,
        height: 2,
        seats,
      };
      void db.transact(
        db.tx.tables[id]
          .update({
            venueId,
            number,
            capacity: seats,
            col: spot.x,
            row: spot.y,
            colSpan: 2,
            rowSpan: 2,
            size: shape === 'circle' ? 'circle' : 'square',
            status: 'active',
            createdAt: new Date().toISOString(),
          })
          .link({ venue: venueId, zone: zoneId }),
      );
      return [...current, table];
    });
  }, [db, findEmptySpot, venueId, zoneId]);

  const removeTable = useCallback((id: string) => {
    setTables((current) => current.filter((table) => table.id !== id));
    void db.transact(db.tx.tables[id].delete());
  }, [db]);

  const updateTable = useCallback((id: string, updates: Partial<FloorTable>) => {
    setTables((current) => current.map((table) => table.id === id ? { ...table, ...updates } : table));
    const fields: Record<string, string | number> = {};
    if (updates.name !== undefined) fields.number = updates.name;
    if (updates.shape !== undefined) fields.size = updates.shape === 'circle' ? 'circle' : 'square';
    if (updates.seats !== undefined) fields.capacity = updates.seats;
    if (updates.x !== undefined) fields.col = updates.x;
    if (updates.y !== undefined) fields.row = updates.y;
    if (updates.width !== undefined) fields.colSpan = updates.width;
    if (updates.height !== undefined) fields.rowSpan = updates.height;
    if (Object.keys(fields).length > 0) void db.transact(db.tx.tables[id].update(fields));
  }, [db]);

  const createZone = useCallback(async (name: string): Promise<string> => {
    const id = crypto.randomUUID();
    await db.transact(
      db.tx.zones[id]
        .update({
          venueId,
          name: name.trim(),
          gridCols: GRID_COLS,
          gridRows: GRID_ROWS,
          sortOrder: zones.length,
          status: 'active',
          createdAt: new Date().toISOString(),
        })
        .link({ venue: venueId }),
    );
    return id;
  }, [db, venueId, zones.length]);

  const renameZone = useCallback(async (id: string, name: string) => {
    await db.transact(db.tx.zones[id].update({ name: name.trim() }));
  }, [db]);

  const deleteZone = useCallback(async (id: string) => {
    const zone = floorPlan.data.find((candidate) => candidate.id === id);
    await db.transact([
      ...(zone?.tables ?? []).map((table) => db.tx.tables[table.id].delete()),
      db.tx.zones[id].delete(),
    ]);
  }, [db, floorPlan.data]);

  return {
    tables,
    zones,
    moveTable,
    resizeTable,
    addTable,
    removeTable,
    updateTable,
    getNextTableNumber,
    createZone,
    renameZone,
    deleteZone,
  };
}
