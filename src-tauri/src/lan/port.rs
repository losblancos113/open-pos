use std::net::TcpListener;

/// Checks if a TCP port on localhost is available for binding.
#[tauri::command]
pub fn check_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Finds an available TCP port starting from `start_port` (defaulting to 8080).
/// Scans up to 65535, or falls back to an ephemeral port allocated by the OS.
#[tauri::command]
pub fn find_available_port(start_port: Option<u16>) -> Result<u16, String> {
    let start = start_port.unwrap_or(8080);
    for port in start..=65535 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }

    // Fallback: request an ephemeral port from the OS
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| format!("Failed to find any available port: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_port_available_unbound() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
        let free_port = listener.local_addr().expect("local addr").port();
        drop(listener);

        assert!(check_port_available(free_port));
    }

    #[test]
    fn test_check_port_available_bound() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
        let busy_port = listener.local_addr().expect("local addr").port();

        // While listener is held, the port is bound and should not be available
        assert!(!check_port_available(busy_port));
        drop(listener);
    }

    #[test]
    fn test_find_available_port_skips_bound_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
        let busy_port = listener.local_addr().expect("local addr").port();

        let found_port = find_available_port(Some(busy_port)).expect("found port");
        assert_ne!(found_port, busy_port);
        assert!(found_port > busy_port);
        drop(listener);
    }

    #[test]
    fn test_find_available_port_default() {
        let port = find_available_port(None).expect("found port with default");
        assert!(port >= 8080);
    }
}
