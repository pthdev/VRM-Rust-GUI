use serde_json::json;
use tokio::sync::broadcast;

use crate::vrm::reservation::reservation_notification_listener::ReservationNotificationListener;
use crate::vrm::reservation::reservation_store::ReservationId;
use crate::vrm::common::id::ReservationName;
use crate::vrm::reservation::reservation::ReservationState;

#[derive(Debug)]
pub struct WebsocketStateListener {
    pub tx: broadcast::Sender<String>,
}

impl ReservationNotificationListener for WebsocketStateListener {
    fn on_reservation_change(
        &mut self,
        reservation_id: ReservationId,
        res_name: ReservationName,
        old_state: ReservationState,
        new_state: ReservationState,
    ) {
        let event = json!({
            "type": "RESERVATION_STATE_CHANGED",
            "payload": {
                "id": format!("{:?}", reservation_id),
                "name": res_name,
                "old_state": format!("{:?}", old_state),
                "new_state": format!("{:?}", new_state),
            }
        });

        // Send to all connected WebSocket clients. Ignore errors if no one is listening.
        let _ = self.tx.send(event.to_string());
    }
}
