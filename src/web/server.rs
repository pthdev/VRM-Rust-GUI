use axum::{
    routing::{get, post},
    Router, Json, extract::{State, WebSocketUpgrade, ws::WebSocket},
    response::IntoResponse,
};
use tokio::sync::{broadcast, mpsc};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::vrm::reservation::reservation_store::ReservationStore;
use crate::vrm::vrm_manager::VrmCommand;

pub struct AppState {
    pub reservation_store: ReservationStore,
    pub ws_sender: broadcast::Sender<String>,
    pub command_sender: mpsc::Sender<VrmCommand>,
}

pub async fn start_web_server(state: Arc<AppState>, port: u16) {
    let app = Router::new()
        .route("/api/reservations", get(get_reservations))
        .route("/api/submit", post(submit_workflow))
        .route("/api/pause", post(pause_simulation))
        .route("/api/resume", post(resume_simulation))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    log::info!("GUI Web-API is running on http://0.0.0.0:{}", port);
    axum::serve(listener, app).await.unwrap();
}

async fn get_reservations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // In a real implementation, you would extract all reservations here and serialize them.
    // For now, returning a basic confirmation.
    Json(serde_json::json!({ "status": "ok", "message": "Store accessed successfully." }))
}

async fn submit_workflow(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Example endpoint to submit a command to the VrmManager
    // In the future this should parse a JSON payload and add it to the ReservationStore
    Json(serde_json::json!({ "status": "not_implemented", "message": "Workflow parsing logic needs to be added here." }))
}

async fn pause_simulation(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    if let Err(_) = state.command_sender.send(VrmCommand::PauseSimulation).await {
        return Json(serde_json::json!({ "status": "error", "message": "Failed to send command to VRM Manager." }));
    }
    Json(serde_json::json!({ "status": "paused" }))
}

async fn resume_simulation(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    if let Err(_) = state.command_sender.send(VrmCommand::ResumeSimulation).await {
        return Json(serde_json::json!({ "status": "error", "message": "Failed to send command to VRM Manager." }));
    }
    Json(serde_json::json!({ "status": "resumed" }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let rx = state.ws_sender.subscribe();
    ws.on_upgrade(move |socket| handle_socket(socket, rx))
}

async fn handle_socket(mut socket: WebSocket, mut rx: broadcast::Receiver<String>) {
    while let Ok(msg) = rx.recv().await {
        if socket.send(axum::extract::ws::Message::Text(msg.into())).await.is_err() {
            log::info!("WebSocket client disconnected.");
            break; 
        }
    }
}
