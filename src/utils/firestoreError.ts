/**
 * firestoreError.ts
 *
 * Centralised Firestore error handling, extracted from App.tsx as part of the
 * Phase 4 breakup so hooks extracted out of App.tsx (e.g. useIntegrations)
 * can share it without duplicating the logic.
 */
import { auth } from '../firebase';

/** Enumerates the type of Firestore operation being performed. */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Structured error payload captured when a Firestore operation fails.
 * Includes the raw error message, operation type, collection path,
 * and a snapshot of the currently authenticated user's state.
 */
export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

/**
 * Serialises the error together with current auth context into a
 * `FirestoreErrorInfo` JSON blob, logs it to the console, then re-throws so
 * that the top-level ErrorBoundary can surface it to the user.
 *
 * @param error         - The raw caught error value.
 * @param operationType - The CRUD operation that failed.
 * @param path          - The Firestore document/collection path being accessed, or null.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
