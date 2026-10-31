// Shared runtime state (populated from Owlbear Rodeo when available).
import type { Role } from './types';

export const appState = {
  playerName: '',
  playerColor: '#8b7cff',
  role: 'GM' as Role,
  /** True when running inside Owlbear Rodeo (false in a plain browser). */
  embedded: false,
  ready: false,
};
