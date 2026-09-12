export interface LibraryUserState {
  favorites: string[];
  recent: string[];
  downloaded: string[];
}

const KEY = "vaiviral.editor-v2.library";
const empty = (): LibraryUserState => ({ favorites: [], recent: [], downloaded: [] });

export function loadLibraryUserState(): LibraryUserState {
  if (typeof localStorage === "undefined") return empty();
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return empty(); }
}

export function saveLibraryUserState(value: LibraryUserState): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(value));
}

export function markRecent(state: LibraryUserState, id: string): LibraryUserState {
  return { ...state, recent: [id, ...state.recent.filter((item) => item !== id)].slice(0, 30) };
}

export function toggleFavorite(state: LibraryUserState, id: string): LibraryUserState {
  const favorites = state.favorites.includes(id) ? state.favorites.filter((item) => item !== id) : [id, ...state.favorites];
  return { ...state, favorites };
}

