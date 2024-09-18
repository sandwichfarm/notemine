use wasm_bindgen::prelude::*;
use shared_lib::{NostrEvent, MinedResult, get_event_hash, get_pow};
use js_sys::Function;
use web_sys::console;
use console_error_panic_hook;
use serde_wasm_bindgen;
use instant::Instant;

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
    send_event_with_best_pow: bool,
    best_pow_threshold: Option<u32>,
) -> JsValue {
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

    let start_nonce: u64 = match start_nonce_str.parse() {
        Ok(n) => n,
        Err(_) => {
            console::log_1(&"Invalid start_nonce_str; defaulting to 0.".into());
            0
        }
    };
    let nonce_step: u64 = match nonce_step_str.parse() {
        Ok(n) => n,
        Err(_) => {
            console::log_1(&"Invalid nonce_step_str; defaulting to 1.".into());
            1
        }
    };

    let start_time = Instant::now();
    let mut nonce = start_nonce;
    let mut total_hashes = 0;
    let report_interval = 200_000;
    let mut last_report_time = Instant::now();
    let should_cancel = should_cancel.dyn_into::<Function>().ok();

    let mut best_pow = 0;
    let mut best_nonce = 0;
    let mut best_hash_bytes = Vec::new();
    let mut best_event: Option<NostrEvent> = None;

    loop {
        if let Some(index) = nonce_index {
            if let Some(tag) = event.tags.get_mut(index) {
                if tag.len() >= 3 {
                    tag[1] = nonce.to_string();
                    tag[2] = difficulty.to_string();
                }
            }
        }

        let hash_bytes = get_event_hash(&event);
        if hash_bytes.is_empty() {
            console::log_1(&"Failed to compute event hash.".into());
            return serde_wasm_bindgen::to_value(&serde_json::json!({
                "error": "Failed to compute event hash."
            }))
            .unwrap_or(JsValue::NULL);
        }

        let pow = get_pow(&hash_bytes);

        if pow > best_pow {
            best_pow = pow;
            best_nonce = nonce;
            best_hash_bytes = hash_bytes.clone();

            let should_send_event = if send_event_with_best_pow {
                match best_pow_threshold {
                    Some(threshold) => pow > threshold,
                    None => pow > (difficulty as f32 * 0.8) as u32,
                }
            } else {
                false
            };

            let best_pow_data = if should_send_event {
                best_event = Some(event.clone());
                serde_json::json!({
                    "best_pow": best_pow,
                    "nonce": best_nonce.to_string(),
                    "hash": hex::encode(&best_hash_bytes),
                    "event": best_event,
                })
            } else {
                serde_json::json!({
                    "best_pow": best_pow,
                    "nonce": best_nonce.to_string(),
                    "hash": hex::encode(&best_hash_bytes),
                })
            };

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

        if pow >= difficulty {
            let event_hash = hex::encode(&hash_bytes);
            event.id = Some(event_hash.clone());
            let total_time = start_time.elapsed().as_secs_f64();
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

        if total_hashes % report_interval == 0 {
            let elapsed_time = last_report_time.elapsed().as_secs_f64();
            if elapsed_time > 0.0 {
                let hash_rate = (report_interval as f64) / elapsed_time;

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
                last_report_time = Instant::now();
            }
        }
    }
}
