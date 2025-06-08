# NostrConnect Implementation

This document describes the NostrConnect (NIP-46) signing method implementation in the Notemine GUI.

## Overview

NostrConnect allows remote signing by connecting to a signing service or device over the Nostr network. This implementation supports the NIP-46 protocol for secure remote signing while maintaining compatibility with the existing Applesauce-based architecture.

## Implementation Details

### Key Components

1. **KeyManager Enhancement** (`/src/lib/services/keys.ts`)
   - Added NostrConnect setup and management
   - URL parsing for both `nostrconnect://` and `bunker://` protocols
   - Proper cleanup of relay connections
   - Status tracking for connection state

2. **UI Integration** (`/src/lib/components/SigningMethodPicker.svelte`)
   - Enhanced UI for NostrConnect configuration
   - Real-time status feedback (connecting, connected, error)
   - User-friendly input validation and help text

### Technical Features

#### URL Support
- **nostrconnect://** protocol URLs
- **bunker://** protocol URLs (alias for nostrconnect)
- Query parameters: `relay`, `secret`
- Automatic fallback to default relays if none specified

#### Connection Management
- Dedicated relay pool for NostrConnect communication
- Proper subscription and publish method configuration
- Automatic cleanup on disconnect
- Status tracking with reactive stores

#### Error Handling
- Comprehensive error messages for connection failures
- URL parsing validation
- Graceful fallback and cleanup on errors
- User-friendly error display in UI

## Usage Examples

### Basic NostrConnect URL
```
nostrconnect://pubkey123?relay=wss://relay.damus.io&relay=wss://nos.lol
```

### With Secret (for authenticated connections)
```
nostrconnect://pubkey123?relay=wss://relay.damus.io&secret=secret123
```

### Bunker Protocol (alternative format)
```
bunker://pubkey123?relay=wss://relay.damus.io
```

## Code Structure

### New Methods in KeyManager

#### `setupNostrConnect(connectUrl: string)`
- Parses the NostrConnect URL
- Sets up relay pool for communication
- Creates NostrConnectSigner with proper subscribe/publish methods
- Handles connection status updates

#### `parseNostrConnectUrl(url: string)`
- Validates URL format
- Extracts pubkey, relay list, and optional secret
- Provides fallback relays if none specified

#### `cleanupNostrConnect()`
- Closes relay connections
- Cleans up resources
- Resets connection status

### UI Enhancements

#### Status Indicators
- **Connecting**: Yellow indicator during connection attempt
- **Connected**: Green indicator when successfully connected
- **Error**: Red indicator on connection failure

#### Input Validation
- Real-time URL format validation
- Helpful placeholder text with examples
- Clear error messages for invalid inputs

## Integration with Applesauce

The implementation leverages the existing Applesauce architecture:

- Uses `applesauce-signers` NostrConnectSigner
- Provides required subscribe/publish methods via nostr-tools SimplePool
- Maintains compatibility with existing signing workflows
- Follows the same patterns as other signing methods

## Testing

The implementation includes comprehensive error handling and has been tested with:
- Valid and invalid URL formats
- Connection success and failure scenarios
- Proper cleanup and resource management
- UI state management and feedback

## Security Considerations

- URLs with secrets are not stored in localStorage
- Relay connections are properly secured
- Error messages don't expose sensitive information
- Proper cleanup prevents resource leaks

## Future Enhancements

Potential improvements for future versions:
- QR code scanning for NostrConnect URLs
- Connection persistence across sessions (without storing secrets)
- Support for additional NIP-46 features
- Integration with hardware wallets
- Better discovery of NostrConnect services

## Dependencies

This implementation uses:
- `applesauce-signers`: NostrConnectSigner class
- `nostr-tools`: SimplePool for relay communication
- Existing KeyManager architecture
- Svelte reactive stores for state management

## Development Commands

To test the implementation:

```bash
# Start development server
npm run dev:no-relay

# Run tests
npm test

# Build for production
npm run build
```

The development server is available at: http://localhost:5174/

## Summary

This implementation provides a complete NostrConnect signing solution that:
- Supports standard NIP-46 URLs
- Integrates seamlessly with the existing architecture
- Provides excellent user experience with clear feedback
- Handles errors gracefully
- Maintains security best practices
- Is well-tested and production-ready