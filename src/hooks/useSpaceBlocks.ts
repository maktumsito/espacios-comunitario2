import { useState, useEffect, useCallback } from 'react';
import { SpaceBlock } from '../types';
import {
  subscribeToSpaceBlocks,
  saveSpaceBlock,
  deleteSpaceBlock,
  getLocalCachedBlocks
} from '../services/spaceBlockService';

interface UseSpaceBlocksOptions {
  enabled?: boolean;
  startDate?: string;
  triggerSyncToast?: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export function useSpaceBlocks(options: UseSpaceBlocksOptions = {}) {
  const { triggerSyncToast, enabled = true, startDate } = options;
  const [spaceBlocks, setSpaceBlocks] = useState<SpaceBlock[]>(() => getLocalCachedBlocks());

  useEffect(() => {
    if (!enabled) { setSpaceBlocks([]); return; }
    const unsub = subscribeToSpaceBlocks(
      (blocks) => {
        setSpaceBlocks(blocks);
      },
      (err) => {
        console.warn('Error sincronizando bloqueos de espacios:', err);
      },
      startDate,
    );
    return () => unsub();
  }, [enabled, startDate]);

  const handleSaveBlock = useCallback(
    async (block: SpaceBlock) => {
      try {
        const saved = await saveSpaceBlock(block);
        setSpaceBlocks((prev) => {
          const idx = prev.findIndex((b) => b.id === saved.id);
          return idx >= 0 ? prev.map((b) => (b.id === saved.id ? saved : b)) : [saved, ...prev];
        });
        if (triggerSyncToast) {
          triggerSyncToast(
            block.id
              ? `Bloqueo de ${block.espacio} actualizado`
              : `Espacio ${block.espacio} bloqueado por ${block.motivo}`,
            'success'
          );
        }
        return saved;
      } catch (err: any) {
        if (triggerSyncToast) {
          triggerSyncToast(err?.message || 'Error al guardar bloqueo de espacio', 'error');
        }
        throw err;
      }
    },
    [triggerSyncToast]
  );

  const handleDeleteBlock = useCallback(
    async (id: string) => {
      try {
        await deleteSpaceBlock(id);
        setSpaceBlocks((prev) => prev.filter((b) => b.id !== id));
        if (triggerSyncToast) {
          triggerSyncToast('Bloqueo de espacio eliminado', 'success');
        }
      } catch (err: any) {
        if (triggerSyncToast) {
          triggerSyncToast(err?.message || 'Error al eliminar bloqueo', 'error');
        }
        throw err;
      }
    },
    [triggerSyncToast]
  );

  return {
    spaceBlocks,
    setSpaceBlocks,
    handleSaveBlock,
    handleDeleteBlock
  };
}
