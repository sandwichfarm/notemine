package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "strconv"
    "strings"
    "time"

    "github.com/fiatjaf/eventstore/lmdb"
    "github.com/fiatjaf/khatru"
    "github.com/nbd-wtf/go-nostr"
    "github.com/nbd-wtf/go-nostr/nip11"
    "github.com/sandwichfarm/notemine/relay/internal/pow"
    "github.com/sandwichfarm/notemine/relay/internal/retention"
    "github.com/sandwichfarm/notemine/relay/internal/scoring"
)

const (
	// MinPOWDifficulty is the minimum POW required for events
	MinPOWDifficulty = 16

	// PruneInterval is how often to run the retention pruning
	PruneInterval = 1 * time.Hour

	// RelayName for NIP-11
	RelayName = "notemine.io"
	RelayDescription = "novel pow relay"
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

    // Configure and create scoring manager
    reportWeight := 1.0
    if rw := os.Getenv("REPORT_WEIGHT"); rw != "" {
        if f, err := strconv.ParseFloat(rw, 64); err == nil {
            reportWeight = f
        }
    }
    debugScoring := strings.EqualFold(os.Getenv("SCORING_DEBUG"), "1") || strings.EqualFold(os.Getenv("SCORING_DEBUG"), "true")

    scorer := scoring.NewScorer(scoring.Config{
        ReportWeight:     reportWeight,
        MinPowDifficulty: MinPOWDifficulty,
        Debug:            debugScoring,
    })

	// Create relay instance
	relay := khatru.NewRelay()
	relay.Info.Name = RelayName
	relay.Info.Description = RelayDescription
	relay.Info.PubKey = RelayPubkey
	relay.Info.Software = "https://github.com/sandwichfarm/notemine"
	relay.Info.Version = "0.1.0"
	relay.Info.SupportedNIPs = []int{1, 9, 11, 13, 16, 20, 33}

	// Set limitations for NIP-11
	relay.Info.Limitation = &nip11.RelayLimitationDocument{
		MinPowDifficulty: MinPOWDifficulty,
	}

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
        if err := db.SaveEvent(ctx, event); err != nil {
            return err
        }

        // Feed scoring aggregates and enforce deindex when crossing threshold
        switch event.Kind {
        case 1:
            // Base POW for the note
            scorer.IngestNote(event)

        case 7:
            // Reaction: may cause deindexing
            if shouldDeindex := scorer.IngestReaction(event); shouldDeindex {
                // Extract target event id from e tag
                var targetID string
                for _, tag := range event.Tags {
                    if len(tag) >= 2 && tag[0] == "e" {
                        targetID = tag[1]
                        break
                    }
                }
                if targetID != "" {
                    // Cascade delete children, then delete the target event
                    if err := retentionMgr.CascadeDelete(ctx, targetID); err != nil {
                        log.Printf("[Relay] Cascade delete failed for %s: %v", targetID, err)
                    }

                    // Query the target event by ID to delete it
                    q := nostr.Filter{IDs: []string{targetID}}
                    ch, err := db.QueryEvents(ctx, q)
                    if err == nil {
                        for ev := range ch {
                            if err := db.DeleteEvent(ctx, ev); err != nil {
                                log.Printf("[Relay] Failed to delete target event %s: %v", targetID, err)
                            } else {
                                log.Printf("[Relay] Deindexed note %s due to negative reaction scoring", targetID[:8])
                            }
                            break
                        }
                    }
                }
            }

        case 1984:
            // Report: may cause deindexing
            if shouldDeindex := scorer.IngestReport(event); shouldDeindex {
                // Extract target event id from e tag (only notes supported)
                var targetID string
                for _, tag := range event.Tags {
                    if len(tag) >= 2 && tag[0] == "e" {
                        targetID = tag[1]
                        break
                    }
                }
                if targetID != "" {
                    // Cascade delete children, then delete the target event
                    if err := retentionMgr.CascadeDelete(ctx, targetID); err != nil {
                        log.Printf("[Relay] Cascade delete failed for %s: %v", targetID, err)
                    }

                    // Query the target event by ID to delete it
                    q := nostr.Filter{IDs: []string{targetID}}
                    ch, err := db.QueryEvents(ctx, q)
                    if err == nil {
                        for ev := range ch {
                            if err := db.DeleteEvent(ctx, ev); err != nil {
                                log.Printf("[Relay] Failed to delete target event %s: %v", targetID, err)
                            } else {
                                log.Printf("[Relay] Deindexed note %s due to reports scoring", targetID[:8])
                            }
                            break
                        }
                    }
                }
            }
        }

        return nil
    })

    // Filter query results to hide notes currently below threshold according to scorer
    relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
        in, err := db.QueryEvents(ctx, filter)
        if err != nil {
            return nil, err
        }
        out := make(chan *nostr.Event, 16)
        go func() {
            defer close(out)
            for ev := range in {
                if ev != nil && ev.Kind == 1 {
                    if scorer.ShouldDeindex(ev.ID) {
                        if debugScoring {
                            log.Printf("[Relay] Filtering deindexed note %s from query results", ev.ID[:8])
                        }
                        continue
                    }
                }
                out <- ev
            }
        }()
        return out, nil
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
