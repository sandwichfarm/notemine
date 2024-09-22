use serde::{Deserialize, Serialize};
use serde_json::to_string;
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use web_sys::console;
use console_error_panic_hook;
use js_sys::Function;
use serde_wasm_bindgen;
use std::fmt::Write;

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
    pub best_nonce: u64,
    pub best_hash: String,
}

fn serialize_u64_as_number<S>(x: &u64, s: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    s.serialize_u64(*x)
}

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

    let nonce_tag_index = event
        .tags
        .iter()
        .position(|tag| tag.get(0).map(|s| s == "nonce").unwrap_or(false));

    if nonce_tag_index.is_none() {
        event.tags.push(vec![
            "nonce".to_string(),
            "0".to_string(),
            difficulty.to_string(),
        ]);
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

    let report_interval = 500_000;
    let mut last_report_time = start_time;
    let should_cancel = should_cancel.dyn_into::<Function>().ok();

    let mut best_pow: u32 = 0;
    let mut best_nonce: u64 = 0;
    let mut best_hash_bytes: Vec<u8> = Vec::new();

    let static_tags: Vec<Vec<String>> = event
        .tags
        .iter()
        .filter(|tag| tag.get(0).map(|s| s != "nonce").unwrap_or(true))
        .cloned()
        .collect();

    let serialized_static_event = serialize_event_static(&event, &static_tags);

    let mut hasher = Sha256::new();
    hasher.update(&serialized_static_event);

    loop {
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

        let nonce_str = nonce.to_string();
        let difficulty_str = difficulty.to_string();
        let nonce_tag = vec!["nonce", &nonce_str, &difficulty_str];
        let serialized_nonce_tag = serde_json::to_string(&nonce_tag).unwrap();

        let mut hasher_clone = hasher.clone();
        hasher_clone.update(b",");
        hasher_clone.update(serialized_nonce_tag.as_bytes());
        hasher_clone.update(b"]");
        hasher_clone.update(b",\"");
        hasher_clone.update(event.content.as_bytes());
        hasher_clone.update(b"\"]");

        let hash_bytes = hasher_clone.finalize_reset().to_vec();

        let pow = get_pow(&hash_bytes);

        if pow > best_pow {
            best_pow = pow;
            best_nonce = nonce;
            best_hash_bytes = hash_bytes.clone();

            let best_pow_data = serde_json::json!({
                "best_pow": best_pow,
                "nonce": best_nonce.to_string(),
                "hash": hex::encode(&best_hash_bytes),
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
            let mut final_tags = static_tags.clone();
            final_tags.push(vec![
                "nonce".to_string(),
                nonce_str,
                difficulty_str.clone(),
            ]);
            event.tags = final_tags;
            event.id = Some(event_hash.clone());

            let end_time = js_sys::Date::now();
            let total_time = (end_time - start_time) / 1000.0;
            let khs = (total_hashes as f64) / 1000.0 / total_time;

            let result = MinedResult {
                event,
                total_time,
                khs,
                best_nonce,
                best_hash: hex::encode(&best_hash_bytes),
            };

            console::log_1(&format!("Mined successfully with nonce: {}", nonce).into());
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        }

        nonce = nonce.wrapping_add(nonce_step);
        total_hashes += 1;

        if total_hashes % report_interval == 0 {
            let current_time = js_sys::Date::now();
            let elapsed_time = (current_time - last_report_time) / 1000.0;
            if elapsed_time > 0.0 {
                let hash_rate = (report_interval as f64) / elapsed_time;
                report_progress
                    .call2(&JsValue::NULL, &hash_rate.into(), &JsValue::NULL)
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

fn serialize_event_static(event: &NostrEvent, static_tags: &Vec<Vec<String>>) -> Vec<u8> {
    let mut serialized = String::new();
    write!(
        &mut serialized,
        "[0,\"{}\",{},{}",
        event.pubkey,
        event.created_at.unwrap(),
        event.kind
    )
    .unwrap();

    let serialized_tags = serde_json::to_string(&static_tags).unwrap();
    write!(&mut serialized, ",{}", serialized_tags).unwrap();

    serialized.into_bytes()
}

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
