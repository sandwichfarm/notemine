use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use web_sys::console;
use console_error_panic_hook;
use js_sys::Function;
use serde_wasm_bindgen;

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

#[derive(Serialize)]
struct HashableEvent<'a>(
    u32,
    &'a str,
    u64,
    u32,
    &'a Vec<Vec<String>>,
    &'a str,
);

#[inline]
#[allow(dead_code)]
fn get_event_hash(event: &NostrEvent) -> Vec<u8> {
    let hashable_event = HashableEvent(
        0u32,
        &event.pubkey,
        event.created_at.unwrap(),
        event.kind,
        &event.tags,
        &event.content,
    );

    let serialized_bytes = match serde_json::to_vec(&hashable_event) {
        Ok(bytes) => bytes,
        Err(_) => return vec![],
    };

    Sha256::digest(&serialized_bytes).to_vec()
}

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

#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn mine_event(
    event_json: &str,
    difficulty: u32,
    start_nonce_str: &str,
    nonce_step_str: &str,
    report_progress: JsValue,
    should_cancel: JsValue,
) -> JsValue {
    console::log_1(&format!("event_json: {}", event_json).into());
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

    if event.created_at.is_none() {
        let current_timestamp = (js_sys::Date::now() / 1000.0) as u64;
        event.created_at = Some(current_timestamp);
    }

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

    let start_time = js_sys::Date::now();
    let start_nonce: u64 = start_nonce_str.parse().unwrap_or(0);
    let nonce_step: u64 = nonce_step_str.parse().unwrap_or(1);

    let mut nonce: u64 = start_nonce;
    let mut total_hashes: u64 = 0;

    // Adaptive progress stride - start with a reasonable default, will adjust
    let mut report_stride: u64 = 250_000;
    let target_report_interval_ms: f64 = 250.0; // Target ~250ms between progress reports
    let mut last_report_time = start_time;
    let mut hashes_since_last_report: u64 = 0; // Track ACTUAL hashes done

    // Adaptive cancel stride - start at 10k, reduce after cancel detected
    let mut cancel_stride: u64 = 10_000;
    let cancel_backoff_until: f64 = 0.0; // Timestamp until which we use reduced cancel stride

    let should_cancel = should_cancel.dyn_into::<Function>().ok();

    let mut best_pow: u32 = 0;
    #[allow(unused_assignments)]
    let mut best_nonce: u64 = 0;
    #[allow(unused_assignments)]
    let mut best_hash_bytes: Vec<u8> = Vec::new();

    // Emit initial progress with currentNonce so wrapper can capture resume state immediately
    let initial_progress = serde_json::json!({
        "currentNonce": start_nonce.to_string(),
    });
    let _ = report_progress.call2(
        &JsValue::NULL,
        &JsValue::from_f64(0.0),
        &serde_wasm_bindgen::to_value(&initial_progress).unwrap(),
    );

    // Pre-serialization optimization: serialize event once with fixed-width nonce placeholder
    const NONCE_WIDTH: usize = 20; // Support nonces up to 10^20
    const NONCE_PLACEHOLDER: &str = "00000000000000000000"; // 20 zeros

    // Set nonce tag to fixed-width placeholder
    if let Some(index) = nonce_index {
        if let Some(tag) = event.tags.get_mut(index) {
            if tag.len() >= 3 {
                tag[1] = NONCE_PLACEHOLDER.to_string();
                tag[2] = difficulty.to_string();
            }
        }
    }

    // Serialize the canonical event array once
    let hashable_event = HashableEvent(
        0u32,
        &event.pubkey,
        event.created_at.unwrap(),
        event.kind,
        &event.tags,
        &event.content,
    );

    let mut serialized_template = match serde_json::to_vec(&hashable_event) {
        Ok(bytes) => bytes,
        Err(err) => {
            console::log_1(&format!("Failed to serialize event template: {}", err).into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": format!("Failed to serialize event template: {}", err)
            }))
            .unwrap_or(JsValue::NULL);
        }
    };

    // Find the offset of the nonce placeholder in the serialized JSON
    let placeholder_bytes = NONCE_PLACEHOLDER.as_bytes();
    let nonce_offset = serialized_template.windows(placeholder_bytes.len())
        .position(|window| window == placeholder_bytes);

    let nonce_offset = match nonce_offset {
        Some(offset) => offset,
        None => {
            console::log_1(&"Failed to find nonce placeholder in serialized template".into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": "Failed to find nonce placeholder in serialized template"
            }))
            .unwrap_or(JsValue::NULL);
        }
    };

    // Pre-fill nonce region with zeros ONCE (outside loop)
    for i in 0..NONCE_WIDTH {
        serialized_template[nonce_offset + i] = b'0';
    }

    loop {
        // Write nonce digits directly to buffer (no String allocation)
        let mut temp_nonce = nonce;
        for i in (0..NONCE_WIDTH).rev() {
            serialized_template[nonce_offset + i] = b'0' + (temp_nonce % 10) as u8;
            temp_nonce /= 10;
        }

        // Hash the template (reuse same buffer)
        let hash_result = Sha256::digest(&serialized_template);
        let hash_bytes = hash_result.as_slice();

        let pow = get_pow(hash_bytes);

        if pow > best_pow {
            best_pow = pow;
            best_nonce = nonce;
            best_hash_bytes = hash_bytes.to_vec(); // Only allocate when we find a better pow

            // Include currentNonce so the JS wrapper can persist accurate resume state
            let best_pow_data = serde_json::json!({
                "best_pow": best_pow,
                "nonce": best_nonce.to_string(),
                "hash": hex::encode(&best_hash_bytes),
                "currentNonce": nonce.to_string(),
            });

            report_progress
                .call2(
                    &JsValue::NULL,
                    &JsValue::from_f64(0.0),
                    &serde_wasm_bindgen::to_value(&best_pow_data).unwrap(),
                )
                .unwrap_or_else(|err| {
                    console::log_1(
                        &format!("Error calling progress callback: {:?}", err).into(),
                    );
                    JsValue::NULL
                });
        }

        if pow >= difficulty {
            let event_hash = hex::encode(&hash_bytes);

            // Reconstruct the event with the final nonce
            if let Some(index) = nonce_index {
                if let Some(tag) = event.tags.get_mut(index) {
                    if tag.len() >= 3 {
                        tag[1] = nonce.to_string();
                        tag[2] = difficulty.to_string();
                    }
                }
            }

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

        nonce = nonce.wrapping_add(nonce_step);
        total_hashes += 1;
        hashes_since_last_report += 1;

        // Adaptive cancel checking
        if let Some(ref should_cancel) = should_cancel {
            if total_hashes % cancel_stride == 0 {
                let current_time = js_sys::Date::now();

                // Use reduced stride during backoff period for faster response
                if current_time < cancel_backoff_until {
                    cancel_stride = 1_000; // Reduced stride for next second
                } else {
                    cancel_stride = 10_000; // Normal stride
                }

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

        if total_hashes % report_stride == 0 {
            let current_time = js_sys::Date::now();
            let elapsed_time_ms = current_time - last_report_time;
            let elapsed_time_s = elapsed_time_ms / 1000.0;

            if elapsed_time_s > 0.0 {
                // Calculate REAL hash rate from actual hashes done
                let hash_rate = (hashes_since_last_report as f64) / elapsed_time_s;

                // Send currentNonce on periodic progress so resume has up-to-date nonces
                let prog = serde_json::json!({
                    "currentNonce": nonce.to_string(),
                });
                report_progress
                    .call2(
                        &JsValue::NULL,
                        &hash_rate.into(),
                        &serde_wasm_bindgen::to_value(&prog).unwrap(),
                    )
                    .unwrap_or_else(|err| {
                        console::log_1(
                            &format!("Error calling progress callback: {:?}", err).into(),
                        );
                        JsValue::NULL
                    });

                // Adaptive stride: adjust to maintain ~250ms cadence based on REAL performance
                if elapsed_time_ms > 0.0 && elapsed_time_ms < 500.0 { // Only adjust if timing is reasonable
                    // Calculate how many hashes we should do to hit target_report_interval_ms
                    let target_hashes = (hash_rate * (target_report_interval_ms / 1000.0)) as u64;
                    // Smooth adjustment: move 30% towards target to avoid oscillation
                    report_stride = (report_stride as f64 * 0.7 + target_hashes as f64 * 0.3) as u64;
                    // Clamp to reasonable range
                    report_stride = report_stride.max(10_000).min(1_000_000);
                }

                // Reset counter for next interval
                hashes_since_last_report = 0;
                last_report_time = current_time;
            }
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    //     {
    //     "id": "bb9727a19e7ed120333e994ada9c3b6e4a360a71739f9ea33def6d69638fff30",
    //     "pubkey": "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f",
    //     "created_at": 1668680774,
    //     "kind": 1,
    //     "tags": [],
    //     "content": "hello world",
    //     "sig": "4be1dccd81428990ba56515f2e9fc2ae61c9abc61dc3d977235fd8767f52010e44d36d3c8da30755b6440ccaf888442f7cbbd7a17e34ca3ed31c5e8a33a7df11"
    //   }
    
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
