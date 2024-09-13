// src/lib.rs

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use web_sys::console;
use serde_wasm_bindgen::to_value;
use console_error_panic_hook;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NostrEvent {
    pub pubkey: String,
    pub content: String,
    pub tags: Vec<Vec<String>>,
    pub id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MinedResult {
    pub event: NostrEvent,
    pub total_time: f64, // in seconds
    pub khs: f64,        // kilohashes per second
}

fn get_event_hash(event: &NostrEvent) -> String {
    let mut event_clone = event.clone();
    event_clone.id = None;
    let serialized = match serde_json::to_string(&event_clone) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

fn get_pow(hash: &str) -> u32 {
    let bytes = match hex::decode(hash) {
        Ok(b) => b,
        Err(_) => return 0,
    };
    let mut count = 0;
    for byte in bytes {
        for i in 0..8 {
            if (byte & (0x80 >> i)) == 0 {
                count += 1;
            } else {
                return count;
            }
        }
    }
    count
}

#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn mine_event(event_json: &str, difficulty: u32) -> JsValue {
    // Log received parameters
    console::log_1(&format!("Received event_json: {}", event_json).into());
    console::log_1(&format!("Received difficulty: {}", difficulty).into());

    // Parse the event JSON
    let mut event: NostrEvent = match serde_json::from_str(event_json) {
        Ok(e) => e,
        Err(err) => {
            console::log_1(&format!("JSON parsing error: {}", err).into());
            return to_value(&serde_json::json!({
                "error": format!("Invalid event JSON: {}", err)
            })).unwrap_or(JsValue::NULL);
        }
    };

    // Start mining
    let start_time = js_sys::Date::now();
    let mut nonce: u64 = 0;
    let mut total_hashes: u64 = 0;

    loop {
        // Update the nonce in tags
        event.tags = vec![vec![
            "nonce".to_string(),
            nonce.to_string(),
            difficulty.to_string(),
        ]];

        // Compute the hash
        let event_hash = get_event_hash(&event);
        if event_hash.is_empty() {
            console::log_1(&"Failed to compute event hash.".into());
            return to_value(&serde_json::json!({
                "error": "Failed to compute event hash."
            })).unwrap_or(JsValue::NULL);
        }
        let pow = get_pow(&event_hash);

        total_hashes += 1;

        // Check if the hash meets the difficulty
        if pow >= difficulty {
            event.id = Some(event_hash.clone());
            let end_time = js_sys::Date::now();
            let total_time = (end_time - start_time) / 1000.0; // seconds
            let khs = (total_hashes as f64) / 1000.0 / total_time;

            let result = MinedResult {
                event,
                total_time,
                khs,
            };

            console::log_1(&format!("Mined successfully with nonce: {}", nonce).into());
            return to_value(&result).unwrap_or(JsValue::NULL);
        }

        nonce += 1;

        // Optional: Log progress every 1,000,000 hashes
        if nonce % 1_000_000 == 0 {
            console::log_1(&format!("Checked nonce up to: {}", nonce).into());
        }

        // Optional: Prevent infinite loops
        if nonce >= 10_000_000 {
            console::log_1(&"Reached maximum nonce limit without finding a valid hash".into());
            return to_value(&serde_json::json!({
                "error": "Reached maximum nonce limit without finding a valid hash"
            })).unwrap_or(JsValue::NULL);
        }
    }
}
