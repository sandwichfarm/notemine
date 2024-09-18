use wasm_bindgen::prelude::*;
use shared_lib::{NostrEvent, MinedResult};
use js_sys::Function;
use web_sys::console;
use serde_wasm_bindgen;
use serde_json::json;
use futures::executor::block_on;
use wgpu::util::DeviceExt;
use hex;
use bytemuck::{Pod, Zeroable};

const COMPUTE_SHADER: &str = include_str!("compute_shader.wgsl");

#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

#[inline]
fn split_u64(value: u64) -> (u32, u32) {
    let low = (value & 0xFFFF_FFFF) as u32;
    let high = (value >> 32) as u32;
    (low, high)
}

#[inline]
fn combine_u32(low: u32, high: u32) -> u64 {
    ((high as u64) << 32) | (low as u64)
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
    match block_on(run_mining(
        event_json,
        difficulty,
        start_nonce_str,
        nonce_step_str,
        report_progress,
        should_cancel,
        send_event_with_best_pow,
        best_pow_threshold,
    )) {
        Ok(result) => serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL),
        Err(err) => serde_wasm_bindgen::to_value(&json!({ "error": err })).unwrap_or(JsValue::NULL),
    }
}

async fn run_mining(
    event_json: &str,
    difficulty: u32,
    start_nonce_str: &str,
    nonce_step_str: &str,
    report_progress: JsValue,
    should_cancel: JsValue,
    send_event_with_best_pow: bool,
    best_pow_threshold: Option<u32>,
) -> Result<MinedResult, String> {
    console::log_1(&"Starting mining with WebGPU...".into());

    let mut event: NostrEvent = serde_json::from_str(event_json)
        .map_err(|e| format!("JSON parsing error: {}", e))?;

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

    let report_progress = report_progress
        .dyn_into::<Function>()
        .map_err(|_| "Failed to convert report_progress to Function")?;

    let start_nonce: u64 = start_nonce_str.parse().unwrap_or(0);
    let nonce_step: u64 = nonce_step_str.parse().unwrap_or(1);

    let (device, queue) = init_webgpu()
        .await
        .map_err(|e| format!("WebGPU initialization error: {}", e))?;

    let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("Mining Compute Shader"),
        source: wgpu::ShaderSource::Wgsl(COMPUTE_SHADER.into()),
    });

    let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("Mining Compute Pipeline"),
        layout: None,
        module: &shader_module,
        entry_point: "main",
    });

    let event_serialized = serde_json::to_string(&event)
        .map_err(|e| format!("Serialization error: {}", e))?;
    let event_bytes = event_serialized.as_bytes();

    if event_bytes.len() > 256 {
        return Err("Serialized event exceeds 256 bytes. Please ensure it fits the shader's input buffer.".to_string());
    }

    let mut padded_event = [0u8; 256];
    padded_event[..event_bytes.len()].copy_from_slice(event_bytes);

    let mut event_u32 = [0u32; 64];
    for (i, chunk) in padded_event.chunks(4).enumerate().take(64) {
        event_u32[i] = u32::from_le_bytes([
            chunk.get(0).cloned().unwrap_or(0),
            chunk.get(1).cloned().unwrap_or(0),
            chunk.get(2).cloned().unwrap_or(0),
            chunk.get(3).cloned().unwrap_or(0),
        ]);
    }

    #[repr(C)]
    #[derive(Clone, Copy, Pod, Zeroable)]
    struct ShaderInput {
        event: [u32; 64], // 256 bytes
        start_nonce_low: u32,
        start_nonce_high: u32,
        nonce_step_low: u32,
        nonce_step_high: u32,
        difficulty: u32,
        send_event_with_best_pow: u32,
        best_pow_threshold: u32,
    }

    let (start_nonce_low, start_nonce_high) = split_u64(start_nonce);
    let (nonce_step_low, nonce_step_high) = split_u64(nonce_step);
    
    let shader_input = ShaderInput {
        event: event_u32,
        start_nonce_low,
        start_nonce_high,
        nonce_step_low,
        nonce_step_high,
        difficulty,
        send_event_with_best_pow: if send_event_with_best_pow { 1 } else { 0 },
        best_pow_threshold: best_pow_threshold.unwrap_or((difficulty as f32 * 0.8) as u32),
    };

    let input_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("Input Buffer"),
        contents: bytemuck::cast_slice(&[shader_input]),
        usage: wgpu::BufferUsages::STORAGE,
    });

    #[repr(C)]
    #[derive(Clone, Copy, Pod, Zeroable)]
    struct ShaderOutput {
        best_pow: u32,
        best_nonce_low: u32,
        best_nonce_high: u32,
        best_hash: [u8; 32],
        event_found: u32,
        event: [u32; 64],
    }

    let output_buffer_size = std::mem::size_of::<ShaderOutput>() as u64;
    let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Output Buffer"),
        size: output_buffer_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let bind_group_layout = compute_pipeline.get_bind_group_layout(0);
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        layout: &bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: input_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: output_buffer.as_entire_binding(),
            },
        ],
        label: Some("Bind Group"),
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Compute Command Encoder"),
    });

    {
        let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Compute Pass"),
        });
        compute_pass.set_pipeline(&compute_pipeline);
        compute_pass.set_bind_group(0, &bind_group, &[]);
        compute_pass.dispatch_workgroups(1, 1, 1);
    }

    queue.submit(Some(encoder.finish()));

    device.poll(wgpu::Maintain::Wait);

    let output_read_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Output Read Buffer"),
        size: output_buffer_size,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Read Command Encoder"),
    });

    encoder.copy_buffer_to_buffer(
        &output_buffer,
        0,
        &output_read_buffer,
        0,
        output_buffer_size,
    );

    queue.submit(Some(encoder.finish()));

    let buffer_slice = output_read_buffer.slice(..);
    let (sender, receiver) = futures_intrusive::channel::shared::oneshot_channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |v| sender.send(v).unwrap());
    device.poll(wgpu::Maintain::Wait);

    match receiver.receive().await {
        Some(Ok(())) => (),
        Some(Err(e)) => return Err(format!("Buffer async error: {:?}", e)),
        None => return Err("Failed to receive buffer data.".to_string()),
    }

    let data = buffer_slice.get_mapped_range();
    let output: ShaderOutput = bytemuck::cast_slice(&data)[0];
    drop(data);
    output_read_buffer.unmap();

    let best_nonce = combine_u32(output.best_nonce_low, output.best_nonce_high);

    if output.event_found == 1 {
        let mut event_bytes = [0u8; 256];
        for (i, word) in output.event.iter().enumerate() {
            event_bytes[i * 4] = (*word & 0xFF) as u8;
            event_bytes[i * 4 + 1] = ((*word >> 8) & 0xFF) as u8;
            event_bytes[i * 4 + 2] = ((*word >> 16) & 0xFF) as u8;
            event_bytes[i * 4 + 3] = ((*word >> 24) & 0xFF) as u8;
        }

        let event_str = match std::str::from_utf8(&event_bytes) {
            Ok(s) => s.trim_end_matches('\0'),
            Err(e) => {
                console::log_1(&format!("Conversion error: {}", e).into());
                return Err("Failed to convert event data from GPU.".to_string());
            }
        };

        let mined_event: NostrEvent = match serde_json::from_str(event_str) {
            Ok(e) => e,
            Err(e) => {
                console::log_1(&format!("Deserialization error: {}", e).into());
                return Err("Failed to deserialize event data from GPU.".to_string());
            }
        };

        if output.best_pow >= difficulty {
            let event_hash = hex::encode(&output.best_hash);
            let mut finalized_event = mined_event.clone();
            finalized_event.id = Some(event_hash.clone());

            let total_time = 0.0;
            let khs = 0.0;

            let result = MinedResult {
                event: finalized_event,
                total_time,
                khs,
            };
            console::log_1(&format!("Mined successfully with nonce: {}", best_nonce).into());
            return Ok(result);
        }
    }

    let progress = json!({
        "hashRate": 0.0,
        "nonce": best_nonce.to_string(),
        "bestPowData": {
            "best_pow": output.best_pow,
            "nonce": best_nonce.to_string(),
            "hash": hex::encode(&output.best_hash),
            "event": if send_event_with_best_pow && output.event_found == 1 {
                Some(event.clone())
            } else {
                None
            },
        },
    });

    report_progress
        .call2(
            &JsValue::NULL,
            &serde_wasm_bindgen::to_value(&progress).map_err(|e| format!("Serialization error: {}", e))?,
            &JsValue::NULL,
        )
        .map_err(|e| format!("Error calling progress callback: {:?}", e))?;

    Ok(MinedResult {
        event,
        total_time: 0.0,
        khs: 0.0,
    })
}

async fn init_webgpu() -> Result<(wgpu::Device, wgpu::Queue), String> {
    let instance = wgpu::Instance::default();

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .ok_or("Failed to find a suitable WebGPU adapter.")?;

    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("Mining Device"),
                features: wgpu::Features::empty(),
                limits: wgpu::Limits::default(),
            },
            None,
        )
        .await
        .map_err(|e| format!("Failed to create device: {:?}", e))?;

    Ok((device, queue))
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
