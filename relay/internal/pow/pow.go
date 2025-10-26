package pow

import (
	"encoding/hex"
	"fmt"
	"math/bits"

	"github.com/nbd-wtf/go-nostr"
)

// GetDifficulty calculates the POW difficulty of an event (NIP-13)
// Returns the number of leading zero bits in the event ID
func GetDifficulty(event *nostr.Event) int {
	if event == nil || event.ID == "" {
		return 0
	}

	// Decode hex ID to bytes
	idBytes, err := hex.DecodeString(event.ID)
	if err != nil {
		return 0
	}

	count := 0
	for _, b := range idBytes {
		if b == 0 {
			count += 8
			continue
		}
		// Count leading zeros in the byte
		count += bits.LeadingZeros8(b)
		break
	}

	return count
}

// HasValidPOW checks if an event has a valid POW nonce tag
func HasValidPOW(event *nostr.Event, minDifficulty int) bool {
	if event == nil {
		return false
	}

	// Check for nonce tag
	hasNonce := false
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "nonce" {
			hasNonce = true
			break
		}
	}

	if !hasNonce {
		return false
	}

	// Verify difficulty meets minimum
	difficulty := GetDifficulty(event)
	return difficulty >= minDifficulty
}

// GetTargetDifficulty extracts the target difficulty from the nonce tag
func GetTargetDifficulty(event *nostr.Event) (int, error) {
	if event == nil {
		return 0, fmt.Errorf("event is nil")
	}

	for _, tag := range event.Tags {
		if len(tag) >= 3 && tag[0] == "nonce" {
			var target int
			_, err := fmt.Sscanf(tag[2], "%d", &target)
			if err != nil {
				return 0, err
			}
			return target, nil
		}
	}

	return 0, fmt.Errorf("no nonce tag found")
}
