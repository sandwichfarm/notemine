package scoring

import (
	"fmt"
	"log"
	"sync"

	"github.com/nbd-wtf/go-nostr"
	"github.com/sandwichfarm/notemine/relay/internal/pow"
)

// Config holds scoring configuration
type Config struct {
	ReportWeight float64 // Weight for reports (default 1.0)
	MinPowDifficulty int    // Minimum PoW threshold for indexing
	Debug bool              // Enable debug logging
}

// ScoreAggregate represents the scoring components for an event
type ScoreAggregate struct {
	EventID string  // Event ID
	Base    float64 // Base PoW of the note
	Pos     float64 // Positive reaction PoW
	Neg     float64 // Negative reaction PoW
	Report  float64 // Report PoW (negative)
	Total   float64 // Computed total score
}

// Scorer manages event scoring with thread-safe operations
type Scorer struct {
	config     Config
	aggregates map[string]*ScoreAggregate
	mu         sync.RWMutex
}

// NewScorer creates a new scoring manager
func NewScorer(config Config) *Scorer {
	return &Scorer{
		config:     config,
		aggregates: make(map[string]*ScoreAggregate),
	}
}

// computeScore calculates the total score from aggregate components
func (s *Scorer) computeScore(agg *ScoreAggregate) float64 {
	return agg.Base + agg.Pos - agg.Neg - (s.config.ReportWeight * agg.Report)
}

// IngestNote processes a kind 1 note and stores its base PoW
func (s *Scorer) IngestNote(event *nostr.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Calculate base PoW
	difficulty := pow.GetDifficulty(event)

	// Create or update aggregate
	agg, exists := s.aggregates[event.ID]
	if !exists {
		agg = &ScoreAggregate{
			EventID: event.ID,
			Base:    float64(difficulty),
		}
		s.aggregates[event.ID] = agg
	} else {
		// Update base if it changed (shouldn't happen but be safe)
		agg.Base = float64(difficulty)
	}

	// Recompute total
	agg.Total = s.computeScore(agg)

	if s.config.Debug {
		log.Printf("[Scoring] Ingested note %s: base=%.1f, total=%.1f", event.ID[:8], agg.Base, agg.Total)
	}
}

// IngestReaction processes a kind 7 reaction and updates scoring
func (s *Scorer) IngestReaction(reaction *nostr.Event) (shouldDeindex bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find the target event ID from e tag
	var targetID string
	for _, tag := range reaction.Tags {
		if len(tag) >= 2 && tag[0] == "e" {
			targetID = tag[1]
			break
		}
	}

	if targetID == "" {
		// No target, ignore
		return false
	}

	// Get or create aggregate
	agg, exists := s.aggregates[targetID]
	if !exists {
		agg = &ScoreAggregate{
			EventID: targetID,
			Base:    0, // Will be set when note is ingested
		}
		s.aggregates[targetID] = agg
	}

	// Calculate reaction PoW
	reactionPow := float64(pow.GetDifficulty(reaction))

	// Determine sentiment from content
	content := reaction.Content
	isPositive := isPositiveReaction(content)
	isNegative := isNegativeReaction(content)

	oldTotal := agg.Total

	if isNegative {
		// Negative reaction
		agg.Neg += reactionPow
	} else if isPositive {
		// Positive reaction (default)
		agg.Pos += reactionPow
	} else {
		// Neutral/unknown - treat as positive with half weight
		agg.Pos += reactionPow * 0.5
	}

	// Recompute total
	agg.Total = s.computeScore(agg)

	if s.config.Debug {
		polarity := "pos"
		if isNegative {
			polarity = "neg"
		}
		log.Printf("[Scoring] Ingested reaction %s (%s, %.1f PoW) for note %s: total %.1f -> %.1f",
			reaction.ID[:8], polarity, reactionPow, targetID[:8], oldTotal, agg.Total)
	}

	// Check if should be de-indexed
	return oldTotal >= float64(s.config.MinPowDifficulty) && agg.Total < float64(s.config.MinPowDifficulty)
}

// IngestReport processes a kind 1984 report and updates scoring
func (s *Scorer) IngestReport(report *nostr.Event) (shouldDeindex bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find the target event ID from e tag (for note reports)
	var targetID string
	for _, tag := range report.Tags {
		if len(tag) >= 2 && tag[0] == "e" {
			targetID = tag[1]
			break
		}
	}

	if targetID == "" {
		// Profile report (p tag) - we only score note reports for now
		return false
	}

	// Get or create aggregate
	agg, exists := s.aggregates[targetID]
	if !exists {
		agg = &ScoreAggregate{
			EventID: targetID,
			Base:    0, // Will be set when note is ingested
		}
		s.aggregates[targetID] = agg
	}

	// Calculate report PoW
	reportPow := float64(pow.GetDifficulty(report))

	oldTotal := agg.Total

	// Add to report score (weighted negatively)
	agg.Report += reportPow

	// Recompute total
	agg.Total = s.computeScore(agg)

	if s.config.Debug {
		log.Printf("[Scoring] Ingested report %s (%.1f PoW) for note %s: total %.1f -> %.1f",
			report.ID[:8], reportPow, targetID[:8], oldTotal, agg.Total)
	}

	// Check if should be de-indexed
	return oldTotal >= float64(s.config.MinPowDifficulty) && agg.Total < float64(s.config.MinPowDifficulty)
}

// ShouldDeindex checks if an event should be removed from index
func (s *Scorer) ShouldDeindex(eventID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agg, exists := s.aggregates[eventID]
	if !exists {
		return false
	}

	return agg.Total < float64(s.config.MinPowDifficulty)
}

// GetScore returns the current total score for an event
func (s *Scorer) GetScore(eventID string) float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agg, exists := s.aggregates[eventID]
	if !exists {
		return 0
	}

	return agg.Total
}

// GetAggregate returns the full aggregate for an event
func (s *Scorer) GetAggregate(eventID string) (*ScoreAggregate, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agg, exists := s.aggregates[eventID]
	if !exists {
		return nil, false
	}

	// Return a copy to avoid race conditions
	aggCopy := *agg
	return &aggCopy, true
}

// Helper: check if reaction content is positive
func isPositiveReaction(content string) bool {
	positiveEmojis := map[string]bool{
		"+":  true,
		"👍": true,
		"❤️": true,
		"🔥": true,
		"💯": true,
		"⚡": true,
		"🤙": true,
	}
	return positiveEmojis[content]
}

// Helper: check if reaction content is negative
func isNegativeReaction(content string) bool {
	negativeEmojis := map[string]bool{
		"-":  true,
		"👎": true,
	}
	return negativeEmojis[content]
}

// DebugStats returns scoring statistics for debugging
func (s *Scorer) DebugStats() string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	totalEvents := len(s.aggregates)
	belowThreshold := 0
	for _, agg := range s.aggregates {
		if agg.Total < float64(s.config.MinPowDifficulty) {
			belowThreshold++
		}
	}

	return fmt.Sprintf("Scoring stats: %d events tracked, %d below threshold (%.1f%%)",
		totalEvents, belowThreshold, float64(belowThreshold)/float64(totalEvents)*100)
}
