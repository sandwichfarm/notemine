package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/fiatjaf/eventstore/lmdb"
	"github.com/fiatjaf/khatru"
	"github.com/nbd-wtf/go-nostr"
	"github.com/sandwichfarm/notemine/relay/internal/pow"
	"github.com/sandwichfarm/notemine/relay/internal/retention"
)

const (
	// MinPOWDifficulty is the minimum POW required for events
	MinPOWDifficulty = 16

	// PruneInterval is how often to run the retention pruning
	PruneInterval = 1 * time.Hour

	// RelayName for NIP-11
	RelayName = "notemine relay"
	RelayDescription = "A proof-of-work first nostr relay with POW-based retention"
	RelayPubkey = "" // Set your relay operator pubkey here
)

func main() {
	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "3334"
	}

	// Get database path from environment or use default
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/relay.lmdb"
	}

	// Initialize LMDB store
	log.Printf("[Relay] Initializing LMDB store at %s", dbPath)
	db := &lmdb.LMDBBackend{
		Path: dbPath,
	}
	if err := db.Init(); err != nil {
		log.Fatalf("[Relay] Failed to initialize LMDB: %v", err)
	}

	// Create retention manager
	retentionMgr := retention.NewManager(db)

	// Create relay instance
	relay := khatru.NewRelay()
	relay.Info.Name = RelayName
	relay.Info.Description = RelayDescription
	relay.Info.PubKey = RelayPubkey
	relay.Info.Software = "https://github.com/sandwichfarm/notemine"
	relay.Info.Version = "0.1.0"
	relay.Info.SupportedNIPs = []int{1, 9, 11, 13, 16, 20, 33}

	// Set up POW validation hook
	relay.RejectEvent = append(relay.RejectEvent, func(ctx context.Context, event *nostr.Event) (bool, string) {
		// Reject events without sufficient POW for kind 1
		if event.Kind == 1 {
			if !pow.HasValidPOW(event, MinPOWDifficulty) {
				difficulty := pow.GetDifficulty(event)
				return true, fmt.Sprintf("insufficient POW: got %d, required %d", difficulty, MinPOWDifficulty)
			}
		}

		// Allow reactions (kind 7) with any POW
		// Allow other kinds
		return false, ""
	})

	// Set up storage hooks
	relay.StoreEvent = append(relay.StoreEvent, func(ctx context.Context, event *nostr.Event) error {
		return db.SaveEvent(ctx, event)
	})

	relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
		return db.QueryEvents(ctx, filter)
	})

	relay.DeleteEvent = append(relay.DeleteEvent, func(ctx context.Context, event *nostr.Event) error {
		return db.DeleteEvent(ctx, event)
	})

	// Start retention pruning goroutine
	go func() {
		ticker := time.NewTicker(PruneInterval)
		defer ticker.Stop()

		// Run immediately on startup
		log.Printf("[Relay] Running initial retention pruning...")
		if err := retentionMgr.PruneKind1Events(context.Background()); err != nil {
			log.Printf("[Relay] Retention pruning error: %v", err)
		}

		// Then run periodically
		for range ticker.C {
			log.Printf("[Relay] Running periodic retention pruning...")
			if err := retentionMgr.PruneKind1Events(context.Background()); err != nil {
				log.Printf("[Relay] Retention pruning error: %v", err)
			}
		}
	}()

	// Start relay server
	portInt, err := strconv.Atoi(port)
	if err != nil {
		log.Fatalf("[Relay] Invalid port: %v", err)
	}

	log.Printf("[Relay] Starting notemine relay on port %d", portInt)
	log.Printf("[Relay] Min POW difficulty: %d", MinPOWDifficulty)
	log.Printf("[Relay] Max kind 1 events: %d", retention.MaxKind1Events)
	log.Printf("[Relay] Pruning interval: %v", PruneInterval)

	if err := relay.Start("0.0.0.0", portInt); err != nil {
		log.Fatalf("[Relay] Failed to start relay: %v", err)
	}
}
