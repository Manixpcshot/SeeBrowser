//! Per-tab navigation state: a small history stack per webview label so the
//! chrome UI knows whether Back/Forward are available (the native webviews
//! navigate via their own session history; we mirror it here).

use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
struct TabNav {
    history: Vec<String>,
    index: usize,
}

#[derive(Default)]
pub struct TabManager {
    tabs: Mutex<HashMap<String, TabNav>>,
}

impl TabManager {
    /// Records a top-level navigation. Returns (can_go_back, can_go_forward).
    pub fn record_nav(&self, label: &str, url: &str) -> (bool, bool) {
        let mut map = self.tabs.lock().unwrap();
        let st = map.entry(label.to_string()).or_default();

        let current = st.history.get(st.index).cloned();
        if current.as_deref() == Some(url) {
            return flags(st);
        }
        if st.index > 0 && st.history.get(st.index - 1).map(String::as_str) == Some(url) {
            st.index -= 1; // going back
        } else if st.history.get(st.index + 1).map(String::as_str) == Some(url) {
            st.index += 1; // going forward
        } else {
            if st.history.is_empty() {
                st.history.push(url.to_string());
                st.index = 0;
            } else {
                st.history.truncate(st.index + 1);
                st.history.push(url.to_string());
                st.index = st.history.len() - 1;
            }
        }
        flags(st)
    }

    pub fn forget(&self, label: &str) {
        self.tabs.lock().unwrap().remove(label);
    }
}

fn flags(st: &TabNav) -> (bool, bool) {
    (st.index > 0, st.index + 1 < st.history.len())
}
