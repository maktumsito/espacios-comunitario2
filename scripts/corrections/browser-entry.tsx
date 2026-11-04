// Diagnostic bridge: real application hooks and services, real browser storage.
import * as firebase from '../../src/firebase/gateway';
import { mountDiagnosticProbe } from '../audit/browser-entry';

(window as any).__skipAutoMountAuditProbe = true;
mountDiagnosticProbe(firebase);
