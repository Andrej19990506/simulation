const STORAGE_KEY = 'kitchen-sim-profiles';
export const LAST_PROFILE_KEY = 'kitchen-sim-last-profile';
const AUTO_SAVE_KEY = 'kitchen-sim-auto';

export function getStoredProfiles() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

export function saveProfileToStorage(name, config) {
  const profiles = getStoredProfiles();
  profiles[name] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  localStorage.setItem(LAST_PROFILE_KEY, name);
}

export function loadProfileFromStorage(name) {
  return getStoredProfiles()[name] || null;
}

export function deleteProfileFromStorage(name) {
  const profiles = getStoredProfiles();
  delete profiles[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function getProfileNames() {
  return Object.keys(getStoredProfiles());
}

export function autoSave(configExtractor) {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(configExtractor()));
  } catch { /* quota exceeded */ }
}

export function loadAutoSave() {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
