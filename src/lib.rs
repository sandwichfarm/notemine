use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use web_sys::console;
use serde_wasm_bindgen::to_value;
use console_error_panic_hook;
use js_sys::Function;

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
struct HashableEvent<'a> {
    pub pubkey: &'a str,
    pub kind: u32,
    pub content: &'a str,
    pub tags: &'a Vec<Vec<String>>,
    pub created_at: Option<u64>,
}

#[inline]
fn get_event_hash(event: &mut NostrEvent) -> Vec<u8> {
    event.id = None;
    let hashable_event = HashableEvent {
        pubkey: &event.pubkey,
        kind: event.kind,
        content: &event.content,
        tags: &event.tags,
        created_at: event.created_at,
    };
    let serialized = match serde_json::to_vec(&hashable_event) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let mut hasher = Sha256::new();
    hasher.update(&serialized);
    hasher.finalize().to_vec()
}


#[inline]
fn get_pow(hash_bytes: &[u8]) -> u32 {
  let mut count = 0;
  for byte in hash_bytes {
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
pub fn mine_event(
  event_json: &str,
  difficulty: u32,
  report_progress: JsValue,
) -> JsValue {
    console::log_1(&format!("Received event_json: {}", event_json).into());
    console::log_1(&format!("Received difficulty: {}", difficulty).into());

    let mut event: NostrEvent = match serde_json::from_str(event_json) {
        Ok(e) => e,
        Err(err) => {
            console::log_1(&format!("JSON parsing error: {}", err).into());
            return to_value(&serde_json::json!({
                "error": format!("Invalid event JSON: {}", err)
            }))
            .unwrap_or(JsValue::NULL);
        }
    };

    if event.created_at.is_none() {
        let current_timestamp = js_sys::Date::now() as u64 / 1000; 
        event.created_at = Some(current_timestamp);
        console::log_1(&format!("Generated created_at: {}", current_timestamp).into());
    }

      let mut nonce_index = None;
      for (i, tag) in event.tags.iter().enumerate() {
          if tag.len() > 0 && tag[0] == "nonce" {
              nonce_index = Some(i);
              break;
          }
      }
      if nonce_index.is_none() {
          event.tags.push(vec!["nonce".to_string(), "0".to_string(), difficulty.to_string()]);
          nonce_index = Some(event.tags.len() - 1);
      }
  
      let report_progress = match report_progress.dyn_into::<Function>() {
          Ok(func) => func,
          Err(_) => {
              console::log_1(&"Failed to convert report_progress to Function".into());
              return to_value(&serde_json::json!({
                  "error": "Invalid progress callback."
              }))
              .unwrap_or(JsValue::NULL);
          }
      };
  
      let start_time = js_sys::Date::now();
      let mut nonce: u64 = 0;
      let mut total_hashes: u64 = 0;
  
      let report_interval = 100_000; 
      let mut last_report_time = start_time;
  
      loop {
          if let Some(index) = nonce_index {
              if let Some(tag) = event.tags.get_mut(index) {
                  if tag.len() >= 3 {
                      tag[1] = nonce.to_string();
                      tag[2] = difficulty.to_string();
                  }
              }
          }
  
          let hash_bytes = get_event_hash(&mut event);
          if hash_bytes.is_empty() {
              console::log_1(&"Failed to compute event hash.".into());
              return to_value(&serde_json::json!({
                  "error": "Failed to compute event hash."
              }))
              .unwrap_or(JsValue::NULL);
          }

          let pow = get_pow(&hash_bytes);
  
          total_hashes += 1;
  
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
              return to_value(&result).unwrap_or(JsValue::NULL);
          }
  
          nonce += 1;
  
          if nonce % report_interval == 0 {
            let current_time = js_sys::Date::now();
            let elapsed_time = (current_time - last_report_time) / 1000.0; 
            if elapsed_time > 0.0 {
                let hash_rate = report_interval as f64; 

                report_progress
                    .call2(&JsValue::NULL, &hash_rate.into(), &elapsed_time.into())
                    .unwrap_or_else(|err| {
                        console::log_1(
                            &format!("Error calling progress callback: {:?}", err).into(),
                        );
                        JsValue::NULL
                    });
                last_report_time = current_time;
            }
        }
  
          if nonce % 100_000 == 0 {
              console::log_1(&format!("Checked nonce up to: {}", nonce).into());
          }
      }
  }