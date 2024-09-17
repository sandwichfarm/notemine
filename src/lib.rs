use serde::{Deserialize, Serialize};
use serde_json::to_string;

use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use web_sys::console;
use console_error_panic_hook;
use js_sys::Function;
use serde_wasm_bindgen;

// Existing Structs
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NostrEvent {
    pub pubkey: String,
    pub kind: u32,
    pub content: String,
    pub tags: Vec<Vec<String>>,
    pub id: Option<String>,
    pub created_at: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MinedResult {
    pub event: NostrEvent,
    pub total_time: f64,
    pub khs: f64,
}

// New Struct for Enhanced Reporting
#[derive(Serialize, Deserialize, Debug)]
pub struct BestPowData {
    pub best_pow: u32,
    pub nonce: String,
    pub hash: String,
    pub event: Option<NostrEvent>, // Optional event data
}

// Hashable Event for PoW Calculation
#[derive(Serialize)]
struct HashableEvent<'a>(
    u32,
    &'a str,
    #[serde(serialize_with = "serialize_u64_as_number")]
    u64,
    u32,
    &'a Vec<Vec<String>>,
    &'a str,
);

// Serializer for U64 as Number
fn serialize_u64_as_number<S>(x: &u64, s: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    s.serialize_u64(*x)
}

// Function to Compute Event Hash
#[inline]
fn get_event_hash(event: &NostrEvent) -> Vec<u8> {
    let hashable_event = HashableEvent(
        0u32,
        &event.pubkey,
        event.created_at.unwrap_or_else(|| (js_sys::Date::now() / 1000.0) as u64),
        event.kind,
        &event.tags,
        &event.content,
    );

    let serialized_str = match to_string(&hashable_event) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let hash_bytes = Sha256::digest(serialized_str.as_bytes()).to_vec();
    hash_bytes
}

// Function to Calculate Proof of Work
#[inline]
fn get_pow(hash_bytes: &[u8]) -> u32 {
    let mut count = 0;
    for &byte in hash_bytes {
        if byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros() as u32;
            break;
        }
    }
    count
}

// Initialize Panic Hook
#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

// Enhanced mine_event Function
#[wasm_bindgen]
pub fn mine_event(
    event_json: &str,
    difficulty: u32,
    start_nonce_str: &str,
    nonce_step_str: &str,
    report_progress: JsValue,
    should_cancel: JsValue,
    send_event_with_best_pow: bool,
    best_pow_threshold: Option<u32>,
) -> JsValue {
    console::log_1(&format!("event_json: {}", event_json).into());
    
    // Deserialize Event
    let mut event: NostrEvent = match serde_json::from_str(event_json) {
        Ok(e) => e,
        Err(err) => {
            console::log_1(&format!("JSON parsing error: {}", err).into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": format!("Invalid event JSON: {}", err)
            }))
            .unwrap_or(JsValue::NULL);
        }
    };

    // Set created_at if missing
    if event.created_at.is_none() {
        let current_timestamp = (js_sys::Date::now() / 1000.0) as u64;
        event.created_at = Some(current_timestamp);
    }

    // Find or Add Nonce Tag
    let mut nonce_index = None;
    for (i, tag) in event.tags.iter().enumerate() {
        if tag.len() > 0 && tag[0] == "nonce" {
            nonce_index = Some(i);
            break;
        }
    }
    if nonce_index.is_none() {
        event.tags.push(vec![
            "nonce".to_string(),
            "0".to_string(),
            difficulty.to_string(),
        ]);
        nonce_index = Some(event.tags.len() - 1);
    }

    // Convert report_progress to Function
    let report_progress = match report_progress.dyn_into::<Function>() {
        Ok(func) => func,
        Err(_) => {
            console::log_1(&"Failed to convert report_progress to Function".into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": "Invalid progress callback."
            }))
            .unwrap_or(JsValue::NULL);
        }
    };

    // Parse Nonce Parameters
    let start_time = js_sys::Date::now();
    let start_nonce: u64 = start_nonce_str.parse().unwrap_or(0);
    let nonce_step: u64 = nonce_step_str.parse().unwrap_or(1);

    let mut nonce: u64 = start_nonce;
    let mut total_hashes: u64 = 0;

    let report_interval = 200_000;
    let mut last_report_time = start_time;
    let should_cancel = should_cancel.dyn_into::<Function>().ok();

    let mut best_pow: u32 = 0;
    let mut best_nonce: u64 = 0;
    let mut best_hash_bytes: Vec<u8> = Vec::new();
    let mut best_event: Option<NostrEvent> = None; // To store the event achieving best PoW

    loop {
        // Check for Cancellation at Start of Loop
        if let Some(ref should_cancel) = should_cancel {
            let cancel = should_cancel.call0(&JsValue::NULL).unwrap_or(JsValue::FALSE);
            if cancel.is_truthy() {
                console::log_1(&"Mining cancelled.".into());
                return serde_wasm_bindgen::to_value(&serde_json::json!({
                    "error": "Mining cancelled."
                }))
                .unwrap_or(JsValue::NULL);
            }
        }

        // Update Nonce in the Event
        if let Some(index) = nonce_index {
            if let Some(tag) = event.tags.get_mut(index) {
                if tag.len() >= 3 {
                    tag[1] = nonce.to_string();
                    tag[2] = difficulty.to_string();
                }
            }
        }

        // Compute Hash of the Event
        let hash_bytes = get_event_hash(&event);
        if hash_bytes.is_empty() {
            console::log_1(&"Failed to compute event hash.".into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": "Failed to compute event hash."
            }))
            .unwrap_or(JsValue::NULL);
        }

        // Calculate Proof of Work
        let pow = get_pow(&hash_bytes);

        // If Current PoW is Better than Best PoW Found So Far
        if pow > best_pow {
            best_pow = pow;
            best_nonce = nonce;
            best_hash_bytes = hash_bytes.clone();

            // Check if Event Should be Sent with Best PoW
            let should_send_event = if send_event_with_best_pow {
                match best_pow_threshold {
                    Some(threshold) => pow > threshold,
                    None => pow > (difficulty as f32 * 0.8) as u32, // 80% of difficulty
                }
            } else {
                false
            };

            // Prepare Best PoW Data
            let best_pow_data = if should_send_event {
                // Include the event data
                best_event = Some(event.clone());
                serde_json::json!({
                    "best_pow": best_pow,
                    "nonce": best_nonce.to_string(),
                    "hash": hex::encode(&best_hash_bytes),
                    "event": best_event,
                })
            } else {
                // Exclude the event data
                serde_json::json!({
                    "best_pow": best_pow,
                    "nonce": best_nonce.to_string(),
                    "hash": hex::encode(&best_hash_bytes),
                })
            };

            // Report Progress with Best PoW and Nonce
            report_progress
                .call2(
                    &JsValue::NULL,
                    &serde_wasm_bindgen::to_value(&serde_json::json!({
                        "hashRate": 0.0, 
                        "bestPowData": best_pow_data,
                        "nonce": best_nonce.to_string(),
                    }))
                    .unwrap(),
                    &JsValue::NULL,
                )
                .unwrap_or_else(|err| {
                    console::log_1(
                        &format!("Error calling progress callback: {:?}", err).into(),
                    );
                    JsValue::NULL
                });
        }

        // If Difficulty is Met or Exceeded
        if pow >= difficulty {
            let event_hash = hex::encode(&hash_bytes);
            event.id = Some(event_hash.clone());
            let end_time = js_sys::Date::now();
            let total_time = (end_time - start_time) / 1000.0;
            let khs = (total_hashes as f64) / 1000.0 / total_time;

            let result = MinedResult {
                event,
                total_time,
                khs,
            };

            console::log_1(&format!("Mined successfully with nonce: {}", nonce).into());
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }

        // Increment Nonce and Hash Count
        nonce = nonce.wrapping_add(nonce_step);
        total_hashes += 1;

        // Periodic Cancellation Check
        if let Some(ref should_cancel) = should_cancel {
            if total_hashes % 10_000 == 0 {
                let cancel = should_cancel.call0(&JsValue::NULL).unwrap_or(JsValue::FALSE);
                if cancel.is_truthy() {
                    console::log_1(&"Mining cancelled.".into());
                    return serde_wasm_bindgen::to_value(&serde_json::json!({
                        "error": "Mining cancelled."
                    }))
                    .unwrap_or(JsValue::NULL);
                }
            }
        }

        // Periodic Hash Rate Reporting
        if total_hashes % report_interval == 0 {
            let current_time = js_sys::Date::now();
            let elapsed_time = (current_time - last_report_time) / 1000.0;
            if elapsed_time > 0.0 {
                let hash_rate = (report_interval as f64) / elapsed_time;

                // Report Progress with Updated Hash Rate and Current Nonce
                report_progress
                    .call2(
                        &JsValue::NULL,
                        &serde_wasm_bindgen::to_value(&serde_json::json!({
                            "hashRate": hash_rate,
                            "bestPowData": serde_json::json!({}),
                            "nonce": nonce.to_string(),
                        }))
                        .unwrap(),
                        &JsValue::NULL,
                    )
                    .unwrap_or_else(|err| {
                        console::log_1(
                            &format!("Error calling progress callback: {:?}", err).into(),
                        );
                        JsValue::NULL
                    });
                last_report_time = current_time;
            }
        }
    }
}

// Tests remain unchanged
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_event_hash() {
        let event = NostrEvent {
            pubkey: "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f".to_string(),
            kind: 1,
            content: "hello world".to_string(),
            tags: vec![],
            id: None,
            created_at: Some(1668680774),
        };
    
        let expected_hash = "bb9727a19e7ed120333e994ada9c3b6e4a360a71739f9ea33def6d69638fff30";
    
        let hash_bytes = get_event_hash(&event);
        let hash_hex = hex::encode(&hash_bytes);
    
        assert_eq!(hash_hex, expected_hash);
    }
}
