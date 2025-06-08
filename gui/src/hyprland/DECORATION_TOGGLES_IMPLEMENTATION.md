# Window Decoration Toggles Implementation

## Summary

Window decoration toggles have been successfully wired up to apply to all windows in real-time. The following decoration settings are now fully functional:

### Visual Decorations
1. **Rounding** - Corner radius for windows (0-20px)
2. **Blur** - Backdrop blur effect for transparency
3. **Drop Shadow** - Shadow effect for depth
4. **Shadow Range** - Size of the shadow effect (0-50px)

### Animation Settings
1. **Animations Enabled** - Toggle all window animations on/off
2. **Window Duration** - Transition duration for window movements (0-1000ms)
3. **Fade Duration** - Transition duration for fade effects (0-1000ms)

## Implementation Details

### 1. Extended Window Interface
Added new optional properties to `HyprlandWindow` interface:
```typescript
shadowRange?: number;
animationsEnabled?: boolean;
windowDuration?: number;
fadeDuration?: number;
```

### 2. Window Manager Updates
- Modified `createWindow()` to initialize new windows with current decoration settings from persistence
- Extended `updateVisualSettings()` to handle all decoration properties
- Settings are applied to all existing windows when changed

### 3. Window Component Updates
- Added reactive statements to call `updateVisualSettings()` when settings change
- Window styling now uses window-specific properties with fallbacks to local settings
- All decoration toggles auto-save to persistence and apply immediately

### 4. Settings Applied
The following settings in the DECORATION section now work:
- ✅ rounding - Applied to `border-radius`
- ✅ blur - Applied as `backdrop-filter: blur(8px)`
- ✅ drop_shadow - Toggles box-shadow
- ✅ shadow_range - Controls shadow size
- ✅ animations enabled - Toggles transition-duration
- ✅ window_duration - Sets transition duration
- ✅ fade_duration - Sets fade transition duration

## How It Works

1. When a user changes a decoration setting in the settings pane:
   - The value is saved to persistence via `statePersistence.updateSetting()`
   - `windowManager.updateVisualSettings()` is called with the new value
   - All existing windows are updated with the new property value

2. When creating new windows:
   - Current decoration settings are loaded from persistence
   - New windows are initialized with these settings

3. Window rendering:
   - Each window uses its own decoration properties
   - Falls back to local settings if window property is undefined
   - Styles are applied dynamically via inline styles

## Testing

To test the decoration toggles:
1. Open the settings window (Ctrl+S)
2. Navigate to the DECORATION section
3. Adjust any setting - changes apply immediately to all windows
4. Create new windows - they inherit current settings
5. Use RESET button to restore defaults

All decoration toggles now provide immediate visual feedback without requiring a restart or refresh.