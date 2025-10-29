package retention

import (
	"context"
	"log"
	"math"
	"time"

	"github.com/fiatjaf/eventstore"
	"github.com/nbd-wtf/go-nostr"
	"github.com/sandwichfarm/notemine/relay/internal/pow"
)

const (
	// DecayLambda controls the rate of exponential decay (per day)
	// λ = 0.1 means score decays by ~10% per day
	DecayLambda = 0.1

	// MaxKind1Events is the maximum number of kind 1 events to keep
	MaxKind1Events = 1000

	// ReactionWeight for different reaction types
	PositiveReactionWeight = 1.0  // +, 👍, ❤️
	NegativeReactionWeight = -1.0 // -, 👎
	OtherReactionWeight    = 0.5  // other reactions
)

// EventScore represents the calculated score for an event
type EventScore struct {
	Event         *nostr.Event
	EventID       string
	RootPOW       int
	ReactionsPOW  float64
	RepliesCount  int
	Age           time.Duration
	TotalScore    float64
	DecayedScore  float64
	CreatedAt     time.Time
}

// Manager handles retention calculations
type Manager struct {
	store eventstore.Store
}

// NewManager creates a new retention manager
func NewManager(store eventstore.Store) *Manager {
	return &Manager{store: store}
}

// CalculateEventScore calculates the score for a single event
func (m *Manager) CalculateEventScore(ctx context.Context, event *nostr.Event) (*EventScore, error) {
	score := &EventScore{
		Event:     event,
		EventID:   event.ID,
		RootPOW:   pow.GetDifficulty(event),
		CreatedAt: event.CreatedAt.Time(),
	}

	// Calculate age
	score.Age = time.Since(score.CreatedAt)

	// Fetch reactions (kind 7)
	reactionFilter := nostr.Filter{
		Kinds: []int{7},
		Tags: nostr.TagMap{
			"e": []string{event.ID},
		},
	}
	reactionsCh, err := m.store.QueryEvents(ctx, reactionFilter)
	if err != nil {
		return nil, err
	}

	// Calculate reactions POW
	for reaction := range reactionsCh {
		reactionPOW := float64(pow.GetDifficulty(reaction))
		content := reaction.Content

		switch content {
		case "+", "👍", "❤️":
			score.ReactionsPOW += reactionPOW * PositiveReactionWeight
		case "-", "👎":
			score.ReactionsPOW += reactionPOW * NegativeReactionWeight
		default:
			score.ReactionsPOW += reactionPOW * OtherReactionWeight
		}
	}

	// Fetch replies (kind 1 that reference this event)
	replyFilter := nostr.Filter{
		Kinds: []int{1},
		Tags: nostr.TagMap{
			"e": []string{event.ID},
		},
	}
	repliesCh, err := m.store.QueryEvents(ctx, replyFilter)
	if err != nil {
		return nil, err
	}

	// Count replies
	for range repliesCh {
		score.RepliesCount++
	}

	// Calculate total score
	// score = rootPOW + reactionsPOW + (repliesCount * 0.5)
	score.TotalScore = float64(score.RootPOW) + score.ReactionsPOW + (float64(score.RepliesCount) * 0.5)

	// Apply exponential time decay
	// decayedScore = score * exp(-λ * age_in_days)
	ageDays := score.Age.Hours() / 24.0
	decayFactor := math.Exp(-DecayLambda * ageDays)
	score.DecayedScore = score.TotalScore * decayFactor

	return score, nil
}

// PruneKind1Events removes the lowest-scoring kind 1 events when over the limit
func (m *Manager) PruneKind1Events(ctx context.Context) error {
	// Query all kind 1 events
	filter := nostr.Filter{
		Kinds: []int{1},
	}

	eventsCh, err := m.store.QueryEvents(ctx, filter)
	if err != nil {
		return err
	}

	// Collect all events with scores
	var scored []*EventScore
	for event := range eventsCh {
		score, err := m.CalculateEventScore(ctx, event)
		if err != nil {
			log.Printf("[Retention] Error calculating score for event %s: %v", event.ID, err)
			continue
		}
		scored = append(scored, score)
	}

	// If under limit, no pruning needed
	if len(scored) <= MaxKind1Events {
		log.Printf("[Retention] Kind 1 events: %d/%d (no pruning needed)", len(scored), MaxKind1Events)
		return nil
	}

	// Sort by decayed score (lowest first)
	// We want to delete the lowest scoring events
	sortByScore(scored)

	// Calculate how many to delete
	toDelete := len(scored) - MaxKind1Events
	log.Printf("[Retention] Pruning %d kind 1 events (total: %d, limit: %d)", toDelete, len(scored), MaxKind1Events)

	// Delete lowest scoring events
	for i := 0; i < toDelete; i++ {
		event := scored[i].Event
		eventID := scored[i].EventID

		// First, cascade delete children (reactions, replies)
		if err := m.CascadeDelete(ctx, eventID); err != nil {
			log.Printf("[Retention] Error cascade deleting event %s: %v", eventID, err)
		}

		// Then delete the event itself
		if err := m.store.DeleteEvent(ctx, event); err != nil {
			log.Printf("[Retention] Error deleting event %s: %v", eventID, err)
		} else {
			log.Printf("[Retention] Deleted event %s (score: %.2f)", eventID, scored[i].DecayedScore)
		}
	}

	return nil
}

// CascadeDelete deletes an event and all its children (reactions, replies)
func (m *Manager) CascadeDelete(ctx context.Context, eventID string) error {
	// Find all reactions (kind 7)
	reactionFilter := nostr.Filter{
		Kinds: []int{7},
		Tags: nostr.TagMap{
			"e": []string{eventID},
		},
	}
	reactionsCh, err := m.store.QueryEvents(ctx, reactionFilter)
	if err != nil {
		return err
	}

	for reaction := range reactionsCh {
		if err := m.store.DeleteEvent(ctx, reaction); err != nil {
			log.Printf("[Retention] Error deleting reaction %s: %v", reaction.ID, err)
		}
	}

	// Find all replies (kind 1)
	replyFilter := nostr.Filter{
		Kinds: []int{1},
		Tags: nostr.TagMap{
			"e": []string{eventID},
		},
	}
	repliesCh, err := m.store.QueryEvents(ctx, replyFilter)
	if err != nil {
		return err
	}

	for reply := range repliesCh {
		// Recursively cascade delete replies
		if err := m.CascadeDelete(ctx, reply.ID); err != nil {
			log.Printf("[Retention] Error cascade deleting reply %s: %v", reply.ID, err)
		}

		if err := m.store.DeleteEvent(ctx, reply); err != nil {
			log.Printf("[Retention] Error deleting reply %s: %v", reply.ID, err)
		}
	}

	return nil
}

// sortByScore sorts events by decayed score (ascending - lowest first)
func sortByScore(scored []*EventScore) {
	// Simple bubble sort (for small datasets this is fine)
	// For production, use sort.Slice
	for i := 0; i < len(scored); i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].DecayedScore < scored[i].DecayedScore {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}
}
