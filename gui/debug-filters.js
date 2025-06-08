// Debug script to check what filters are active
// Run this in the browser console to see what's causing the single note issue

console.log('=== FILTER DEBUG INFO ===');

// Check localStorage for saved filters
const nip01Filters = localStorage.getItem('notemine_nip01_filter_presets');
if (nip01Filters) {
  console.log('NIP-01 Filter Presets:', JSON.parse(nip01Filters));
}

const feedConfigs = localStorage.getItem('notemine-feed-configs');
if (feedConfigs) {
  console.log('Feed Configurations:', JSON.parse(feedConfigs));
}

// Check if stores are accessible
if (typeof window !== 'undefined' && window.$nip01FilterStore) {
  console.log('Active NIP-01 Filters:', window.$nip01FilterStore);
}

// Check for any other filter-related localStorage keys
const allKeys = Object.keys(localStorage);
const filterKeys = allKeys.filter(key => 
  key.includes('filter') || key.includes('feed') || key.includes('notemine')
);
console.log('All filter-related localStorage keys:', filterKeys);

filterKeys.forEach(key => {
  try {
    const value = localStorage.getItem(key);
    console.log(`${key}:`, JSON.parse(value));
  } catch (e) {
    console.log(`${key}:`, localStorage.getItem(key));
  }
});

console.log('=== END DEBUG INFO ===');