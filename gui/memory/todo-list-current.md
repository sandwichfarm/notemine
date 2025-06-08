# Notemine GUI Todo List - Current Status

*Last updated: 2025-01-07*

## ✅ Completed Tasks (High Priority)

### Core Infrastructure & Bug Fixes
- [x] **Task #1**: Create relay index service with search functionality
- [x] **Task #2**: Add relay selection to feed configuration  
- [x] **Task #3**: Update subscription when feed changes
- [x] **Task #5**: Wire up all settings in settings pane - many values are fake and not actually used
- [x] **Task #6**: Bug: Fix mixed event handler syntax error in Window.svelte - convert on:keydown and on:blur to onkeydown and onblur
- [x] **Task #9**: Bug: sometimes after interface open a while, new composer (N) and close pane (Q) operations open/close >1 windows
- [x] **Task #10**: Fix move window to workspace - doesn't work properly, bad UX (pane disappears), should recalculate dimensions immediately and switch to target workspace
- [x] **Task #20**: Fix feeds pane relay functionality: 1) Remove confusing relay editing, 2) Populate minisearch from NIP-66 with R !auth filter, 3) Add selected relays to list and reset search
- [x] **Task #21**: Bug: fix key input lag for composers. If this is due to draft saving, please change the draft saving behavior slightly so that there isn't key entry lag.
- [x] **Task #23**: Bug: When moving a pane to another workspace, sometimes it takes two taps and then the workspace increments or decrements to workspaces.
- [x] **Task #26**: Bug: Move pane to workspace works on 1, 3-9, but does not work on workspace 2

### Nostr Protocol Implementation
- [x] **Task #29**: Figure out Applesauce pattern for zaps and reactions
- [x] **Task #30**: Make every nostr note zappable
- [x] **Task #31**: Add reactions to nostr events (including radio stations)
- [x] **Task #42**: Ephemeral chat: find user profiles (kind 0) and relay lists (kind 10002) using usermeta discovery relays
- [x] **Task #48**: Bug: When clicking zap, get 'event not found' error
- [x] **Task #49**: Implement proper NIP-25 (kind 7) reactions with support for custom emojis (NIP-30)
- [x] **Task #50**: When reacting, it is not clear to me that anything has happened. the UI needs to give feedback (for example, highlight the selected reaction(s) and/or some additional feedback)
- [x] **Task #52**: When interacting with content, use inbox/outbox model - when reacting/zapping, send to the author's inbox relays in addition to other relays
- [x] **Task #53**: Actually implement NostrConnect signing method
- [x] **Task #54**: Actually implement NIP-07 signing method  
- [x] **Task #55**: Bug: zap button loads indefinitely and never completes after clicking generate invoice
- [x] **Task #56**: Bug: when popping out a pane and then unpop it, window manager doesn't recalculate pane size correctly (too small on unpop, should be half pane not quarter pane)
- [x] **Task #57**: Bug: Zap button should be disabled if user doesn't support zaps (no lud16 in profile) - user should never see 'user does not support zaps' error

### UI/UX Enhancements  
- [x] **Task #8**: Investigate why no radio stations are loading from relays confirmed to have data (same relays that drive wavefunc.live)
- [x] **Task #11**: Implement NIP-66 driven minisearch (pkg, performant memory search) component that matches aesthetic
- [x] **Task #15**: Add ability to 'pop out' any tab (so that it is floating above everything)
- [x] **Task #17**: Radio: add scan action that browses through stations until scan is deactivated
- [x] **Task #18**: Radio: add 'next' action (only when scan is not active)
- [x] **Task #19**: Radio: when radio is active, add 'RADIO' with a simple animation and the name of the station (the station part should marquee if very long) in the workspace status bar at the bottom (where MINING:n SIGNER:y, etc, is)
- [x] **Task #25**: Add a pane for ephemeral chats (NIP at https://gist.github.com/ismyhc/e42abc83aa266e622bf253763d52dd6b). See https://coolr.chat for demo implementation
- [x] **Task #28**: Add a stop button to the radio - presently not possible to stop the radio

## ✅ Completed Tasks (Medium Priority)

### Feature Development
- [x] **Task #4**: Bring back fullscreen, removed because of hotkey conflict but that isn't enough justification
- [x] **Task #7**: Fix mining UI PoW target visualization - show correct binary representation, not hex zeros
- [x] **Task #12**: Configure radio station with default relays (nostr.band, damus, primal, wavefunc) and make them editable
- [x] **Task #16**: Add a view in the mining pane that shows previously mined notes, and an njump.me link with the NIP-19 encoded nevent: https://njump.me/nevent...
- [x] **Task #22**: Change MINING:n (where n is number of notes) to MINING:HASHRATE (where hashrate is k/m/ghs)
- [x] **Task #24**: Change default number of workers to availableCores/2
- [x] **Task #27**: For notes in feeds, instead of showing PoW:TRUE, show PoW:n where n is the difficulty (nonce tag[2])
- [x] **Task #32**: Show total zaps for each note in feed
- [x] **Task #33**: Show total zaps for each station when visible
- [x] **Task #34**: Show reactions for each note
- [x] **Task #35**: Show reactions for each station when visible
- [x] **Task #36**: Use favorites lists for stations as per wavefunc spec
- [x] **Task #38**: Add ability to favorite stations
- [x] **Task #44**: Add User Profile pane - initialized with npub/hex pubkey to show user profile
- [x] **Task #45**: When PoW is 0 (or undefined) do not show PoW in feed
- [x] **Task #46**: When PoW > 0, show the Pickaxe emoji and the Difficulty value (instead of PoW:n)
- [x] **Task #47**: Bug: When changing decorations in settings, changes only apply to settings pane until refresh

## ✅ Completed Tasks (Low Priority)

### Polish & Quality of Life
- [x] **Task #13**: Add more functionality to the relays pane that has hotkeys that are only active when it is focused
- [x] **Task #14**: Add tone.js, cypherpunk sounds mapped to actions, crisp/pleasant/not annoying, off by default, need sound settings pane
- [x] **Task #39**: Remove fake FM frequency display from radio

---

## 🚧 Pending Tasks (High Priority)

### Critical Bug Fixes
- [ ] **Task #51**: Bug: window algorithm breaks sometimes after workspace changes or changing workspaces (shows overlapping/broken layout)

## 🚧 Pending Tasks (Medium Priority)

### Feature Development & Polish
- [ ] **Task #37**: Add ability to select favorites from radio pane to change station
- [ ] **Task #41**: Ephemeral chat: mine chats by default (add kind 23333 to settings)
- [ ] **Task #43**: Ephemeral chat: add ability to create new room/channel
- [ ] **Task #58**: Add concept of pane orientation (landscape, portrait; when square goes defaults to one of them)
- [ ] **Task #59**: Pass pane orientation data to panes

## 🚧 Pending Tasks (Low Priority)

### Nice-to-Have Features
- [ ] **Task #40**: Make the radio waveforms actually work (currently faked) - PARTIAL: Optimized performance
- [ ] **Task #60**: Optimize radio waveform visualization to prevent blocking main thread - ✅ COMPLETED

---

## 📊 Progress Summary

- **Total Tasks**: 60
- **Completed**: 54 (90%)
- **Pending High Priority**: 1 (1.7%)
- **Pending Medium Priority**: 5 (8.3%)
- **Pending Low Priority**: 1 (1.7%)

## 🏆 Recent Major Accomplishments

### Performance Optimizations
- ✅ **Radio Waveform**: Optimized visualization with FPS limiting, frame skipping, and visibility detection
- ✅ **PoW Display**: Enhanced UI with pickaxe emoji for mined notes

### User Profile Implementation
- ✅ **Profile Pane**: Complete user profile viewer with npub/hex support
- ✅ **Profile Features**: Shows name, about, picture, NIP-05, website, and user's notes
- ✅ **Profile Discovery**: Automatic fetching from user metadata relays

### Settings & Window Management
- ✅ **Settings Persistence**: Fixed decoration changes to apply immediately without refresh
- ✅ **Window Borders**: Dynamic border updates across all panes when settings change

## 🎯 Next High Priority Items

1. **Task #51**: Fix window algorithm layout breaks after workspace changes
2. **Task #37**: Add favorites selection UI in radio pane
3. **Task #58-59**: Implement pane orientation concept for responsive layouts

---

*This todo list is actively maintained and reflects the current state of the Notemine GUI development project.*