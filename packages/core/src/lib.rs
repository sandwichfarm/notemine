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

    // Digit-length–aware template: build a template whose nonce string is exactly the
    // current number of digits. Rebuild only when digit length grows.
    #[inline]
    fn num_digits_u64(mut x: u64) -> usize {
        let mut d = 1usize;
        while x >= 10 {
            x /= 10;
            d += 1;
        }
        d
    }

    #[inline]
    fn pow10_u64(p: usize) -> u64 {
        let mut acc: u64 = 1;
        for _ in 0..p {
            match acc.checked_mul(10) {
                Some(v) => acc = v,
                None => return u64::MAX,
            }
        }
        acc
    }

    #[inline]
    fn build_template_for_digits(event: &NostrEvent, digits_len: usize) -> Result<(Vec<u8>, usize), String> {
        // Clone and set nonce tag to `digits_len` zeros for a stable region
        let mut evt = event.clone();
        let nonce_str = "0".repeat(digits_len);
        let mut found = false;
        for tag in &mut evt.tags {
            if !tag.is_empty() && tag[0] == "nonce" {
                if tag.len() >= 2 {
                    tag[1] = nonce_str.clone();
                    found = true;
                }
                break;
            }
        }
        if !found { return Err("Missing nonce tag while building template".to_string()); }

        let hashable_event = HashableEvent(
            0u32,
            &evt.pubkey,
            evt.created_at.unwrap(),
            evt.kind,
            &evt.tags,
            &evt.content,
        );

        let mut bytes = serde_json::to_vec(&hashable_event)
            .map_err(|e| format!("Failed to serialize event template: {}", e))?;

        const NONCE_PREFIX: &str = "\"nonce\",\""; // unescaped: "nonce"," (first two elements of tag)
        let prefix = NONCE_PREFIX.as_bytes();
        let pos = bytes.windows(prefix.len()).position(|w| w == prefix)
            .ok_or_else(|| "Failed to find \"nonce\",\" prefix in serialized template".to_string())?;
        let offset = pos + prefix.len();

        if offset + digits_len >= bytes.len() {
            return Err("Nonce region exceeds serialized buffer length".to_string());
        }

        // Initialize region with zeros
        for i in 0..digits_len {
            bytes[offset + i] = b'0';
        }

        Ok((bytes, offset))
    }

    let mut digits_len = num_digits_u64(nonce);
    let mut next_len_threshold = pow10_u64(digits_len);
    let (mut serialized_template, mut nonce_offset) = match build_template_for_digits(&event, digits_len) {
        Ok(v) => v,
        Err(err) => {
            console::log_1(&format!("{}", err).into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({ "error": err }))
                .unwrap_or(JsValue::NULL);
        }
    };

    loop {
        // Rebuild template if we crossed a digit-length boundary
        if nonce >= next_len_threshold {
            while nonce >= next_len_threshold && next_len_threshold != u64::MAX {
                digits_len += 1;
                next_len_threshold = pow10_u64(digits_len);
            }
            match build_template_for_digits(&event, digits_len) {
                Ok((bytes, off)) => { serialized_template = bytes; nonce_offset = off; }
                Err(err) => {
                    console::log_1(&format!("{}", err).into());
                    return serde_wasm_bindgen::to_value(&serde_json::json!({ "error": err }))
                        .unwrap_or(JsValue::NULL);
                }
            }
        }

        // Write nonce digits for this iteration (exactly digits_len wide)
        let mut tmp = nonce;
        for i in (0..digits_len).rev() {
            serialized_template[nonce_offset + i] = b'0' + (tmp % 10) as u8;
            tmp /= 10;
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
    use sha2::Digest;

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

    fn canonical_id(event: &NostrEvent) -> String {
        hex::encode(get_event_hash(event))
    }

    // Build a JSON buffer where the nonce field is a fixed number of characters (zeros),
    // then write the decimal digits of `nonce` right-aligned into that region.
    // Returns the serialized bytes (to be hashed).
    fn serialize_with_nonce_width(event: &NostrEvent, width: usize, nonce: u64) -> Vec<u8> {
        // Clone event and set nonce tag placeholder of `width` zeros
        let mut evt = event.clone();
        let zeros = "0".repeat(width);
        let mut found = false;
        for tag in &mut evt.tags {
            if !tag.is_empty() && tag[0] == "nonce" {
                if tag.len() >= 2 { tag[1] = zeros.clone(); }
                found = true;
                break;
            }
        }
        if !found {
            // If missing, add a basic nonce tag with the placeholder
            evt.tags.push(vec!["nonce".to_string(), zeros.clone(), "21".to_string()]);
        }

        let hashable = HashableEvent(
            0u32,
            &evt.pubkey,
            evt.created_at.unwrap(),
            evt.kind,
            &evt.tags,
            &evt.content,
        );
        let mut bytes = serde_json::to_vec(&hashable).expect("serialize template");

        // Find the start of the nonce value by looking for "nonce"," (unescaped)
        const NONCE_PREFIX: &str = "\"nonce\",\"";
        let prefix = NONCE_PREFIX.as_bytes();
        let pos = bytes.windows(prefix.len()).position(|w| w == prefix).expect("find nonce prefix");
        let offset = pos + prefix.len();

        // Fill region with zeros then right-align digits
        for i in 0..width { bytes[offset + i] = b'0'; }
        let mut tmp = nonce;
        for i in (0..width).rev() {
            bytes[offset + i] = b'0' + (tmp % 10) as u8;
            tmp /= 10;
            if tmp == 0 { break; }
        }
        bytes
    }

    #[test]
    fn test_digit_length_template_matches_canonical() {
        // Base event
        let mut event = NostrEvent {
            pubkey: "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f".to_string(),
            kind: 7,
            content: "🔥".to_string(),
            tags: vec![
                vec!["e".into(), "6b427f7e53a8696a9bcf5df4b18985b67add45365b4bdccb639e5c39c5419d8d".into()],
                vec!["p".into(), "34d2f5274f1958fcd2cb2463dabeaddf8a21f84ace4241da888023bf05cc8095".into()],
                vec!["client".into(), "notemine.io".into()],
                vec!["nonce".into(), "0".into(), "20".into()],
            ],
            id: None,
            created_at: Some(1700000000),
        };

        // Try a set of nonces across digit length boundaries
        let nonces: [u64; 9] = [0, 1, 9, 10, 99, 100, 1234, 9999999, 123456789];
        for n in nonces.iter().copied() {
            // Canonical event uses unpadded decimal string
            for tag in &mut event.tags {
                if !tag.is_empty() && tag[0] == "nonce" { tag[1] = n.to_string(); break; }
            }
            let canonical = canonical_id(&event);

            // Build template for the exact digit length and write digits
            let width = n.to_string().len();
            let buf = serialize_with_nonce_width(&event, width, n);
            let hash = Sha256::digest(&buf);
            let templ = hex::encode(hash);

            assert_eq!(templ, canonical, "nonce {} width {} should match canonical", n, width);
        }
    }

    #[test]
    fn test_fixed_width_template_mismatch() {
        // Demonstrate that a wide fixed-width region (e.g., 20) changes the hash
        // compared to canonical unpadded serialization for typical nonces.
        let mut event = NostrEvent {
            pubkey: "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f".to_string(),
            kind: 1,
            content: "+".to_string(),
            tags: vec![vec!["nonce".into(), "0".into(), "20".into()]],
            id: None,
            created_at: Some(1700001234),
        };

        let nonces: [u64; 5] = [1, 23, 456, 7890, 123456];
        for n in nonces.iter().copied() {
            for tag in &mut event.tags {
                if !tag.is_empty() && tag[0] == "nonce" { tag[1] = n.to_string(); break; }
            }
            let canonical = canonical_id(&event);

            // Old approach: width 20 region
            let buf = serialize_with_nonce_width(&event, 20, n);
            let hash = Sha256::digest(&buf);
            let padded = hex::encode(hash);

            assert_ne!(padded, canonical, "fixed-width padded nonce should not equal canonical for {}", n);
        }
    }
}
