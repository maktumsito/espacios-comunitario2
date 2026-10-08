// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const sdk=vi.hoisted(()=>({write:vi.fn(),commit:vi.fn()}));
vi.mock('../../firebase/gateway',async original=>({...await original<typeof import('../../firebase/gateway')>(),dataRequest:vi.fn(async()=>{throw new Error('write denied');})}));
vi.mock('../../firebase/config',()=>({getDb:()=>({})}));
vi.mock('firebase/firestore',()=>({doc:(_db:any,collection:string,id:string)=>({collection,id}),setDoc:sdk.write,deleteDoc:sdk.write,writeBatch:()=>({set:vi.fn(),delete:vi.fn(),commit:sdk.commit}),collection:vi.fn(),getDocs:vi.fn(),onSnapshot:vi.fn()}));
import { saveSpaceItem, getStoredSpaces } from '../adminConfigService';
import { saveEquipmentItem, getStoredEquipment } from '../equipmentService';
import { saveUserAccount, getAllAuthorizedUsers } from '../authService';
import { saveSpaceBlock, getLocalCachedBlocks } from '../spaceBlockService';
import { createDatabaseBackup, saveBackupScheduleConfig, getBackupScheduleConfig } from '../backupService';
beforeEach(()=> {localStorage.clear();vi.clearAllMocks();sdk.write.mockRejectedValue(new Error('write denied'));sdk.commit.mockRejectedValue(new Error('write denied'));});
it('does not confirm a rejected space in local storage',async()=> {
  const original=getStoredSpaces();await expect(saveSpaceItem({...original[0],id:'new-space',name:'NEW SPACE'})).rejects.toThrow('write denied');expect(getStoredSpaces()).toEqual(original);
});
it('does not confirm rejected equipment locally',async()=> {
  const original=getStoredEquipment();await expect(saveEquipmentItem({...original[0],id:'new-equipment'})).rejects.toThrow('write denied');expect(getStoredEquipment()).toEqual(original);
});
it('does not confirm a rejected account locally',async()=> {
  const original=getAllAuthorizedUsers();await expect(saveUserAccount({...original[0],username:'new-user',name:'New User'})).rejects.toThrow('write denied');expect(getAllAuthorizedUsers()).toEqual(original);
});
it('does not put a rejected maintenance block into the cache',async()=> {
  await expect(saveSpaceBlock({id:'new-block',espacio:'SALA 2',fechaInicio:'2026-10-06',fechaFin:'2026-10-06',motivo:'Mantención',todoElDia:true,activo:true} as any)).rejects.toThrow('write denied');expect(getLocalCachedBlocks().some(b=>b.id==='new-block')).toBe(false);
});

it('does not report a remotely rejected backup as successful', async()=> {
  await expect(createDatabaseBackup({tipo:'manual',customReservations:[]})).rejects.toThrow('write denied');
});
it('keeps backup configuration unchanged after a rejected write', async()=> {
  const original=getBackupScheduleConfig();
  await expect(saveBackupScheduleConfig({intervalDays:31})).rejects.toThrow('write denied');
  expect(getBackupScheduleConfig()).toEqual(original);
});
